"""
PPO (Proximal Policy Optimization) training via self-play.

Plays games through the TS game engine bridge, collects trajectories,
and updates the policy using PPO-Clip.

See docs/rl-training-design.md Section 5B.

Usage:
    python train_ppo.py --epochs 1000 [--batch-size 2048] [--output model.pt]
"""

import argparse
import sys
import time

import numpy as np
import torch
import torch.nn as nn

from features import encode_state, encode_action, encode_pass_action, STATE_SIZE, ACTION_SIZE
from model import TienLenNet
from game_bridge import GameBridge, TurnInfo, GameOver


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
        """Assign terminal reward to all steps in a player's episode."""
        for i in range(start_idx, end_idx):
            self.rewards[i] = reward
        if end_idx > start_idx:
            self.dones[end_idx - 1] = True

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


# ── Helper functions ─────────────────────────────────────────────────────────

POSITION_REWARDS = {0: 4.0, 1: 2.0, 2: 1.0, 3: 0.0}
MAX_ACTIONS = 80


def encode_turn(turn: TurnInfo, player: int):
    """Encode a turn into state features and padded action features."""
    state = encode_state(turn.state, player)

    action_list = [encode_action(cards) for cards in turn.valid_actions]
    if turn.can_pass:
        action_list.append(encode_pass_action())

    num_actions = len(action_list)
    action_features = np.zeros((MAX_ACTIONS, ACTION_SIZE), dtype=np.float32)
    action_mask = np.zeros(MAX_ACTIONS, dtype=np.bool_)

    for i, af in enumerate(action_list[:MAX_ACTIONS]):
        action_features[i] = af
        action_mask[i] = True

    return state, action_features, action_mask, num_actions


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
) -> tuple[TrajectoryBuffer, dict]:
    """Play games and collect trajectory data until we have enough steps."""
    buf = TrajectoryBuffer()
    games_played = 0
    total_moves = 0
    win_counts = [0, 0, 0, 0]  # by finish position

    while buf.size() < target_steps:
        # Track where each player's trajectory starts in the buffer
        player_start = {p: buf.size() for p in range(4)}
        player_steps = {p: 0 for p in range(4)}

        turn = bridge.new_game()

        while True:
            player = turn.player
            state, action_features, action_mask, num_actions = encode_turn(turn, player)

            if num_actions > MAX_ACTIONS:
                # Rare edge case: too many actions, just pick first valid
                num_actions = MAX_ACTIONS

            action_index, log_prob, value = select_action(
                model, state, action_features, action_mask, num_actions, device
            )

            # Record start of this player's steps if this is their first move
            if player_steps[player] == 0:
                player_start[player] = buf.size()

            buf.add(state, action_features, action_mask, action_index, log_prob, value)
            player_steps[player] += 1
            total_moves += 1

            result = bridge.step(action_index)

            if isinstance(result, GameOver):
                # Assign position rewards
                for position, player_id in enumerate(result.win_order):
                    reward = POSITION_REWARDS[position]
                    start = player_start[player_id]
                    end = start + player_steps[player_id]
                    buf.assign_rewards(start, end, reward)
                    win_counts[position] += 1

                games_played += 1
                break

            turn = result

    stats = {
        "games": games_played,
        "steps": buf.size(),
        "avg_moves": total_moves / max(games_played, 1),
    }
    return buf, stats


# ── PPO update ───────────────────────────────────────────────────────────────

def ppo_update(
    model: TienLenNet,
    optimizer: torch.optim.Optimizer,
    buf: TrajectoryBuffer,
    device: torch.device,
    ppo_epochs: int = 4,
    clip_ratio: float = 0.2,
    entropy_coef: float = 0.01,
    value_coef: float = 0.5,
    max_grad_norm: float = 0.5,
) -> dict:
    """Run PPO policy update on collected trajectories."""
    (
        states, actions_feat, action_masks, action_indices,
        old_log_probs, old_values, rewards, dones
    ) = buf.to_tensors(device)

    advantages, returns = compute_gae(rewards, old_values, dones)
    # Normalize advantages
    advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

    total_policy_loss = 0.0
    total_value_loss = 0.0
    total_entropy = 0.0

    for _ in range(ppo_epochs):
        # Forward pass
        scores = model(states, actions_feat)
        scores = scores.masked_fill(~action_masks, float("-inf"))

        # Compute log probs for chosen actions
        log_probs_all = torch.log_softmax(scores, dim=-1)
        new_log_probs = log_probs_all.gather(1, action_indices.unsqueeze(1)).squeeze(1)

        # Policy loss (clipped surrogate)
        ratio = torch.exp(new_log_probs - old_log_probs)
        surr1 = ratio * advantages
        surr2 = torch.clamp(ratio, 1.0 - clip_ratio, 1.0 + clip_ratio) * advantages
        policy_loss = -torch.min(surr1, surr2).mean()

        # Value loss
        new_values = model.value(states).squeeze(-1)
        value_loss = nn.functional.mse_loss(new_values, returns)

        # Entropy bonus (encourage exploration)
        # Only over valid actions
        probs = torch.softmax(scores, dim=-1)
        probs = probs.clamp(min=1e-8)  # avoid log(0) for masked positions
        entropy = -(probs * torch.log(probs)).sum(dim=-1)
        # Only count entropy from valid actions (masked ones are 0 probability)
        entropy = entropy.mean()

        loss = policy_loss + value_coef * value_loss - entropy_coef * entropy

        optimizer.zero_grad()
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
        optimizer.step()

        total_policy_loss += policy_loss.item()
        total_value_loss += value_loss.item()
        total_entropy += entropy.item()

    return {
        "policy_loss": total_policy_loss / ppo_epochs,
        "value_loss": total_value_loss / ppo_epochs,
        "entropy": total_entropy / ppo_epochs,
    }


# ── Main ─────────────────────────────────────────────────────────────────────

def train(
    epochs: int = 1000,
    batch_size: int = 2048,
    lr: float = 3e-4,
    output_path: str = "model.pt",
    ppo_epochs: int = 4,
    clip_ratio: float = 0.2,
    entropy_coef: float = 0.01,
):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on {device}")

    model = TienLenNet().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    param_count = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {param_count:,}")

    best_avg_reward = -float("inf")

    with GameBridge() as bridge:
        for epoch in range(epochs):
            t0 = time.time()

            # Collect trajectories
            buf, collect_stats = collect_trajectories(bridge, model, device, batch_size)

            # PPO update
            update_stats = ppo_update(
                model, optimizer, buf, device,
                ppo_epochs=ppo_epochs,
                clip_ratio=clip_ratio,
                entropy_coef=entropy_coef,
            )

            elapsed = time.time() - t0
            avg_reward = sum(buf.rewards) / max(collect_stats["games"] * 4, 1)

            print(
                f"Epoch {epoch + 1:4d}/{epochs} | "
                f"games: {collect_stats['games']:3d} | "
                f"steps: {collect_stats['steps']:5d} | "
                f"avg_reward: {avg_reward:.2f} | "
                f"policy_loss: {update_stats['policy_loss']:.4f} | "
                f"value_loss: {update_stats['value_loss']:.4f} | "
                f"entropy: {update_stats['entropy']:.3f} | "
                f"{elapsed:.1f}s"
            )

            if avg_reward > best_avg_reward:
                best_avg_reward = avg_reward
                torch.save(model.state_dict(), output_path)
                print(f"  → Saved best model (avg_reward={avg_reward:.2f})")

    print(f"\nBest average reward: {best_avg_reward:.2f}")
    print(f"Model saved to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PPO training via self-play")
    parser.add_argument("--epochs", type=int, default=1000)
    parser.add_argument("--batch-size", type=int, default=2048)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--output", default="model.pt")
    parser.add_argument("--ppo-epochs", type=int, default=4)
    parser.add_argument("--clip-ratio", type=float, default=0.2)
    parser.add_argument("--entropy-coef", type=float, default=0.01)
    args = parser.parse_args()

    train(
        args.epochs, args.batch_size, args.lr, args.output,
        args.ppo_epochs, args.clip_ratio, args.entropy_coef,
    )
