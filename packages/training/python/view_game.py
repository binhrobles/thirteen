"""
Terminal-based game replay viewer.

Loads JSONL game logs from GameLogger and pretty-prints games
move-by-move with card symbols and model confidence.

Usage:
    python view_game.py data/run-eval-games-5.jsonl              # all games
    python view_game.py data/run-eval-games-5.jsonl --flagged     # only interesting ones
    python view_game.py data/run-eval-games-5.jsonl --game 7      # specific game
    python view_game.py data/run-eval-games-5.jsonl --step         # press enter to advance
"""

import argparse
import json
import sys
from collections import Counter

RANK_NAMES = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]
SUIT_SYMBOLS = ["\u2660", "\u2663", "\u2666", "\u2665"]  # spade club diamond heart


def card_str(card: dict) -> str:
    return f"{RANK_NAMES[card['rank']]}{SUIT_SYMBOLS[card['suit']]}"


def cards_str(cards: list[dict]) -> str:
    return " ".join(card_str(c) for c in cards)


def _sort_hand(hand: list[dict]) -> list[dict]:
    """Sort cards by value (rank*4 + suit) for display."""
    return sorted(hand, key=lambda c: c["value"])


def _player_label(seat: int, model_seat: int) -> str:
    return "MODEL" if seat == model_seat else f"P{seat}"


def print_move(move: dict, model_seat: int):
    """Pretty-print a single move with full game context."""
    player = move["player"]
    is_model = move["is_model"]
    role = "MODEL" if is_model else "greedy"

    print(f"  ── Move {move['move_num']} | Player {player} ({role}) ──")

    # Table state: opponent hand sizes + pass/out/leading status
    opp_sizes = move.get("opponent_hand_sizes", [])
    passed = move.get("passed_players", [])
    in_game = move.get("players_in_game", [])
    last_play_by = move.get("last_play_by")
    if opp_sizes:
        table_parts = []
        for i in range(4):
            label = _player_label(i, model_seat)
            if i < len(in_game) and not in_game[i]:
                table_parts.append(f"{label}: OUT")
            elif i < len(passed) and passed[i]:
                table_parts.append(f"{label}: {opp_sizes[i]} (passed)")
            else:
                table_parts.append(f"{label}: {opp_sizes[i]}")
        print(f"    Table: {' | '.join(table_parts)}")

    # Round context: who's leading and what's on the table
    if not move["can_pass"]:
        print(f"    >> New round (has power)")
    elif move["cards_to_beat"] and last_play_by is not None:
        leader = _player_label(last_play_by, model_seat)
        ctb = move["cards_to_beat"]
        print(f"    >> {leader} leads: {ctb['combo']} [{ctb['cards_summary']}]")

    # Model's hand
    if is_model and move.get("hand"):
        sorted_hand = _sort_hand(move["hand"])
        print(f"    Hand: [{cards_str(sorted_hand)}]")

    # Chosen action
    if move["chose_pass"]:
        conf_str = f"  (confidence: {move['model_confidence']:.2f})" if is_model else ""
        print(f"    >>> PASS{conf_str}")
    else:
        combo = move["combo_type"] or "?"
        card_display = cards_str(move["cards"]) if move["cards"] else "?"
        conf_str = f"  (confidence: {move['model_confidence']:.2f})" if is_model else ""
        print(f"    >>> {combo} [{card_display}]{conf_str}")

    # Top choices (model only)
    if is_model and move["top_probs"]:
        print(f"    Alternatives:")
        for i, tp in enumerate(move["top_probs"][:5]):
            print(f"      {i+1}. {tp['summary']:20s}  p={tp['prob']:.3f}")

    print()


def print_game_summary(game: dict):
    """Print a summary of the game."""
    model_moves = [m for m in game["moves"] if m["is_model"]]
    combo_counts = Counter(m["combo_type"] for m in model_moves if not m["chose_pass"])
    passes = sum(1 for m in model_moves if m["chose_pass"])

    print("=" * 60)
    print(f"Game {game['game_num']} Summary")
    print(f"  Model seat: {game['model_seat']} | "
          f"Finish: {_ordinal(game['model_finish_position'])} | "
          f"Flags: {game['flags'] or ['none']}")
    print(f"  Total moves: {game['total_moves']} | Model moves: {game['model_moves']}")
    combo_str = ", ".join(f"{count} {ct.lower()}s" for ct, count in combo_counts.most_common())
    print(f"  Combos: {combo_str}, {passes} passes")

    if model_moves:
        confs = [m["model_confidence"] for m in model_moves if m["model_confidence"] > 0]
        if confs:
            print(f"  Confidence: avg={sum(confs)/len(confs):.3f} "
                  f"min={min(confs):.3f} max={max(confs):.3f}")
    print(f"  Win order: {game['win_order']}")
    print("=" * 60)


def _ordinal(n: int) -> str:
    suffixes = {1: "st", 2: "nd", 3: "rd"}
    return f"{n}{suffixes.get(n, 'th')}"


def load_games(path: str) -> list[dict]:
    games = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                games.append(json.loads(line))
    return games


def view_games(games: list[dict], step_mode: bool = False):
    """Display games to terminal."""
    for i, game in enumerate(games):
        print(f"\n{'=' * 60}")
        print(f"GAME {game['game_num']} | Eval {game['eval_num']} | "
              f"Model seat: {game['model_seat']} | "
              f"Result: {_ordinal(game['model_finish_position'])}")
        if game["flags"]:
            print(f"  Flags: {', '.join(game['flags'])}")
        print("=" * 60)

        for move in game["moves"]:
            print_move(move, game["model_seat"])
            if step_mode:
                try:
                    input("  [Enter to continue, Ctrl+C to stop]")
                except (KeyboardInterrupt, EOFError):
                    print("\nStopped.")
                    return

        print_game_summary(game)

        if i < len(games) - 1 and step_mode:
            try:
                input("\n[Enter for next game, Ctrl+C to stop]")
            except (KeyboardInterrupt, EOFError):
                print("\nStopped.")
                return


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="View eval game logs")
    parser.add_argument("file", help="Path to JSONL game log file")
    parser.add_argument("--flagged", action="store_true", help="Only show flagged games")
    parser.add_argument("--game", type=int, help="Show specific game by index")
    parser.add_argument("--step", action="store_true", help="Step-by-step mode (press enter to advance)")
    parser.add_argument("--losses", action="store_true", help="Only show games where model lost")
    args = parser.parse_args()

    games = load_games(args.file)
    print(f"Loaded {len(games)} games from {args.file}")

    if args.game is not None:
        if 0 <= args.game < len(games):
            games = [games[args.game]]
        else:
            print(f"Game index {args.game} out of range (0-{len(games)-1})")
            sys.exit(1)
    elif args.flagged:
        games = [g for g in games if g["flags"]]
        print(f"  {len(games)} flagged games")
    elif args.losses:
        games = [g for g in games if g["model_finish_position"] > 1]
        print(f"  {len(games)} losses")

    if not games:
        print("No games to display.")
        sys.exit(0)

    view_games(games, step_mode=args.step)
