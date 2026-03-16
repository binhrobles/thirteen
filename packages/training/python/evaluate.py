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
import random
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


def _run_eval(bridge, bot, games: int, num_model_seats: int, opponent: str = "greedy"):
    """Play games with randomized seat assignments and collect model finish positions.

    opponent: "greedy" (handled by bridge) or "random" (handled in Python).
    """
    import random
    from game_bridge import GameOver

    all_positions: list[int] = []  # 1-indexed finish positions for model seats

    for g in range(games):
        seats = list(range(4))
        random.shuffle(seats)
        model_seats = set(seats[:num_model_seats])

        if opponent == "greedy":
            greedy_seats = [s for s in range(4) if s not in model_seats]
            result = bridge.new_game(greedy_seats=greedy_seats)
        else:
            # All seats handled in Python (model + random)
            result = bridge.new_game()

        while not isinstance(result, GameOver):
            turn = result
            num_actions = len(turn.valid_actions) + (1 if turn.can_pass else 0)

            if num_actions == 0:
                break

            if turn.player in model_seats:
                state = encode_state(turn.state, turn.player)
                action_list = [encode_action(cards) for cards in turn.valid_actions]
                if turn.can_pass:
                    action_list.append(encode_pass_action())
                choice = bot.choose_action_index(state, action_list)
            else:
                # Random opponent: uniform random action
                choice = random.randrange(num_actions)

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
    ppg_table = {1: 4, 2: 2, 3: 1, 4: 0}
    avg_ppg = sum(ppg_table[p] for p in all_positions) / n if n else 0
    pos_counts = [sum(1 for p in all_positions if p == rank) for rank in range(1, 5)]

    print(f"\n  {label} ({games} games, {n} model finishes):")
    print(f"    Win rate:    {wins}/{n} ({wins/n:.1%})")
    print(f"    Avg PPG:     {avg_ppg:.2f} (1.75 = random)")
    print(f"    1st: {pos_counts[0]:4d} ({pos_counts[0]/n:.1%})  2nd: {pos_counts[1]:4d} ({pos_counts[1]/n:.1%})  3rd: {pos_counts[2]:4d} ({pos_counts[2]/n:.1%})  4th: {pos_counts[3]:4d} ({pos_counts[3]/n:.1%})")


def evaluate_vs_greedy(model_path: str, games: int = 1000):
    """
    Evaluate ONNX model against greedy and random bots
    with randomized seat assignments each game.
    """
    from game_bridge import GameBridge

    bot = OnnxBot(model_path)

    configs = [
        ("1 model vs 3 greedy", 1, "greedy"),
        ("2 model vs 2 greedy", 2, "greedy"),
        ("3 model vs 1 greedy", 3, "greedy"),
        ("1 model vs 3 random", 1, "random"),
    ]

    print(f"Evaluating model ({games} games per config)...")

    with GameBridge() as bridge:
        for label, num_model_seats, opponent in configs:
            print(f"\n  Running: {label}...", file=sys.stderr)
            positions = _run_eval(bridge, bot, games, num_model_seats, opponent)
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


def evaluate_tourney(model_path: str, tourneys: int = 100, target_score: int = 21):
    """Run full tournaments: 1 model seat vs 3 greedy bots.

    Reports: tournament win rate, average finish position, score distribution.
    """
    from game_bridge import GameBridge, GameOver, TourneyOver

    bot = OnnxBot(model_path)
    tourney_wins = 0
    tourney_positions = []  # 1=1st, 2=2nd, etc. in final standings

    with GameBridge() as bridge:
        for t in range(tourneys):
            model_seat = random.randrange(4)
            greedy_seats = [s for s in range(4) if s != model_seat]

            result = bridge.new_tourney(greedy_seats=greedy_seats, target_score=target_score)

            while True:
                # Play one game
                while not isinstance(result, GameOver):
                    turn = result
                    state = encode_state(turn.state, turn.player)
                    action_list = [encode_action(cards) for cards in turn.valid_actions]
                    if turn.can_pass:
                        action_list.append(encode_pass_action())

                    if not action_list:
                        break

                    choice = bot.choose_action_index(state, action_list)
                    result = bridge.step(choice)

                if isinstance(result, GameOver):
                    win_order = result.win_order
                    result = bridge.next_game(win_order=win_order, greedy_seats=greedy_seats)

                if isinstance(result, TourneyOver):
                    # Determine model's final position
                    scores = result.scores
                    ranked = sorted(range(4), key=lambda p: scores[p], reverse=True)
                    model_pos = ranked.index(model_seat) + 1
                    tourney_positions.append(model_pos)
                    if model_pos == 1:
                        tourney_wins += 1
                    break

            if (t + 1) % 10 == 0:
                wr = tourney_wins / (t + 1)
                print(f"\r  {t+1}/{tourneys} tourneys, win rate: {wr:.1%}", end="", file=sys.stderr)

    n = len(tourney_positions)
    print(f"\n\nTournament Results ({tourneys} tournaments, target={target_score}):")
    print(f"  Win rate: {tourney_wins}/{n} ({tourney_wins/n:.1%})")
    pos_counts = [sum(1 for p in tourney_positions if p == rank) for rank in range(1, 5)]
    print(f"  1st: {pos_counts[0]:4d} ({pos_counts[0]/n:.1%})  "
          f"2nd: {pos_counts[1]:4d} ({pos_counts[1]/n:.1%})  "
          f"3rd: {pos_counts[2]:4d} ({pos_counts[2]/n:.1%})  "
          f"4th: {pos_counts[3]:4d} ({pos_counts[3]/n:.1%})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate ONNX model")
    parser.add_argument("--model", required=True, help="Path to .onnx model")
    parser.add_argument("--data", help="Path to JSONL game data for replay evaluation")
    parser.add_argument("--vs-greedy", action="store_true", help="Evaluate model vs greedy bots (1v3, 2v2, 3v1)")
    parser.add_argument("--vs-greedy-tourney", action="store_true",
                        help="Evaluate model in full tournaments vs greedy bots")
    parser.add_argument("--games", type=int, default=1000)
    parser.add_argument("--tourneys", type=int, default=100,
                        help="Number of tournaments to play")
    parser.add_argument("--target-score", type=int, default=21,
                        help="Tournament target score")
    args = parser.parse_args()

    if args.vs_greedy:
        evaluate_vs_greedy(args.model, args.games)
    elif args.vs_greedy_tourney:
        evaluate_tourney(args.model, args.tourneys, args.target_score)
    elif args.data:
        evaluate_replay(args.model, args.data, args.games)
    else:
        parser.error("Must specify either --vs-greedy, --vs-greedy-tourney, or --data")
