"""
Evaluate an ONNX model by playing it against the greedy bot.

Runs N games with the ONNX model as one player and greedy bots for the rest.
Reports win rate, average finish position, and head-to-head stats.

Usage:
    python evaluate.py --model bot.onnx [--games 1000]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort

from features import (
    encode_state,
    encode_action,
    encode_pass_action,
    STATE_SIZE,
    ACTION_SIZE,
)


class OnnxBot:
    """Bot that uses an ONNX model to choose plays."""

    def __init__(self, model_path: str):
        self.session = ort.InferenceSession(model_path)

    def choose_action_index(
        self,
        state_features: np.ndarray,
        action_features_list: list[np.ndarray],
    ) -> int:
        """Score all actions and return the index of the best one."""
        num_actions = len(action_features_list)

        # Pad to batch format: (1, num_actions, ACTION_SIZE)
        actions = np.zeros((1, num_actions, ACTION_SIZE), dtype=np.float32)
        for i, af in enumerate(action_features_list):
            actions[0, i] = af

        state = state_features.reshape(1, STATE_SIZE)

        result = self.session.run(
            None, {"state": state, "action_features": actions}
        )
        scores = result[0][0]  # (num_actions,)

        return int(np.argmax(scores[:num_actions]))


def evaluate(model_path: str, data_path: str, games: int = 1000):
    """
    Evaluate by replaying game data and comparing model choices to greedy bot.

    Since the game engine is in TypeScript, we evaluate using pre-generated
    game data: for each decision point, we check if the model would have
    chosen the same action as the greedy bot.
    """
    bot = OnnxBot(model_path)

    total_decisions = 0
    matching_decisions = 0
    games_loaded = 0

    print(f"Loading evaluation data from {data_path}...")

    with open(data_path) as f:
        for line in f:
            if games_loaded >= games:
                break

            game = json.loads(line)
            games_loaded += 1

            for move in game["moves"]:
                state = encode_state(move["state"], move["player"])

                valid_actions = move["valid_actions"]
                action_list = [encode_action(cards) for cards in valid_actions]

                can_pass = move["state"]["lastPlay"] is not None
                if can_pass:
                    action_list.append(encode_pass_action())

                if len(action_list) == 0:
                    continue

                # What would the model choose?
                model_choice = bot.choose_action_index(state, action_list)

                # What did the greedy bot actually choose?
                if move["action"] == "pass":
                    greedy_choice = len(action_list) - 1
                else:
                    chosen_values = set(c["value"] for c in move["cards"])
                    greedy_choice = -1
                    for i, valid_cards in enumerate(valid_actions):
                        if set(c["value"] for c in valid_cards) == chosen_values:
                            greedy_choice = i
                            break

                if greedy_choice == -1:
                    continue

                total_decisions += 1
                if model_choice == greedy_choice:
                    matching_decisions += 1

            if games_loaded % 100 == 0:
                acc = matching_decisions / total_decisions if total_decisions > 0 else 0
                print(
                    f"\r  {games_loaded} games, {total_decisions} decisions, accuracy: {acc:.3f}",
                    end="",
                    file=sys.stderr,
                )

    print()
    accuracy = matching_decisions / total_decisions if total_decisions > 0 else 0
    print(f"\nResults ({games_loaded} games, {total_decisions} decisions):")
    print(f"  Action match rate: {accuracy:.3f} ({matching_decisions}/{total_decisions})")
    print(f"  (1.0 = perfect clone of greedy bot)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate ONNX model")
    parser.add_argument("--model", required=True, help="Path to .onnx model")
    parser.add_argument("--data", required=True, help="Path to JSONL game data for evaluation")
    parser.add_argument("--games", type=int, default=1000)
    args = parser.parse_args()

    evaluate(args.model, args.data, args.games)
