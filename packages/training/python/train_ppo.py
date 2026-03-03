"""
PPO (Proximal Policy Optimization) training via self-play.

Plays games through the TS game engine bridge, collects trajectories,
and updates the policy using PPO-Clip.

See docs/rl-training-design.md Section 5B.

Usage:
    python train_ppo.py --epochs 1000 [--batch-size 2048] [--output model.pt]
"""

import argparse
import csv
import os
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


# ── Helper functions ─────────────────────────────────────────────────────────

POSITION_REWARDS = {0: 2.25, 1: 0.25, 2: -0.75, 3: -1.75}
MAX_ACTIONS = 80

# Reward shaping (small intermediate signals, < 5% of terminal reward)
CARD_PLAY_REWARD = 0.01   # per card played — encourages shedding
POWER_GAIN_REWARD = 0.02  # winning a trick — encourages board control


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
    use_shaping: bool = True,
) -> tuple[TrajectoryBuffer, dict]:
    """Play games and collect trajectory data until we have enough steps."""
    buf = TrajectoryBuffer()
    games_played = 0
    total_moves = 0

    while buf.size() < target_steps:
        # Per-player buffers so each player's trajectory is contiguous
        player_bufs = {p: TrajectoryBuffer() for p in range(4)}

        turn = bridge.new_game()
        prev_can_pass = False  # first turn is always a lead (can_pass=False)

        while True:
            player = turn.player
            state, action_features, action_mask, num_actions = encode_turn(turn, player)

            if num_actions > MAX_ACTIONS:
                num_actions = MAX_ACTIONS

            action_index, log_prob, value = select_action(
                model, state, action_features, action_mask, num_actions, device
            )

            # Compute per-step shaping reward
            shaping = 0.0
            if use_shaping:
                is_pass = turn.can_pass and action_index == len(turn.valid_actions)
                if not is_pass and action_index < len(turn.valid_actions):
                    num_cards = len(turn.valid_actions[action_index])
                    shaping = CARD_PLAY_REWARD * num_cards

            player_bufs[player].add(state, action_features, action_mask, action_index, log_prob, value)
            player_bufs[player].rewards[-1] = shaping
            total_moves += 1

            result = bridge.step(action_index)

            if isinstance(result, GameOver):
                # Assign terminal rewards and merge per-player buffers into main buffer
                for position, player_id in enumerate(result.win_order):
                    pb = player_bufs[player_id]
                    if pb.size() > 0:
                        pb.rewards[-1] += POSITION_REWARDS[position]
                        pb.dones[-1] = True
                    buf.extend(pb)

                games_played += 1
                break

            # Detect power gain: round reset means someone won the trick
            assert isinstance(result, TurnInfo)
            if use_shaping and not result.can_pass and prev_can_pass:
                power_player = result.player
                if player_bufs[power_player].size() > 0:
                    player_bufs[power_player].rewards[-1] += POWER_GAIN_REWARD

            prev_can_pass = result.can_pass
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
    ppo_epochs: int = 2,
    clip_ratio: float = 0.2,
    entropy_coef: float = 0.01,
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
    advantages = (advantages - advantages.mean()) / (advantages.std() + 1e-8)

    n = states.shape[0]
    total_policy_loss = 0.0
    total_value_loss = 0.0
    total_entropy = 0.0
    total_kl = 0.0
    num_updates = 0

    for _ in range(ppo_epochs):
        for start in range(0, n, minibatch_size):
            mb = torch.randperm(n, device=device)[start:start + minibatch_size]

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
            value_loss = nn.functional.mse_loss(new_values, returns[mb])

            probs = torch.softmax(scores, dim=-1)
            probs = probs.clamp(min=1e-8)
            entropy = -(probs * torch.log(probs)).sum(dim=-1).mean()

            loss = policy_loss + value_coef * value_loss - entropy_coef * entropy

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


# ── Inline evaluation ────────────────────────────────────────────────────────

def eval_vs_greedy(
    bridge: GameBridge,
    model: TienLenNet,
    device: torch.device,
    games: int = 100,
) -> float:
    """
    Play model (seat 0) vs 3 greedy bots. Returns win rate.
    Uses the PyTorch model directly (no ONNX export needed).
    """
    import random

    model.eval()
    wins = 0

    for _ in range(games):
        # Randomize model seat
        model_seat = random.randrange(4)
        greedy_seats = [s for s in range(4) if s != model_seat]

        result = bridge.new_game(greedy_seats=greedy_seats)

        while not isinstance(result, GameOver):
            turn = result
            state, action_features, action_mask, num_actions = encode_turn(turn, turn.player)
            if num_actions > MAX_ACTIONS:
                num_actions = MAX_ACTIONS

            # Use argmax (greedy) instead of sampling for eval
            with torch.no_grad():
                state_t = torch.from_numpy(state).unsqueeze(0).to(device)
                actions_t = torch.from_numpy(action_features).unsqueeze(0).to(device)
                mask_t = torch.from_numpy(action_mask).unsqueeze(0).to(device)
                scores = model(state_t, actions_t)
                scores = scores.masked_fill(~mask_t, float("-inf"))
                action_index = scores[0, :num_actions].argmax().item()

            result = bridge.step(action_index)

        if isinstance(result, GameOver):
            if result.win_order.index(model_seat) == 0:
                wins += 1

    model.train()
    return wins / games


# ── Main ─────────────────────────────────────────────────────────────────────

def train(
    epochs: int = 1000,
    batch_size: int = 2048,
    lr: float = 3e-4,
    output_dir: str = ".",
    ppo_epochs: int = 2,
    clip_ratio: float = 0.2,
    entropy_coef: float = 0.01,
    eval_interval: int = 100,
    eval_games: int = 100,
    use_shaping: bool = True,
    minibatch_size: int = 512,
):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on {device}")

    # Build output paths from hyperparameters
    e_str = str(entropy_coef).replace("0.", "").replace(".", "")
    run_prefix = f"ppo-ep{epochs}-b{batch_size}-e{e_str}{'-shaping' if use_shaping else ''}"
    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, f"{run_prefix}-model.pt")
    epoch_csv_path = os.path.join(output_dir, f"{run_prefix}-epoch-stats.csv")
    eval_csv_path = os.path.join(output_dir, f"{run_prefix}-eval-stats.csv")
    print(f"Run prefix: {run_prefix}")
    print(f"Output dir: {output_dir}")

    model = TienLenNet().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    param_count = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {param_count:,}")
    print(f"Reward shaping: {'ON' if use_shaping else 'OFF'}")
    print(f"Eval: every {eval_interval} epochs, {eval_games} games vs greedy")

    best_win_rate = -1.0
    entropy_window: list[float] = []
    prev_entropy_mean: float | None = None
    eval_num = 0

    with (
        open(epoch_csv_path, "w", newline="") as epoch_f,
        open(eval_csv_path, "w", newline="") as eval_f,
        GameBridge() as bridge,
    ):
        epoch_writer = csv.writer(epoch_f)
        epoch_writer.writerow(["epoch", "policy_loss", "value_loss", "entropy", "kl", "games", "elapsed_s"])

        eval_writer = csv.writer(eval_f)
        eval_writer.writerow([
            "eval_num", "epoch", "win_rate", "best_win_rate",
            "entropy_mean", "entropy_min", "entropy_max", "entropy_trend",
        ])

        for epoch in range(epochs):
            t0 = time.time()

            # Collect trajectories
            buf, collect_stats = collect_trajectories(bridge, model, device, batch_size, use_shaping)
            t_collect = time.time() - t0

            # PPO update
            t1 = time.time()
            update_stats = ppo_update(
                model, optimizer, buf, device,
                ppo_epochs=ppo_epochs,
                clip_ratio=clip_ratio,
                entropy_coef=entropy_coef,
                minibatch_size=minibatch_size,
            )
            t_update = time.time() - t1

            elapsed = t_collect + t_update
            entropy_window.append(update_stats["entropy"])

            epoch_writer.writerow([
                epoch + 1,
                f"{update_stats['policy_loss']:.6f}",
                f"{update_stats['value_loss']:.6f}",
                f"{update_stats['entropy']:.6f}",
                f"{update_stats['kl']:.6f}",
                collect_stats["games"],
                f"{elapsed:.2f}",
            ])
            epoch_f.flush()

            print(
                f"Epoch {epoch + 1:4d}/{epochs} | "
                f"games: {collect_stats['games']:3d} | "
                f"policy_loss: {update_stats['policy_loss']:.4f} | "
                f"value_loss: {update_stats['value_loss']:.4f} | "
                f"entropy: {update_stats['entropy']:.3f} | "
                f"kl: {update_stats['kl']:.4f} | "
                f"collect={t_collect:.1f}s update={t_update:.1f}s"
            )

            # Periodic evaluation vs greedy
            if (epoch + 1) % eval_interval == 0 or epoch == epochs - 1:
                win_rate = eval_vs_greedy(bridge, model, device, eval_games)
                eval_num += 1

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

                if win_rate > best_win_rate:
                    best_win_rate = win_rate
                    torch.save(model.state_dict(), model_path)
                    print(f"  → Saved best model (win_rate={win_rate:.1%}) to {model_path}")

                eval_writer.writerow([
                    eval_num, epoch + 1,
                    f"{win_rate:.4f}", f"{best_win_rate:.4f}",
                    f"{e_mean:.6f}", f"{e_min:.6f}", f"{e_max:.6f}", f"{trend:.6f}",
                ])
                eval_f.flush()
                entropy_window.clear()

                print(
                    f"  ▶ Eval: {win_rate:.1%} win rate vs greedy "
                    f"({eval_games} games, best: {best_win_rate:.1%}) | "
                    f"entropy [{n} epochs]: mean={e_mean:.3f} min={e_min:.3f} max={e_max:.3f} trend={trend_str}"
                )

    print(f"\nBest win rate vs greedy: {best_win_rate:.1%}")
    print(f"Model saved to {model_path}")
    print(f"Epoch stats: {epoch_csv_path}")
    print(f"Eval stats:  {eval_csv_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PPO training via self-play")
    parser.add_argument("--epochs", type=int, default=1000)
    parser.add_argument("--batch-size", type=int, default=2048)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--output-dir", default=".", help="Directory for model and CSV outputs")
    parser.add_argument("--ppo-epochs", type=int, default=2)
    parser.add_argument("--clip-ratio", type=float, default=0.2)
    parser.add_argument("--entropy-coef", type=float, default=0.01)
    parser.add_argument("--eval-interval", type=int, default=100, help="Epochs between vs-greedy evals")
    parser.add_argument("--eval-games", type=int, default=100, help="Games per eval round")
    parser.add_argument("--no-shaping", action="store_true", help="Disable reward shaping")
    parser.add_argument("--minibatch-size", type=int, default=512)
    args = parser.parse_args()

    train(
        args.epochs, args.batch_size, args.lr, args.output_dir,
        args.ppo_epochs, args.clip_ratio, args.entropy_coef,
        args.eval_interval, args.eval_games,
        use_shaping=not args.no_shaping,
        minibatch_size=args.minibatch_size,
    )
