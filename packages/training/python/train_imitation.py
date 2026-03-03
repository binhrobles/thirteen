"""
Imitation learning (behavioral cloning) training script.

Trains a model to mimic the greedy bot's decisions.
This validates the full pipeline: data → encoding → training → model.

Usage:
    python train_imitation.py --data greedy-10k.jsonl [--epochs 50] [--output model.pt]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

from features import encode_state, encode_action, encode_pass_action, STATE_SIZE, ACTION_SIZE
from model import TienLenNet


class ImitationDataset(Dataset):
    """
    Dataset of (state, action_features, label) tuples from game logs.

    Each sample is one decision point:
    - state: encoded game state (413 floats)
    - action_features: all valid actions padded to max_actions (N × 63)
    - action_mask: which action slots are real vs padding (N bools)
    - label: index of the chosen action among valid actions
    """

    def __init__(self, data_path: str, max_actions: int = 80):
        self.samples: list[tuple[np.ndarray, np.ndarray, np.ndarray, int]] = []
        self.max_actions = max_actions
        self.skipped = 0

        print(f"Loading {data_path}...")
        with open(data_path) as f:
            for line_num, line in enumerate(f):
                game = json.loads(line)
                self._process_game(game)
                if (line_num + 1) % 1000 == 0:
                    print(
                        f"\r  {line_num + 1} games, {len(self.samples)} samples",
                        end="",
                        file=sys.stderr,
                    )

        print(
            f"\nLoaded {len(self.samples)} samples ({self.skipped} skipped)",
            file=sys.stderr,
        )

    def _process_game(self, game: dict) -> None:
        for move in game["moves"]:
            state = encode_state(move["state"], move["player"])

            # Build action list: valid plays + pass (if applicable)
            valid_actions = move["valid_actions"]
            action_list: list[np.ndarray] = [
                encode_action(cards) for cards in valid_actions
            ]

            # Add pass action if the player could pass (lastPlay is not null)
            can_pass = move["state"]["lastPlay"] is not None
            if can_pass:
                action_list.append(encode_pass_action())

            if len(action_list) == 0:
                self.skipped += 1
                continue

            # Find which action was chosen
            if move["action"] == "pass":
                # Pass is the last action in the list
                label = len(action_list) - 1
            else:
                # Find the matching play by card values
                chosen_values = set(c["value"] for c in move["cards"])
                label = -1
                for i, valid_cards in enumerate(valid_actions):
                    if set(c["value"] for c in valid_cards) == chosen_values:
                        label = i
                        break

                if label == -1:
                    # Chosen action not found in valid actions (shouldn't happen)
                    self.skipped += 1
                    continue

            if len(action_list) > self.max_actions:
                self.skipped += 1
                continue

            # Pad actions to max_actions
            action_features = np.zeros(
                (self.max_actions, ACTION_SIZE), dtype=np.float32
            )
            action_mask = np.zeros(self.max_actions, dtype=np.bool_)

            for i, af in enumerate(action_list):
                action_features[i] = af
                action_mask[i] = True

            self.samples.append((state, action_features, action_mask, label))

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        state, actions, mask, label = self.samples[idx]
        return (
            torch.from_numpy(state),
            torch.from_numpy(actions),
            torch.from_numpy(mask),
            torch.tensor(label, dtype=torch.long),
        )


def train(
    data_path: str,
    epochs: int = 50,
    batch_size: int = 256,
    lr: float = 3e-4,
    output_path: str = "model.pt",
    val_split: float = 0.1,
):
    dataset = ImitationDataset(data_path)

    # Train/val split
    n = len(dataset)
    n_val = int(n * val_split)
    n_train = n - n_val
    train_set, val_set = torch.utils.data.random_split(dataset, [n_train, n_val])

    train_loader = DataLoader(
        train_set, batch_size=batch_size, shuffle=True, num_workers=0
    )
    val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False, num_workers=0)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Training on {device} ({n_train} train, {n_val} val)")

    model = TienLenNet().to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    param_count = sum(p.numel() for p in model.parameters())
    print(f"Model parameters: {param_count:,}")

    best_val_acc = 0.0

    for epoch in range(epochs):
        # Training
        model.train()
        total_loss = 0.0
        correct = 0
        total = 0

        for state, actions, mask, label in train_loader:
            state = state.to(device)
            actions = actions.to(device)
            mask = mask.to(device)
            label = label.to(device)

            scores = model(state, actions)  # (batch, max_actions)

            # Mask out padded actions with -inf before softmax
            scores = scores.masked_fill(~mask, float("-inf"))

            loss = nn.functional.cross_entropy(scores, label)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item() * state.size(0)
            preds = scores.argmax(dim=-1)
            correct += (preds == label).sum().item()
            total += state.size(0)

        train_loss = total_loss / total
        train_acc = correct / total

        # Validation
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for state, actions, mask, label in val_loader:
                state = state.to(device)
                actions = actions.to(device)
                mask = mask.to(device)
                label = label.to(device)

                scores = model(state, actions)
                scores = scores.masked_fill(~mask, float("-inf"))

                loss = nn.functional.cross_entropy(scores, label)

                val_loss += loss.item() * state.size(0)
                preds = scores.argmax(dim=-1)
                val_correct += (preds == label).sum().item()
                val_total += state.size(0)

        val_loss = val_loss / val_total if val_total > 0 else 0
        val_acc = val_correct / val_total if val_total > 0 else 0

        print(
            f"Epoch {epoch + 1:3d}/{epochs} | "
            f"Train loss: {train_loss:.4f} acc: {train_acc:.3f} | "
            f"Val loss: {val_loss:.4f} acc: {val_acc:.3f}"
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), output_path)
            print(f"  → Saved best model (val_acc={val_acc:.3f})")

    print(f"\nBest validation accuracy: {best_val_acc:.3f}")
    print(f"Model saved to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train imitation learning model")
    parser.add_argument("--data", required=True, help="Path to JSONL training data")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--output", default="model.pt")
    args = parser.parse_args()

    train(args.data, args.epochs, args.batch_size, args.lr, args.output)
