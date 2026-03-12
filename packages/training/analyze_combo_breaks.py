#!/usr/bin/env python3
"""
Analyze how often models break up existing combos.

"Breaking up" = playing a SINGLE card that is part of a pair/triple/run in hand,
or playing a PAIR that is part of a triple in hand,
or playing a shorter run when a longer run was possible.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path


def get_pairs(hand_ranks):
    """Return set of ranks that appear 2+ times."""
    from collections import Counter
    counts = Counter(hand_ranks)
    return {rank for rank, cnt in counts.items() if cnt >= 2}


def get_triples(hand_ranks):
    """Return set of ranks that appear 3+ times."""
    from collections import Counter
    counts = Counter(hand_ranks)
    return {rank for rank, cnt in counts.items() if cnt >= 3}


def get_run_ranks(hand_ranks):
    """
    Return set of ranks that are part of a valid run (3+ consecutive).
    Rank 12 (2s) cannot be in runs. Ranks 0-11 = 3,4,5,6,7,8,9,10,J,Q,K,A
    """
    eligible = sorted(set(r for r in hand_ranks if r < 12))
    in_run = set()
    # Find all consecutive sequences of length 3+
    i = 0
    while i < len(eligible):
        j = i
        while j + 1 < len(eligible) and eligible[j + 1] == eligible[j] + 1:
            j += 1
        length = j - i + 1
        if length >= 3:
            for k in range(i, j + 1):
                in_run.add(eligible[k])
        i = j + 1
    return in_run


def get_max_run_length_for_rank(hand_ranks, rank):
    """Return the longest run containing `rank` that's possible from this hand."""
    eligible = sorted(set(r for r in hand_ranks if r < 12))
    if rank not in eligible:
        return 0
    # Find the run segment containing rank
    # Walk left and right
    left = rank
    while left - 1 in eligible:
        left -= 1
    right = rank
    while right + 1 in eligible:
        right += 1
    return right - left + 1


def analyze_file(filepath, eval_num=None):
    """
    Analyze combo-breaking behavior in a single eval-games file.
    Returns dict of statistics.
    """
    stats = {
        'total_plays': 0,
        'singles': 0,
        'singles_breaking_pair': 0,    # single played, card was part of pair in hand
        'singles_breaking_triple': 0,  # single played, card was part of triple in hand
        'singles_breaking_run': 0,     # single played, card was part of run in hand
        'pairs': 0,
        'pairs_breaking_triple': 0,    # pair played, rank was a triple in hand
        'runs': 0,
        'runs_suboptimal': 0,          # played run shorter than max possible run containing those cards
        'passes': 0,
    }

    with open(filepath) as f:
        for line in f:
            game = json.loads(line)
            for move in game['moves']:
                if not move['is_model']:
                    continue
                if move['chose_pass']:
                    stats['passes'] += 1
                    continue

                combo_type = move.get('combo_type')
                cards = move.get('cards') or []
                hand = move.get('hand') or []
                if not cards or not hand:
                    continue

                hand_ranks = [c['rank'] for c in hand]
                played_ranks = [c['rank'] for c in cards]

                stats['total_plays'] += 1

                if combo_type == 'SINGLE':
                    stats['singles'] += 1
                    rank = played_ranks[0]
                    pairs = get_pairs(hand_ranks)
                    triples = get_triples(hand_ranks)
                    run_ranks = get_run_ranks(hand_ranks)

                    if rank in triples:
                        stats['singles_breaking_triple'] += 1
                    elif rank in pairs:
                        stats['singles_breaking_pair'] += 1

                    if rank in run_ranks:
                        stats['singles_breaking_run'] += 1

                elif combo_type == 'PAIR':
                    stats['pairs'] += 1
                    rank = played_ranks[0]  # both cards same rank
                    triples = get_triples(hand_ranks)
                    if rank in triples:
                        stats['pairs_breaking_triple'] += 1

                elif combo_type == 'RUN':
                    stats['runs'] += 1
                    run_len = len(played_ranks)
                    # Check if any card in the run could extend further
                    max_possible = max(get_max_run_length_for_rank(hand_ranks, r) for r in played_ranks)
                    if max_possible > run_len:
                        stats['runs_suboptimal'] += 1

    return stats


def pct(num, denom):
    if denom == 0:
        return 0.0
    return 100.0 * num / denom


def analyze_run(run_dir, label, eval_nums=None):
    """Analyze one or more eval checkpoints from a run."""
    run_path = Path(run_dir)
    if eval_nums is None:
        # Use last 5 evals for stability
        files = sorted(run_path.glob('eval-games-*.jsonl'),
                       key=lambda p: int(p.stem.split('-')[-1]))
        eval_nums = [int(p.stem.split('-')[-1]) for p in files[-5:]]

    print(f"\n{'='*60}")
    print(f"Run: {label}")
    print(f"Analyzing evals: {eval_nums}")
    print(f"{'='*60}")

    totals = defaultdict(int)
    for n in eval_nums:
        fp = run_path / f'eval-games-{n}.jsonl'
        if not fp.exists():
            print(f"  WARNING: {fp} not found")
            continue
        s = analyze_file(fp, n)
        for k, v in s.items():
            totals[k] += v

    t = totals
    plays = t['total_plays']
    singles = t['singles']
    pairs = t['pairs']
    runs = t['runs']

    print(f"\nTotal plays (non-pass): {plays:,}")
    print(f"Singles: {singles:,} ({pct(singles, plays):.1f}%)")
    print(f"Pairs:   {pairs:,} ({pct(pairs, plays):.1f}%)")
    print(f"Runs:    {runs:,} ({pct(runs, plays):.1f}%)")

    print(f"\n--- Combo Break Analysis ---")
    print(f"Singles breaking a PAIR:   {t['singles_breaking_pair']:,} / {singles:,} = {pct(t['singles_breaking_pair'], singles):.1f}%")
    print(f"Singles breaking a TRIPLE: {t['singles_breaking_triple']:,} / {singles:,} = {pct(t['singles_breaking_triple'], singles):.1f}%")
    print(f"Singles breaking a RUN:    {t['singles_breaking_run']:,} / {singles:,} = {pct(t['singles_breaking_run'], singles):.1f}%")
    print(f"Pairs breaking a TRIPLE:   {t['pairs_breaking_triple']:,} / {pairs:,} = {pct(t['pairs_breaking_triple'], pairs):.1f}%")
    print(f"Runs suboptimal length:    {t['runs_suboptimal']:,} / {runs:,} = {pct(t['runs_suboptimal'], runs):.1f}%")

    print(f"\n--- Summary: any combo break ---")
    any_break = (t['singles_breaking_pair'] + t['singles_breaking_triple'] +
                 t['singles_breaking_run'] + t['pairs_breaking_triple'] + t['runs_suboptimal'])
    print(f"Total combo-breaking plays: {any_break:,} / {plays:,} = {pct(any_break, plays):.1f}% of all plays")

    return dict(totals)


if __name__ == '__main__':
    base = Path('/Users/binhrobles/code/thirteen-vibes/packages/training/data')

    run_2330 = base / '20260310-2330-ppo-nfsp-ep3000-b10000-e08-shaping'
    run_0957 = base / '20260311-0957-ppo-nfsp-ep3000-b10000-e08-shaping'

    # Analyze last 5 evals (epochs 2750-3000) for stable late-training behavior
    r1 = analyze_run(run_2330, '2330 (last 5 evals: ep2750-3000)')
    r2 = analyze_run(run_0957, '0957 (last 5 evals: ep2750-3000)')

    # Also compare at peak for each run
    print(f"\n{'='*60}")
    print("PEAK checkpoint comparison")
    print(f"{'='*60}")
    # 2330 peak was eval 26 (epoch 1300)
    analyze_run(run_2330, '2330 @ peak (eval 26, epoch 1300)', eval_nums=[26])
    # 0957 peak was eval 54 (epoch 2700)
    analyze_run(run_0957, '0957 @ peak (eval 54, epoch 2700)', eval_nums=[54])
