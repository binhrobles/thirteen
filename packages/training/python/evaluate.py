"""
Evaluate an ONNX model.

Two modes:
  --self-play    Play games via the TS game engine bridge. Reports win rate
                 and average finish position (model controls all 4 seats).
  --data FILE    Replay JSONL data and compare model choices to greedy bot.

Usage:
    python evaluate.py --model bot.onnx --self-play [--games 1000]
    python evaluate.py --model bot.onnx --data greedy-10k.jsonl [--games 1000]
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


def _run_eval(bridge, bot, games: int, num_model_seats: int):
    """Play games with randomized seat assignments and collect model finish positions."""
    import random
    from game_bridge import GameOver

    all_positions: list[int] = []  # 1-indexed finish positions for model seats

    for g in range(games):
        # Randomly assign which seats are model vs greedy
        seats = list(range(4))
        random.shuffle(seats)
        model_seats = set(seats[:num_model_seats])
        greedy_seats = [s for s in range(4) if s not in model_seats]

        result = bridge.new_game(greedy_seats=greedy_seats)

        while not isinstance(result, GameOver):
            turn = result
            state = encode_state(turn.state, turn.player)
            action_list = [encode_action(cards) for cards in turn.valid_actions]
            if turn.can_pass:
                action_list.append(encode_pass_action())

            if len(action_list) == 0:
                break

            choice = bot.choose_action_index(state, action_list)
            result = bridge.step(choice)

        if isinstance(result, GameOver):
            for seat in model_seats:
                pos = result.win_order.index(seat) + 1  # 1-indexed
                all_positions.append(pos)

        if (g + 1) % 100 == 0:
            wr = sum(1 for p in all_positions if p == 1) / len(all_positions) if all_positions else 0
            print(f"\r  {g + 1}/{games} games, win rate: {wr:.1%}", end="", file=sys.stderr)

    return all_positions


def _print_eval_results(label: str, all_positions: list[int], games: int):
    """Print evaluation results for a configuration."""
    n = len(all_positions)
    wins = sum(1 for p in all_positions if p == 1)
    avg = sum(all_positions) / n if n else 0
    pos_counts = [sum(1 for p in all_positions if p == rank) for rank in range(1, 5)]

    print(f"\n  {label} ({games} games, {n} model finishes):")
    print(f"    Win rate:    {wins}/{n} ({wins/n:.1%})")
    print(f"    Avg finish:  {avg:.2f} (1.0 = always 1st, 2.5 = random)")
    print(f"    1st: {pos_counts[0]:4d}  2nd: {pos_counts[1]:4d}  3rd: {pos_counts[2]:4d}  4th: {pos_counts[3]:4d}")


def evaluate_vs_greedy(model_path: str, games: int = 1000):
    """
    Evaluate ONNX model against greedy bots in three configurations
    with randomized seat assignments each game:
      1v3: 1 model vs 3 greedy
      2v2: 2 model vs 2 greedy
      3v1: 3 model vs 1 greedy
    """
    from game_bridge import GameBridge

    bot = OnnxBot(model_path)

    configs = [
        ("1 model vs 3 greedy", 1),
        ("2 model vs 2 greedy", 2),
        ("3 model vs 1 greedy", 3),
    ]

    print(f"Evaluating model against greedy bots ({games} games per config)...")

    with GameBridge() as bridge:
        for label, num_model_seats in configs:
            print(f"\n  Running: {label}...", file=sys.stderr)
            positions = _run_eval(bridge, bot, games, num_model_seats)
            _print_eval_results(label, positions, games)


def evaluate_replay(model_path: str, data_path: str, games: int = 1000):
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
    parser.add_argument("--data", help="Path to JSONL game data for replay evaluation")
    parser.add_argument("--vs-greedy", action="store_true", help="Evaluate model vs greedy bots (1v3, 2v2, 3v1)")
    parser.add_argument("--games", type=int, default=1000)
    args = parser.parse_args()

    if args.vs_greedy:
        evaluate_vs_greedy(args.model, args.games)
    elif args.data:
        evaluate_replay(args.model, args.data, args.games)
    else:
        parser.error("Must specify either --vs-greedy or --data")
