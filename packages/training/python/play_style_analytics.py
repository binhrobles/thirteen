"""
Play style analytics — post-processing of eval game logs.

Reads JSONL game logs from GameLogger and computes aggregate play style
metrics across eval checkpoints. Outputs CSV and optional matplotlib plots.

Usage:
    python play_style_analytics.py --run-dir data/ --run-prefix ppo-nfsp-ep1000-b2048-e05-shaping
    python play_style_analytics.py --run-dir data/ --run-prefix ... --plot
    python play_style_analytics.py --input data/run-eval-games-5.jsonl  # single file
"""

import argparse
import csv
import json
import os
import re
from collections import defaultdict
from glob import glob


COMBO_TYPES = ["SINGLE", "PAIR", "TRIPLE", "QUAD", "RUN", "BOMB"]


def load_games(path: str) -> list[dict]:
    """Load games from a JSONL file."""
    games = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                games.append(json.loads(line))
    return games


def compute_metrics(games: list[dict]) -> dict:
    """Compute play style metrics from a list of game records."""
    # Round-level combo tracking: count the combo type once per round,
    # determined by the first play (the lead). This avoids biasing toward
    # singles (which have many plays per round) vs pairs/runs (fewer).
    round_combo_counts: dict[str, int] = defaultdict(int)
    total_rounds = 0
    total_plays = 0  # non-pass model moves
    total_decisions = 0  # all model decisions
    total_passes = 0
    tactical_pass_opportunities = 0  # can_pass AND has plays
    tactical_passes = 0
    cards_per_play: list[int] = []
    run_lengths: list[int] = []
    twos_retention: list[float] = []
    trick_wins = 0
    trick_opportunities = 0
    confidences: list[float] = []
    wins = 0

    position_counts = {1: 0, 2: 0, 3: 0, 4: 0}
    model_moves_all: list[int] = []
    model_moves_win: list[int] = []
    model_moves_loss: list[int] = []

    for game in games:
        pos = game["model_finish_position"]
        position_counts[pos] = position_counts.get(pos, 0) + 1
        if pos == 1:
            wins += 1
        moves = game["model_moves"]
        model_moves_all.append(moves)
        if pos == 1:
            model_moves_win.append(moves)
        else:
            model_moves_loss.append(moves)

        model_play_index = 0
        first_two_index = None
        current_round_combo: str | None = None

        for move in game["moves"]:
            if not move["is_model"]:
                continue

            total_decisions += 1

            if move["model_confidence"] > 0:
                confidences.append(move["model_confidence"])

            # New round detection: can_pass=False means model has power (leads)
            if not move["can_pass"]:
                trick_wins += 1
                current_round_combo = None  # reset for new round
                # This is a new round — record its combo type from the lead
                if not move["chose_pass"] and move["combo_type"]:
                    current_round_combo = move["combo_type"]
                    round_combo_counts[current_round_combo] += 1
                    total_rounds += 1
                    if current_round_combo == "RUN":
                        run_lengths.append(move["combo_size"])
            elif current_round_combo is None and move["cards_to_beat"]:
                # First model turn in a round led by a greedy bot
                ctb_combo = move["cards_to_beat"].get("combo")
                if ctb_combo:
                    current_round_combo = ctb_combo
                    round_combo_counts[current_round_combo] += 1
                    total_rounds += 1
                    if current_round_combo == "RUN" and move["cards_to_beat"].get("cards_summary"):
                        # Estimate run length from the lead's card count
                        lead_cards = move["cards_to_beat"]["cards_summary"].split()
                        run_lengths.append(len(lead_cards))

            trick_opportunities += 1

            if move["chose_pass"]:
                total_passes += 1
                # Tactical pass: chose to pass when could have played
                if move["can_pass"] and move["valid_action_count"] > 1:
                    tactical_passes += 1
                    tactical_pass_opportunities += 1
            else:
                total_plays += 1
                cards_per_play.append(move["combo_size"])

                # Track 2s retention
                if move["cards"]:
                    has_two = any(c["rank"] == 12 for c in move["cards"])
                    if has_two and first_two_index is None:
                        first_two_index = model_play_index

                model_play_index += 1

                # Count tactical pass opportunities (had plays available + could pass)
                if move["can_pass"]:
                    tactical_pass_opportunities += 1

        # Twos retention for this game
        total_model_plays = model_play_index
        if first_two_index is not None and total_model_plays > 0:
            twos_retention.append(first_two_index / total_model_plays)
        else:
            twos_retention.append(1.0)  # never played a 2

    n_games = len(games)

    # Combo percentages (per-round, not per-play)
    metrics: dict = {"games": n_games}
    metrics["win_rate"] = wins / n_games if n_games else 0

    # Position distribution
    for p in range(1, 5):
        metrics[f"position_{p}_pct"] = round(position_counts[p] / n_games, 4) if n_games else 0
    metrics["avg_position"] = round(
        sum(p * position_counts[p] for p in range(1, 5)) / n_games, 4
    ) if n_games else 2.5

    # Rounds to finish (model_moves as proxy for turns taken)
    metrics["avg_rounds"] = round(sum(model_moves_all) / len(model_moves_all), 2) if model_moves_all else 0
    metrics["avg_rounds_win"] = round(sum(model_moves_win) / len(model_moves_win), 2) if model_moves_win else 0
    metrics["avg_rounds_loss"] = round(sum(model_moves_loss) / len(model_moves_loss), 2) if model_moves_loss else 0

    for ct in COMBO_TYPES:
        pct = round_combo_counts[ct] / total_rounds if total_rounds else 0
        metrics[f"combo_pct_{ct.lower()}"] = round(pct, 4)

    metrics["pass_rate"] = round(total_passes / total_decisions, 4) if total_decisions else 0
    metrics["tactical_pass_rate"] = (
        round(tactical_passes / tactical_pass_opportunities, 4)
        if tactical_pass_opportunities else 0
    )
    metrics["avg_cards_per_play"] = (
        round(sum(cards_per_play) / len(cards_per_play), 2) if cards_per_play else 0
    )

    # Run length distribution
    run_3 = sum(1 for r in run_lengths if r == 3)
    run_4 = sum(1 for r in run_lengths if r == 4)
    run_5 = sum(1 for r in run_lengths if r == 5)
    run_6plus = sum(1 for r in run_lengths if r >= 6)
    total_runs = len(run_lengths)
    metrics["run_len_3"] = round(run_3 / total_runs, 4) if total_runs else 0
    metrics["run_len_4"] = round(run_4 / total_runs, 4) if total_runs else 0
    metrics["run_len_5"] = round(run_5 / total_runs, 4) if total_runs else 0
    metrics["run_len_6plus"] = round(run_6plus / total_runs, 4) if total_runs else 0

    metrics["twos_retention"] = (
        round(sum(twos_retention) / len(twos_retention), 4) if twos_retention else 1.0
    )
    metrics["trick_win_rate"] = (
        round(trick_wins / trick_opportunities, 4) if trick_opportunities else 0
    )
    metrics["avg_confidence"] = (
        round(sum(confidences) / len(confidences), 4) if confidences else 0
    )

    return metrics


def find_eval_files(run_dir: str) -> list[tuple[int, str]]:
    """Find all eval game JSONL files for a run, return sorted (eval_num, path) pairs."""
    pattern = os.path.join(run_dir, "eval-games-*.jsonl")
    files = glob(pattern)
    results = []
    for f in files:
        m = re.search(r"eval-games-(\d+)\.jsonl$", f)
        if m:
            results.append((int(m.group(1)), f))
    return sorted(results)


def load_entropy_by_eval(run_dir: str) -> dict[int, dict]:
    """Load eval-stats.csv and return entropy stats per eval_num."""
    eval_csv = os.path.join(run_dir, "eval-stats.csv")
    if not os.path.exists(eval_csv):
        return {}
    result: dict[int, dict] = {}
    with open(eval_csv) as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                eval_num = int(row["eval_num"])
                result[eval_num] = {
                    "mean": float(row["entropy_mean"]),
                    "min": float(row["entropy_min"]),
                    "max": float(row["entropy_max"]),
                    "trend": float(row["entropy_trend"]),
                }
            except (KeyError, ValueError):
                continue
    return result


def load_value_loss_by_eval(run_dir: str) -> dict[int, float]:
    """Load epoch-stats.csv and return avg value_loss per eval window, keyed by eval_num."""
    epoch_csv = os.path.join(run_dir, "epoch-stats.csv")
    if not os.path.exists(epoch_csv):
        return {}

    # Read all epochs with their value_loss
    epoch_rows: list[tuple[int, float]] = []
    with open(epoch_csv) as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                epoch_rows.append((int(row["epoch"]), float(row["value_loss"])))
            except (KeyError, ValueError):
                continue

    if not epoch_rows:
        return {}

    # Find eval_interval by looking at eval-stats.csv
    eval_csv = os.path.join(run_dir, "eval-stats.csv")
    eval_epochs: list[int] = []
    if os.path.exists(eval_csv):
        with open(eval_csv) as f:
            reader = csv.DictReader(f)
            for row in reader:
                try:
                    eval_epochs.append(int(row["epoch"]))
                except (KeyError, ValueError):
                    continue

    if not eval_epochs:
        return {}

    # Assign each epoch to an eval window and average value_loss
    result: dict[int, float] = {}
    boundaries = [0] + eval_epochs
    for eval_num, (start, end) in enumerate(zip(boundaries, boundaries[1:]), start=1):
        window_losses = [loss for epoch, loss in epoch_rows if start < epoch <= end]
        if window_losses:
            result[eval_num] = round(sum(window_losses) / len(window_losses), 6)

    return result


def analyze_run(run_dir: str) -> list[dict]:
    """Analyze all eval checkpoints for a training run."""
    files = find_eval_files(run_dir)
    if not files:
        print(f"No eval game files found in {run_dir}")
        return []

    value_loss_by_eval = load_value_loss_by_eval(run_dir)
    entropy_by_eval = load_entropy_by_eval(run_dir)

    all_metrics = []
    for eval_num, path in files:
        games = load_games(path)
        metrics = compute_metrics(games)
        metrics["eval_num"] = eval_num
        metrics["avg_value_loss"] = value_loss_by_eval.get(eval_num, None)
        ent = entropy_by_eval.get(eval_num, {})
        metrics["entropy_mean"] = ent.get("mean")
        metrics["entropy_min"] = ent.get("min")
        metrics["entropy_max"] = ent.get("max")
        all_metrics.append(metrics)
        print(f"  Eval {eval_num}: {metrics['games']} games, "
              f"win={metrics['win_rate']:.1%}, "
              f"avg_pos={metrics['avg_position']:.2f}, "
              f"rounds={metrics['avg_rounds']:.1f} (win={metrics['avg_rounds_win']:.1f} loss={metrics['avg_rounds_loss']:.1f}), "
              f"val_loss={metrics['avg_value_loss']:.4f}" if metrics['avg_value_loss'] else "")

    return all_metrics


def write_csv(metrics_list: list[dict], output_path: str = "play-style.csv"):
    """Write metrics to CSV."""
    if not metrics_list:
        return

    fieldnames = [
        "eval_num", "games", "win_rate", "avg_position", "avg_value_loss",
        "avg_rounds", "avg_rounds_win", "avg_rounds_loss",
        "position_1_pct", "position_2_pct", "position_3_pct", "position_4_pct",
        "pass_rate", "tactical_pass_rate",
        "combo_pct_single", "combo_pct_pair", "combo_pct_run",
        "combo_pct_triple", "combo_pct_quad", "combo_pct_bomb",
        "avg_cards_per_play", "run_len_3", "run_len_4", "run_len_5", "run_len_6plus",
        "twos_retention", "trick_win_rate",
    ]

    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(metrics_list)

    print(f"CSV written to {output_path}")


def plot_metrics(metrics_list: list[dict], output_path: str):
    """Generate matplotlib plots of play style evolution."""
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib not installed — skipping plots. Install with: pip install matplotlib")
        return

    if len(metrics_list) < 2:
        print("Need at least 2 eval checkpoints for plots")
        return

    evals = [m["eval_num"] for m in metrics_list]

    fig, axes = plt.subplots(3, 3, figsize=(15, 14))
    fig.suptitle("Play Style Evolution Over Training", fontsize=14)

    # 0. Finish position distribution (stacked area)
    ax = axes[0][0]
    pos_data = {
        f"{p}{'st' if p==1 else 'nd' if p==2 else 'rd' if p==3 else 'th'}": [m[f"position_{p}_pct"] for m in metrics_list]
        for p in range(1, 5)
    }
    ax.stackplot(evals, *pos_data.values(), labels=pos_data.keys(), alpha=0.8,
                 colors=["#2ecc71", "#3498db", "#e67e22", "#e74c3c"])
    ax.set_title("Finish Position Distribution")
    ax.set_ylabel("Fraction of games")
    ax.axhline(y=0.25, color="gray", linestyle="--", alpha=0.5)
    ax.legend(loc="upper right", fontsize=7)
    ax.set_ylim(0, 1)

    # 1. Combo distribution (stacked area)
    ax = axes[0][1]
    combo_data = {}
    for ct in COMBO_TYPES:
        combo_data[ct] = [m[f"combo_pct_{ct.lower()}"] for m in metrics_list]
    ax.stackplot(evals, *combo_data.values(), labels=combo_data.keys(), alpha=0.8)
    ax.set_title("Combo Distribution")
    ax.set_ylabel("Fraction of plays")
    ax.legend(loc="upper right", fontsize=7)
    ax.set_ylim(0, 1)

    # 2. Pass rate + tactical pass rate
    ax = axes[0][2]
    ax.plot(evals, [m["pass_rate"] for m in metrics_list], "b-o", label="Overall pass rate", markersize=4)
    ax.plot(evals, [m["tactical_pass_rate"] for m in metrics_list], "r-s", label="Tactical pass rate", markersize=4)
    ax.set_title("Pass Rates")
    ax.set_ylabel("Rate")
    ax.legend(fontsize=8)
    ax.set_ylim(0, 1)

    # 3. 2s retention
    ax = axes[1][0]
    ax.plot(evals, [m["twos_retention"] for m in metrics_list], "g-o", markersize=4)
    ax.set_title("2s Retention")
    ax.set_ylabel("Normalized play index\n(1.0 = never played)")
    ax.set_ylim(0, 1.1)

    # 4. Value loss trend
    ax = axes[1][1]
    vl = [m.get("avg_value_loss") for m in metrics_list]
    vl_evals = [e for e, v in zip(evals, vl) if v is not None]
    vl_vals = [v for v in vl if v is not None]
    if vl_vals:
        ax.plot(vl_evals, vl_vals, "m-o", markersize=4)
    ax.set_title("Value Loss (avg per eval window)")
    ax.set_ylabel("MSE loss")

    # 5. Run length distribution
    ax = axes[1][2]
    ax.plot(evals, [m["run_len_3"] for m in metrics_list], "b-o", label="3-card", markersize=4)
    ax.plot(evals, [m["run_len_4"] for m in metrics_list], "r-s", label="4-card", markersize=4)
    ax.plot(evals, [m["run_len_5"] for m in metrics_list], "g-s", label="5-card", markersize=4)
    ax.plot(evals, [m["run_len_6plus"] for m in metrics_list], "c-^", label="6+ card", markersize=4)
    ax.set_title("Run Length Distribution")
    ax.set_ylabel("Fraction of runs")
    ax.legend(fontsize=8)
    ax.set_ylim(0, 1)

    # 6. Avg rounds to finish
    ax = axes[2][0]
    ax.plot(evals, [m["avg_rounds"] for m in metrics_list], "b-o", label="All games", markersize=4)
    ax.plot(evals, [m["avg_rounds_win"] for m in metrics_list], "g-s", label="Wins (1st)", markersize=4)
    ax.plot(evals, [m["avg_rounds_loss"] for m in metrics_list], "r-^", label="Losses (2nd-4th)", markersize=4)
    ax.set_title("Avg Turns to Finish")
    ax.set_ylabel("Model turns taken")
    ax.legend(fontsize=8)

    # 7. Average finish position
    ax = axes[2][1]
    ax.plot(evals, [m["avg_position"] for m in metrics_list], "r-o", markersize=4)
    ax.set_title("Avg Finish Position")
    ax.set_ylabel("Position (lower = better)")
    ax.axhline(y=2.5, color="gray", linestyle="--", alpha=0.5, label="Random (2.5)")
    ax.legend(fontsize=8)
    ax.set_ylim(1, 4)
    ax.invert_yaxis()

    # 8. Entropy (mean with min/max band)
    ax = axes[2][2]
    ent_evals = [e for e, m in zip(evals, metrics_list) if m.get("entropy_mean") is not None]
    ent_mean = [m["entropy_mean"] for m in metrics_list if m.get("entropy_mean") is not None]
    ent_min = [m["entropy_min"] for m in metrics_list if m.get("entropy_min") is not None]
    ent_max = [m["entropy_max"] for m in metrics_list if m.get("entropy_max") is not None]
    if ent_mean:
        ax.plot(ent_evals, ent_mean, "b-o", label="Mean entropy", markersize=4)
        ax.fill_between(ent_evals, ent_min, ent_max, alpha=0.2, color="blue", label="Min/max range")
    ax.axhline(y=0.5, color="red", linestyle="--", alpha=0.6, label="Target (0.5)")
    ax.set_title("Policy Entropy")
    ax.set_ylabel("Entropy (nats)")
    ax.legend(fontsize=8)
    ax.set_ylim(0, 1.0)

    for row in axes:
        for ax in row:
            if ax.get_visible():
                ax.set_xlabel("Eval checkpoint")
                ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)
    print(f"Plot saved to {output_path}")
    plt.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Play style analytics from eval game logs")
    parser.add_argument("--input", help="Single JSONL file to analyze")
    parser.add_argument("--run-dir", help="Run directory containing eval game JSONL files")
    parser.add_argument("--plot", action="store_true", help="Generate matplotlib plots")
    args = parser.parse_args()

    if args.input:
        games = load_games(args.input)
        metrics = compute_metrics(games)
        print(f"\nPlay style metrics ({len(games)} games):")
        for k, v in metrics.items():
            print(f"  {k}: {v}")
    elif args.run_dir:
        print(f"Analyzing run: {args.run_dir}")
        all_metrics = analyze_run(args.run_dir)

        if all_metrics:
            csv_path = os.path.join(args.run_dir, "play-style.csv")
            write_csv(all_metrics, csv_path)

            if args.plot:
                plot_path = os.path.join(args.run_dir, "play-style.png")
                plot_metrics(all_metrics, plot_path)
    else:
        parser.error("Must specify either --input or --run-dir")
