"""
PPO training with NFSP-inspired opponent pool.

Plays games through the TS game engine bridge with mixed opponents
(self-play, greedy, random, average policy). Only self-play seats
collect PPO training data. An average policy network is trained via
supervised learning on the best-response agent's decisions (NFSP).

See docs/rl-training-design.md Section 5B.

Usage:
    python train_ppo.py --epochs 1000 [--batch-size 2048] [--output model.pt]
    python train_ppo.py --epochs 1000 --no-opponent-pool  # pure self-play (legacy)
"""

import argparse
import csv
import os
import random
import time
from datetime import datetime

import numpy as np
import torch
import torch.nn as nn

from features import encode_state, encode_action, encode_pass_action, STATE_SIZE, ACTION_SIZE
from model import TienLenNet
from game_bridge import GameBridge, TurnInfo, GameOver
from game_logger import GameLogger, GameRecord


# ── Trajectory storage ───────────────────────────────────────────────────────

class TrajectoryBuffer:
    """Stores (state, action, log_prob, value, reward) per decision point per player."""

    def __init__(self):
        self.states: list[np.ndarray] = []
        self.action_features: list[np.ndarray] = []  # (max_actions, ACTION_SIZE)
        self.action_masks: list[np.ndarray] = []       # (max_actions,)
        self.action_indices: list[int] = []
        self.log_probs: list[float] = []
        self.values: list[float] = []
        self.rewards: list[float] = []
        # For GAE: track episode boundaries
        self.dones: list[bool] = []

    def add(
        self,
        state: np.ndarray,
        action_features: np.ndarray,
        action_mask: np.ndarray,
        action_index: int,
        log_prob: float,
        value: float,
    ):
        self.states.append(state)
        self.action_features.append(action_features)
        self.action_masks.append(action_mask)
        self.action_indices.append(action_index)
        self.log_probs.append(log_prob)
        self.values.append(value)
        self.rewards.append(0.0)  # filled in at game end
        self.dones.append(False)

    def assign_rewards(self, start_idx: int, end_idx: int, reward: float):
        """Assign terminal reward to the final step only; GAE propagates it backward."""
        if end_idx > start_idx:
            self.rewards[end_idx - 1] += reward
            self.dones[end_idx - 1] = True

    def extend(self, other: "TrajectoryBuffer"):
        """Append another buffer's contents (must be a contiguous episode)."""
        self.states.extend(other.states)
        self.action_features.extend(other.action_features)
        self.action_masks.extend(other.action_masks)
        self.action_indices.extend(other.action_indices)
        self.log_probs.extend(other.log_probs)
        self.values.extend(other.values)
        self.rewards.extend(other.rewards)
        self.dones.extend(other.dones)

    def size(self) -> int:
        return len(self.states)

    def to_tensors(self, device: torch.device):
        return (
            torch.from_numpy(np.stack(self.states)).to(device),
            torch.from_numpy(np.stack(self.action_features)).to(device),
            torch.from_numpy(np.stack(self.action_masks)).to(device),
            torch.tensor(self.action_indices, dtype=torch.long, device=device),
            torch.tensor(self.log_probs, dtype=torch.float32, device=device),
            torch.tensor(self.values, dtype=torch.float32, device=device),
            torch.tensor(self.rewards, dtype=torch.float32, device=device),
            torch.tensor(self.dones, dtype=torch.bool, device=device),
        )


class ReservoirBuffer:
    """
    Reservoir sampling buffer for NFSP average policy training.
    Stores (state, action_features, action_mask, chosen_action_index).
    Uses Algorithm R for uniform sampling over all decisions ever seen.
    """

    def __init__(self, capacity: int = 50_000):
        self.capacity = capacity
        self.buffer: list[tuple[np.ndarray, np.ndarray, np.ndarray, int]] = []
        self.total_seen = 0

    def add(self, state: np.ndarray, action_features: np.ndarray,
            action_mask: np.ndarray, action_index: int):
        self.total_seen += 1
        if len(self.buffer) < self.capacity:
            self.buffer.append((state, action_features, action_mask, action_index))
        else:
            j = random.randrange(self.total_seen)
            if j < self.capacity:
                self.buffer[j] = (state, action_features, action_mask, action_index)

    def sample(self, batch_size: int) -> tuple[torch.Tensor, ...]:
        """Sample a minibatch and return tensors."""
        indices = random.sample(range(len(self.buffer)), min(batch_size, len(self.buffer)))
        states = np.stack([self.buffer[i][0] for i in indices])
        action_feats = np.stack([self.buffer[i][1] for i in indices])
        action_masks = np.stack([self.buffer[i][2] for i in indices])
        action_indices = np.array([self.buffer[i][3] for i in indices], dtype=np.int64)

        return (
            torch.from_numpy(states),
            torch.from_numpy(action_feats),
            torch.from_numpy(action_masks),
            torch.from_numpy(action_indices),
        )

    def size(self) -> int:
        return len(self.buffer)


# ── Helper functions ─────────────────────────────────────────────────────────

POSITION_SCALE = 1.5
POSITION_REWARDS = {
    0: 2.25 * POSITION_SCALE,
    1: 0.25 * POSITION_SCALE,
    2: -0.75 * POSITION_SCALE,
    3: -1.75 * POSITION_SCALE
}
MAX_ACTIONS = 80

# Reward shaping (small intermediate signals, < 5% of terminal reward)
CARD_PLAY_REWARD = 0.02       # per card played, weighted by card weakness — encourages shedding garbage
POWER_GAIN_REWARD = 0.025     # winning a trick — flat reward for gaining control
# HAND_ADVANTAGE_REWARD = 0.005 # per turn, scaled by relative card count — disabled, redundant with terminal
# OPPONENT_OUT_PENALTY = -0.1 # immediate penalty when an opponent finishes — disabled, noisy proxy


def encode_turn(turn: TurnInfo, player: int):
    """Encode a turn into state features and padded action features.

    Pass is always included when available — play actions are truncated
    to MAX_ACTIONS-1 to reserve a slot for it.
    """
    state = encode_state(turn.state, player)

    # Reserve a slot for pass so it's never truncated
    max_play_slots = MAX_ACTIONS - 1 if turn.can_pass else MAX_ACTIONS
    action_list = [encode_action(cards) for cards in turn.valid_actions[:max_play_slots]]
    if turn.can_pass:
        action_list.append(encode_pass_action())

    num_actions = len(action_list)
    action_features = np.zeros((MAX_ACTIONS, ACTION_SIZE), dtype=np.float32)
    action_mask = np.zeros(MAX_ACTIONS, dtype=np.bool_)

    for i, af in enumerate(action_list):
        action_features[i] = af
        action_mask[i] = True

    return state, action_features, action_mask, num_actions


def to_bridge_action(action_index: int, num_actions: int, turn: TurnInfo) -> int:
    """Translate encoded action index to bridge coordinate.

    The encoded action space may have truncated play actions, so the pass
    index in encoded space (num_actions-1) may differ from the bridge's
    pass index (len(valid_actions)).
    """
    if turn.can_pass and action_index == num_actions - 1:
        return len(turn.valid_actions)  # pass in TS coordinates
    return action_index


def select_action(
    model: TienLenNet,
    state: np.ndarray,
    action_features: np.ndarray,
    action_mask: np.ndarray,
    num_actions: int,
    device: torch.device,
) -> tuple[int, float, float]:
    """Select action using the model policy. Returns (action_index, log_prob, value)."""
    with torch.no_grad():
        state_t = torch.from_numpy(state).unsqueeze(0).to(device)
        actions_t = torch.from_numpy(action_features).unsqueeze(0).to(device)
        mask_t = torch.from_numpy(action_mask).unsqueeze(0).to(device)

        scores = model(state_t, actions_t)
        scores = scores.masked_fill(~mask_t, float("-inf"))

        # Softmax over valid actions to get policy
        probs = torch.softmax(scores[0, :num_actions], dim=0)
        dist = torch.distributions.Categorical(probs)
        action = dist.sample()

        log_prob = dist.log_prob(action).item()
        value = model.value(state_t).item()

        return action.item(), log_prob, value


# ── Opponent pool ────────────────────────────────────────────────────────────

# Early distribution (first 10% of epochs): heavy greedy for stable learning signal
EARLY_DIST = {"self": 0.2, "greedy": 0.6, "random": 0.1, "average": 0.1}

# Late distribution (after 10% of epochs): NFSP-dominated, greedy residual
LATE_DIST = {"self": 0.4, "greedy": 0.05, "random": 0.0, "average": 0.55}


def get_opponent_dist(epoch: int, total_epochs: int, resumed: bool = False) -> dict[str, float]:
    """Linearly interpolate between EARLY_DIST and LATE_DIST over first 10% of epochs."""
    if resumed:
        return LATE_DIST
    transition_end = max(int(total_epochs * 0.1), 1)
    if epoch >= transition_end:
        return LATE_DIST
    t = epoch / transition_end
    return {k: EARLY_DIST[k] * (1 - t) + LATE_DIST[k] * t for k in EARLY_DIST}


def sample_opponents(dist: dict[str, float]) -> dict[int, str]:
    """
    Sample opponent types for seats 1-3.
    Seat 0 is always 'self'. Guarantees 2-3 self seats total (1-2 non-self opponents)
    so more training data is collected per game.
    """
    non_self_types = [t for t in dist if t != "self"]
    non_self_weights = [dist[t] for t in non_self_types]

    # 1 or 2 non-self seats (so 3 or 2 self seats total)
    num_non_self = random.choices([1, 2], weights=[0.5, 0.5])[0]
    non_self_seats = random.sample(range(1, 4), num_non_self)

    return {
        seat: (random.choices(non_self_types, weights=non_self_weights, k=1)[0]
               if seat in non_self_seats else "self")
        for seat in range(1, 4)
    }


def select_action_average(
    avg_model: TienLenNet,
    state: np.ndarray,
    action_features: np.ndarray,
    action_mask: np.ndarray,
    num_actions: int,
    device: torch.device,
) -> int:
    """Select action using average policy (sample from softmax, no value/log_prob)."""
    with torch.no_grad():
        state_t = torch.from_numpy(state).unsqueeze(0).to(device)
        actions_t = torch.from_numpy(action_features).unsqueeze(0).to(device)
        mask_t = torch.from_numpy(action_mask).unsqueeze(0).to(device)

        scores = avg_model(state_t, actions_t)
        scores = scores.masked_fill(~mask_t, float("-inf"))
        probs = torch.softmax(scores[0, :num_actions], dim=0)
        action = torch.distributions.Categorical(probs).sample()
        return action.item()


def compute_gae(
    rewards: torch.Tensor,
    values: torch.Tensor,
    dones: torch.Tensor,
    gamma: float = 0.99,
    lam: float = 0.95,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Compute Generalized Advantage Estimation."""
    n = len(rewards)
    advantages = torch.zeros(n, device=rewards.device)
    last_gae = 0.0

    for t in reversed(range(n)):
        if t == n - 1 or dones[t]:
            next_value = 0.0
        else:
            next_value = values[t + 1].item()

        delta = rewards[t] + gamma * next_value - values[t]
        if dones[t]:
            last_gae = 0.0
        advantages[t] = last_gae = delta + gamma * lam * last_gae

    returns = advantages + values
    return advantages, returns


# ── Data collection ──────────────────────────────────────────────────────────

def collect_trajectories(
    bridge: GameBridge,
    model: TienLenNet,
    device: torch.device,
    target_steps: int,
    use_shaping: bool = True,
    avg_model: TienLenNet | None = None,
    opponent_dist: dict[str, float] | None = None,
    reservoir: ReservoirBuffer | None = None,
) -> tuple[TrajectoryBuffer, dict]:
    """Play games with mixed opponents, collect PPO data from self-seats only."""
    buf = TrajectoryBuffer()
    games_played = 0
    total_moves = 0
    opponent_counts: dict[str, int] = {"self": 0, "greedy": 0, "random": 0, "average": 0}

    # Pure self-play fallback (--no-opponent-pool)
    pure_self_play = opponent_dist is None

    while buf.size() < target_steps:
        # Assign opponent types for seats 1-3
        if pure_self_play:
            seat_types: dict[int, str] = {s: "self" for s in range(4)}
            greedy_seats: list[int] = []
        else:
            assignments = sample_opponents(opponent_dist)
            seat_types = {0: "self", **assignments}
            greedy_seats = [s for s, t in seat_types.items() if t == "greedy"]

        # Track opponent mix
        for t in seat_types.values():
            opponent_counts[t] = opponent_counts.get(t, 0) + 1

        # Only self-seats collect PPO data
        self_seats = {s for s, t in seat_types.items() if t == "self"}
        player_bufs = {p: TrajectoryBuffer() for p in self_seats}

        result = bridge.new_game(greedy_seats=greedy_seats if greedy_seats else None)

        # Edge case: all greedy seats finish before any non-greedy turn
        if isinstance(result, GameOver):
            games_played += 1
            continue
        turn = result
        prev_can_pass = False
        # Track hand sizes to detect when players go out mid-game
        prev_hand_sizes = {p: len(turn.state["hands"][p]) for p in range(4)}
        finish_position = 0  # next position to assign (0=1st, 1=2nd, ...)

        while True:
            player = turn.player
            seat_type = seat_types.get(player, "self")

            state, action_features, action_mask, num_actions = encode_turn(turn, player)

            if seat_type == "self":
                # Current policy — collect PPO data
                action_index, log_prob, value = select_action(
                    model, state, action_features, action_mask, num_actions, device
                )

                shaping = 0.0
                if use_shaping:
                    is_pass = turn.can_pass and action_index == num_actions - 1
                    if not is_pass:
                        # Reward shedding cards, weighted by how weak they are.
                        # Low cards (3-7) are dead weight — high reward to dump them.
                        # High cards (A, 2) are valuable — less reward for spending them.
                        # rank: 0=3, 1=4, ... 11=A, 12=2
                        cards = turn.valid_actions[action_index]
                        for card in cards:
                            weight = (12 - card["rank"]) / 12  # 3→1.0, 2→0.0
                            shaping += CARD_PLAY_REWARD * weight

                    # # Hand advantage: disabled — redundant with terminal reward
                    # hands = turn.state["hands"]
                    # my_cards = len(hands[player])
                    # opp_cards = [
                    #     len(hands[p])
                    #     for p in range(len(hands))
                    #     if p != player
                    # ]
                    # min_opp_cards = min(opp_cards)
                    # delta = min_opp_cards - my_cards
                    # delta = max(-5, min(5, delta))  # clip
                    # shaping += HAND_ADVANTAGE_REWARD * delta / 13.0

                player_bufs[player].add(
                    state, action_features, action_mask, action_index, log_prob, value
                )
                player_bufs[player].rewards[-1] = shaping

                # Store in reservoir for average policy training
                if reservoir is not None:
                    reservoir.add(state, action_features, action_mask, action_index)

            elif seat_type == "random":
                action_index = random.randrange(num_actions)

            elif seat_type == "average" and avg_model is not None:
                action_index = select_action_average(
                    avg_model, state, action_features, action_mask, num_actions, device
                )
            else:
                # Fallback (average with no model yet) → random
                action_index = random.randrange(num_actions)

            total_moves += 1
            result = bridge.step(to_bridge_action(action_index, num_actions, turn))

            if isinstance(result, GameOver):
                # Assign position rewards for any players not yet rewarded
                # (the last two finish simultaneously at game_over)
                for position, player_id in enumerate(result.win_order):
                    if player_id in player_bufs:
                        pb = player_bufs[player_id]
                        if pb.size() > 0:
                            # Only add position reward if not already assigned mid-game
                            if position >= finish_position:
                                pb.rewards[-1] += POSITION_REWARDS[position]
                            pb.dones[-1] = True
                        buf.extend(pb)
                games_played += 1
                break

            # Detect players who just went out (hand dropped to 0)
            assert isinstance(result, TurnInfo)
            curr_hand_sizes = {p: len(result.state["hands"][p]) for p in range(4)}
            for p in range(4):
                if prev_hand_sizes[p] > 0 and curr_hand_sizes[p] == 0:
                    position = finish_position
                    finish_position += 1

                    # Immediate position reward for self-seats that just finished
                    if p in player_bufs and player_bufs[p].size() > 0:
                        player_bufs[p].rewards[-1] += POSITION_REWARDS[position]

                    # # Distribute penalty across all prior turns — disabled, noisy proxy
                    # if use_shaping:
                    #     for s in self_seats:
                    #         if s != p and curr_hand_sizes[s] > 0 and player_bufs[s].size() > 0:
                    #             n_steps = player_bufs[s].size()
                    #             per_step = OPPONENT_OUT_PENALTY / n_steps
                    #             for i in range(n_steps):
                    #                 player_bufs[s].rewards[i] += per_step

            prev_hand_sizes = curr_hand_sizes

            # Power gain shaping — flat reward for seizing control
            if use_shaping and not result.can_pass and prev_can_pass:
                power_player = result.player
                if power_player in player_bufs and player_bufs[power_player].size() > 0:
                    player_bufs[power_player].rewards[-1] += POWER_GAIN_REWARD

            prev_can_pass = result.can_pass
            turn = result

    stats = {
        "games": games_played,
        "steps": buf.size(),
        "avg_moves": total_moves / max(games_played, 1),
        "opponent_counts": opponent_counts,
    }
    return buf, stats


# ── PPO update ───────────────────────────────────────────────────────────────

def ppo_update(
    model: TienLenNet,
    optimizer: torch.optim.Optimizer,
    buf: TrajectoryBuffer,
    device: torch.device,
    ppo_epochs: int = 2,
    clip_ratio: float = 0.2,
    entropy_coef: float = 0.05,
    entropy_target: float = 0.5,
    value_coef: float = 0.5,
    max_grad_norm: float = 0.5,
    minibatch_size: int = 512,
) -> dict:
    """Run PPO policy update on collected trajectories with minibatching."""
    (
        states, actions_feat, action_masks, action_indices,
        old_log_probs, old_values, rewards, dones
    ) = buf.to_tensors(device)

    advantages, returns = compute_gae(rewards, old_values, dones)
    # Normalize returns to stabilize value targets against non-stationary opponent mix
    returns = (returns - returns.mean()) / (returns.std() + 1e-8) * old_values.std() + old_values.mean()
    advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

    n = states.shape[0]
    total_policy_loss = 0.0
    total_value_loss = 0.0
    total_entropy = 0.0
    total_kl = 0.0
    num_updates = 0

    for _ in range(ppo_epochs):
        perm = torch.randperm(n, device=device)
        for start in range(0, n, minibatch_size):
            mb = perm[start:start + minibatch_size]

            scores = model(states[mb], actions_feat[mb])
            scores = scores.masked_fill(~action_masks[mb], float("-inf"))

            log_probs_all = torch.log_softmax(scores, dim=-1)
            new_log_probs = log_probs_all.gather(1, action_indices[mb].unsqueeze(1)).squeeze(1)

            # Approximate KL: E[log π_old - log π_new]
            approx_kl = (old_log_probs[mb] - new_log_probs).mean()

            ratio = torch.exp(new_log_probs - old_log_probs[mb])
            surr1 = ratio * advantages[mb]
            surr2 = torch.clamp(ratio, 1.0 - clip_ratio, 1.0 + clip_ratio) * advantages[mb]
            policy_loss = -torch.min(surr1, surr2).mean()

            new_values = model.value(states[mb]).squeeze(-1)
            # Clipped value loss: prevent large value jumps from non-stationary opponents
            value_clipped = old_values[mb] + torch.clamp(
                new_values - old_values[mb], -clip_ratio, clip_ratio
            )
            v_loss1 = (new_values - returns[mb]) ** 2
            v_loss2 = (value_clipped - returns[mb]) ** 2
            value_loss = torch.max(v_loss1, v_loss2).mean()

            probs = torch.softmax(scores, dim=-1)
            probs = probs.clamp(min=1e-8)
            entropy = -(probs * torch.log(probs)).sum(dim=-1).mean()

            # Adaptive entropy: boost coefficient when entropy drops below target
            effective_entropy_coef = entropy_coef * max(
                1.0, entropy_target / max(entropy.item(), 1e-8)
            )
            loss = policy_loss + value_coef * value_loss - effective_entropy_coef * entropy

            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
            optimizer.step()

            total_policy_loss += policy_loss.item()
            total_value_loss += value_loss.item()
            total_entropy += entropy.item()
            total_kl += approx_kl.item()
            num_updates += 1

    return {
        "policy_loss": total_policy_loss / num_updates,
        "value_loss": total_value_loss / num_updates,
        "entropy": total_entropy / num_updates,
        "kl": total_kl / num_updates,
    }


# ── NFSP average policy training ─────────────────────────────────────────────

def train_average_policy(
    avg_model: TienLenNet,
    avg_optimizer: torch.optim.Optimizer,
    reservoir: ReservoirBuffer,
    device: torch.device,
    num_updates: int = 4,
    batch_size: int = 512,
) -> dict:
    """
    Train average policy via cross-entropy on reservoir buffer samples.
    Called after each PPO update.
    """
    if reservoir.size() < batch_size:
        return {"avg_loss": 0.0, "avg_updates": 0}

    avg_model.train()
    total_loss = 0.0

    for _ in range(num_updates):
        states, action_feats, action_masks, action_indices = reservoir.sample(batch_size)
        states = states.to(device)
        action_feats = action_feats.to(device)
        action_masks = action_masks.to(device)
        action_indices = action_indices.to(device)

        scores = avg_model(states, action_feats)
        scores = scores.masked_fill(~action_masks, float("-inf"))

        log_probs = torch.log_softmax(scores, dim=-1)
        loss = -log_probs.gather(1, action_indices.unsqueeze(1)).squeeze(1).mean()

        avg_optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(avg_model.parameters(), 0.5)
        avg_optimizer.step()

        total_loss += loss.item()

    return {
        "avg_loss": total_loss / num_updates,
        "avg_updates": num_updates,
    }


# ── Inline evaluation ────────────────────────────────────────────────────────

def eval_vs_greedy(
    bridge: GameBridge,
    model: TienLenNet,
    device: torch.device,
    games: int = 100,
    logger: GameLogger | None = None,
    eval_num: int = 0,
) -> tuple[float, float, list[GameRecord]]:  # (win_rate, avg_ppg, records)
    """
    Play model (seat 0) vs 3 greedy bots. Returns (win_rate, avg_ppg, game_records).
    Uses the PyTorch model directly (no ONNX export needed).
    """
    import random

    model.eval()
    wins = 0
    total_ppg = 0.0
    records: list[GameRecord] = []

    for g in range(games):
        # Randomize model seat
        model_seat = random.randrange(4)
        greedy_seats = [s for s in range(4) if s != model_seat]

        if logger:
            logger.start_game(eval_num, g, model_seat)

        result = bridge.new_game(greedy_seats=greedy_seats)

        while not isinstance(result, GameOver):
            turn = result
            state, action_features, action_mask, num_actions = encode_turn(turn, turn.player)

            # Use argmax (greedy) instead of sampling for eval
            with torch.no_grad():
                state_t = torch.from_numpy(state).unsqueeze(0).to(device)
                actions_t = torch.from_numpy(action_features).unsqueeze(0).to(device)
                mask_t = torch.from_numpy(action_mask).unsqueeze(0).to(device)
                scores = model(state_t, actions_t)
                scores = scores.masked_fill(~mask_t, float("-inf"))
                action_index = scores[0, :num_actions].argmax().item()

                # Compute softmax probs for logging
                probs_np = None
                if logger:
                    probs = torch.softmax(scores[0, :num_actions], dim=0)
                    probs_np = probs.cpu().numpy()

            if logger:
                logger.record_move(
                    turn.state, turn.player, turn.valid_actions, turn.can_pass,
                    action_index, num_actions, probs_np, is_model=True,
                )

            result = bridge.step(to_bridge_action(action_index, num_actions, turn))

        if isinstance(result, GameOver):
            position = result.win_order.index(model_seat)  # 0-indexed
            ppg_table = {0: 4, 1: 2, 2: 1, 3: 0}
            total_ppg += ppg_table[position]
            if position == 0:
                wins += 1
            if logger:
                records.append(logger.end_game(result.win_order))

    if logger and records:
        logger.write_eval_batch(eval_num, records)

    model.train()
    return wins / games, total_ppg / games, records


# ── Main ─────────────────────────────────────────────────────────────────────

def train(
    epochs: int = 1000,
    batch_size: int = 2048,
    lr: float = 3e-4,
    output_dir: str = ".",
    ppo_epochs: int = 2,
    clip_ratio: float = 0.2,
    entropy_coef: float = 0.05,
    entropy_target: float = 0.5,
    eval_interval: int = 100,
    eval_games: int = 100,
    use_shaping: bool = True,
    minibatch_size: int = 512,
    no_opponent_pool: bool = False,
    reservoir_capacity: int = 50_000,
    avg_lr: float = 1e-3,
    avg_updates: int = 4,
    resume_model: str | None = None,
    resume_avg_model: str | None = None,
):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on {device}")

    use_nfsp = not no_opponent_pool
    mode = "nfsp" if use_nfsp else "selfplay"

    # Build run directory: {output_dir}/{YYYYMMDD}-{HHMM}-{prefix}/
    e_str = str(entropy_coef).replace("0.", "").replace(".", "")
    run_prefix = f"ppo-{mode}-ep{epochs}-b{batch_size}-e{e_str}{'-shaping' if use_shaping else ''}"
    timestamp = datetime.now().strftime("%Y%m%d-%H%M")
    run_dir = os.path.join(output_dir, f"{timestamp}-{run_prefix}")
    os.makedirs(run_dir, exist_ok=True)
    model_path = os.path.join(run_dir, "model.pt")
    model_latest_path = os.path.join(run_dir, "model-latest.pt")
    avg_model_path = os.path.join(run_dir, "avg-model.pt")
    epoch_csv_path = os.path.join(run_dir, "epoch-stats.csv")
    eval_csv_path = os.path.join(run_dir, "eval-stats.csv")
    print(f"Run prefix: {run_prefix}")
    print(f"Run dir: {run_dir}")

    model = TienLenNet().to(device)
    if resume_model:
        model.load_state_dict(torch.load(resume_model, map_location=device, weights_only=True))
        print(f"Resumed model from {resume_model}")

    # Separate learning rates: slower for value head to stabilize against non-stationary opponents
    value_params = list(model.value_head.parameters())
    value_param_ids = {id(p) for p in value_params}
    policy_params = [p for p in model.parameters() if id(p) not in value_param_ids]
    optimizer = torch.optim.Adam([
        {"params": policy_params, "lr": lr},
        {"params": value_params, "lr": lr * 0.3},
    ])

    # NFSP: average policy + reservoir buffer
    avg_model: TienLenNet | None = None
    avg_optimizer: torch.optim.Adam | None = None
    reservoir: ReservoirBuffer | None = None
    if use_nfsp:
        avg_model = TienLenNet()
        avg_model = avg_model.to(device)
        if resume_avg_model:
            avg_model.load_state_dict(torch.load(resume_avg_model, map_location=device, weights_only=True))
            print(f"Resumed avg model from {resume_avg_model}")
        assert avg_model is not None
        avg_optimizer = torch.optim.Adam(avg_model.parameters(), lr=avg_lr)
        reservoir = ReservoirBuffer(capacity=reservoir_capacity)
        avg_param_count = sum(p.numel() for p in avg_model.parameters())
        print(f"NFSP: average policy ({avg_param_count:,} params), reservoir capacity={reservoir_capacity:,}")

    param_count = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {param_count:,}")
    print(f"Mode: {mode} | Reward shaping: {'ON' if use_shaping else 'OFF'}")
    print(f"Eval: every {eval_interval} epochs, {eval_games} games vs greedy")

    best_score = -999.0
    best_win_rate = -1.0
    best_avg_ppg = 0.0
    entropy_window: list[float] = []
    prev_entropy_mean: float | None = None
    eval_num = 0
    logger = GameLogger(run_dir)

    with (
        open(epoch_csv_path, "w", newline="") as epoch_f,
        open(eval_csv_path, "w", newline="") as eval_f,
        GameBridge() as bridge,
    ):
        epoch_writer = csv.writer(epoch_f)
        epoch_header = [
            "epoch", "policy_loss", "value_loss", "entropy", "kl",
            "games", "elapsed_s",
        ]
        if use_nfsp:
            epoch_header.extend(["avg_loss", "reservoir_size", "opponent_mix"])
        epoch_writer.writerow(epoch_header)

        eval_writer = csv.writer(eval_f)
        eval_writer.writerow([
            "eval_num", "epoch", "win_rate", "avg_ppg", "score",
            "best_win_rate", "best_avg_ppg", "best_score",
            "entropy_mean", "entropy_min", "entropy_max", "entropy_trend",
        ])

        for epoch in range(epochs):
            t0 = time.time()

            # Schedule opponent distribution
            opponent_dist = get_opponent_dist(epoch, epochs, resumed=bool(resume_model)) if use_nfsp else None

            if use_nfsp and avg_model is not None:
                avg_model.eval()

            # Collect trajectories
            buf, collect_stats = collect_trajectories(
                bridge, model, device, batch_size, use_shaping,
                avg_model=avg_model,
                opponent_dist=opponent_dist,
                reservoir=reservoir,
            )
            t_collect = time.time() - t0

            # PPO update
            t1 = time.time()
            update_stats = ppo_update(
                model, optimizer, buf, device,
                ppo_epochs=ppo_epochs,
                clip_ratio=clip_ratio,
                entropy_coef=entropy_coef,
                entropy_target=entropy_target,
                minibatch_size=minibatch_size,
            )
            t_update = time.time() - t1

            # Average policy update (NFSP)
            avg_stats: dict = {"avg_loss": 0.0, "avg_updates": 0}
            t_avg = 0.0
            if use_nfsp and avg_model is not None and avg_optimizer is not None and reservoir is not None:
                t2 = time.time()
                avg_stats = train_average_policy(
                    avg_model, avg_optimizer, reservoir, device,
                    num_updates=avg_updates, batch_size=minibatch_size,
                )
                t_avg = time.time() - t2

            elapsed = t_collect + t_update + t_avg
            entropy_window.append(update_stats["entropy"])

            # Build opponent mix string for logging
            opp_counts = collect_stats.get("opponent_counts", {})
            opp_total = sum(opp_counts.values()) or 1
            opp_str = " ".join(
                f"{k[0].upper()}:{v/opp_total:.0%}" for k, v in sorted(opp_counts.items())
            ) if opp_counts else "pure"

            epoch_row = [
                epoch + 1,
                f"{update_stats['policy_loss']:.6f}",
                f"{update_stats['value_loss']:.6f}",
                f"{update_stats['entropy']:.6f}",
                f"{update_stats['kl']:.6f}",
                collect_stats["games"],
                f"{elapsed:.2f}",
            ]
            if use_nfsp:
                epoch_row.extend([
                    f"{avg_stats['avg_loss']:.6f}",
                    reservoir.size() if reservoir else 0,
                    opp_str,
                ])
            epoch_writer.writerow(epoch_row)
            epoch_f.flush()

            nfsp_suffix = ""
            if use_nfsp:
                nfsp_suffix = (
                    f" | avg_loss: {avg_stats['avg_loss']:.4f}"
                    f" | opp: {opp_str}"
                )

            print(
                f"Epoch {epoch + 1:4d}/{epochs} | "
                f"policy_loss: {update_stats['policy_loss']:.4f} | "
                f"value_loss: {update_stats['value_loss']:.4f} | "
                f"entropy: {update_stats['entropy']:.3f} | "
                f"kl: {update_stats['kl']:.4f} | "
                f"collect={t_collect:.1f}s update={t_update:.1f}s"
                f"{nfsp_suffix}"
            )

            # Save latest model every epoch for resuming
            torch.save(model.state_dict(), model_latest_path)

            # Periodic evaluation vs greedy
            if (epoch + 1) % eval_interval == 0 or epoch == epochs - 1:
                eval_num += 1
                win_rate, avg_ppg, _ = eval_vs_greedy(
                    bridge, model, device, eval_games,
                    logger=logger, eval_num=eval_num,
                )
                # Combined score: win_rate + normalized avg_ppg
                # avg_ppg in [0,4], random baseline = 1.75
                score = win_rate + avg_ppg / 4.0

                n = len(entropy_window)
                e_mean = sum(entropy_window) / n
                e_min = min(entropy_window)
                e_max = max(entropy_window)
                if prev_entropy_mean is not None:
                    trend = e_mean - prev_entropy_mean
                    trend_str = f"{'↑' if trend > 0.01 else '↓' if trend < -0.01 else '→'}{trend:+.3f}"
                else:
                    trend = 0.0
                    trend_str = "n/a"
                prev_entropy_mean = e_mean

                if score > best_score:
                    best_score = score
                    best_win_rate = win_rate
                    best_avg_ppg = avg_ppg
                    torch.save(model.state_dict(), model_path)
                    print(f"  → Saved best model (win={win_rate:.1%}, ppg={avg_ppg:.2f}, score={score:.4f}) to {model_path}")

                # Always save avg model at eval time
                if use_nfsp and avg_model is not None:
                    torch.save(avg_model.state_dict(), avg_model_path)

                eval_writer.writerow([
                    eval_num, epoch + 1,
                    f"{win_rate:.4f}", f"{avg_ppg:.4f}", f"{score:.4f}",
                    f"{best_win_rate:.4f}", f"{best_avg_ppg:.4f}", f"{best_score:.4f}",
                    f"{e_mean:.6f}", f"{e_min:.6f}", f"{e_max:.6f}", f"{trend:.6f}",
                ])
                eval_f.flush()
                entropy_window.clear()

                print(
                    f"  ▶ Eval: {win_rate:.1%} win rate, ppg={avg_ppg:.2f} "
                    f"(score={score:.4f}, best={best_score:.4f}) | "
                    f"entropy [{n} epochs]: mean={e_mean:.3f} min={e_min:.3f} max={e_max:.3f} trend={trend_str}"
                )

    print(f"\nBest win rate vs greedy: {best_win_rate:.1%}")
    print(f"Model saved to {model_path}")
    if use_nfsp:
        print(f"Avg model saved to {avg_model_path}")
    print(f"Epoch stats: {epoch_csv_path}")
    print(f"Eval stats:  {eval_csv_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PPO training with NFSP opponent pool")
    parser.add_argument("--epochs", type=int, default=1000)
    parser.add_argument("--batch-size", type=int, default=2048)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--output-dir", default=".", help="Directory for model and CSV outputs")
    parser.add_argument("--ppo-epochs", type=int, default=2)
    parser.add_argument("--clip-ratio", type=float, default=0.2)
    parser.add_argument("--entropy-coef", type=float, default=0.05)
    parser.add_argument("--entropy-target", type=float, default=0.3,
                        help="Entropy floor — adaptive coefficient boosts when below this")
    parser.add_argument("--eval-interval", type=int, default=100, help="Epochs between vs-greedy evals")
    parser.add_argument("--eval-games", type=int, default=100, help="Games per eval round")
    parser.add_argument("--no-shaping", action="store_true", help="Disable reward shaping")
    parser.add_argument("--minibatch-size", type=int, default=512)
    # NFSP / opponent pool
    parser.add_argument("--no-opponent-pool", action="store_true",
                        help="Disable opponent pool (pure self-play, all 4 seats train)")
    parser.add_argument("--reservoir-capacity", type=int, default=50000,
                        help="NFSP reservoir buffer capacity")
    parser.add_argument("--avg-lr", type=float, default=1e-3,
                        help="Average policy learning rate")
    parser.add_argument("--avg-updates", type=int, default=4,
                        help="Average policy updates per epoch")
    # Resume from a previous run
    parser.add_argument("--resume-model", type=str, default=None,
                        help="Path to model.pt to resume training from")
    parser.add_argument("--resume-avg-model", type=str, default=None,
                        help="Path to avg-model.pt to resume training from")
    args = parser.parse_args()

    train(
        args.epochs, args.batch_size, args.lr, args.output_dir,
        args.ppo_epochs, args.clip_ratio, args.entropy_coef,
        args.entropy_target,
        args.eval_interval, args.eval_games,
        use_shaping=not args.no_shaping,
        minibatch_size=args.minibatch_size,
        no_opponent_pool=args.no_opponent_pool,
        reservoir_capacity=args.reservoir_capacity,
        avg_lr=args.avg_lr,
        avg_updates=args.avg_updates,
        resume_model=args.resume_model,
        resume_avg_model=args.resume_avg_model,
    )
