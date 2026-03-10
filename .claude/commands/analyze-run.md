Analyze a training run from `packages/training/data/`.

## Arguments
- `$ARGUMENTS`: A substring to match the run directory name (e.g., "2334", "0930", or a full directory name)

## Steps

1. **Find the run**: Look in `packages/training/data/` for a directory matching `$ARGUMENTS`. If ambiguous, list matches and ask.

2. **Read summary stats**: Read `eval-stats.csv` and `play-style.csv` in full. Read the last 10 lines of `epoch-stats.csv` (it can be very large).

3. **View the play style chart**: Read `play-style.png` to visualize training progression.

4. **Report a summary** covering:
   - **Run config**: Parse the directory name for hyperparameters (format: `YYYYMMDD-HHMM-algo-mode-epN-bN-eN-flags`)
   - **Win rate trajectory**: Start, peak, and final win rate + avg position. Compare to 25% random baseline.
   - **Training health**: Value loss trend (rising = bad), entropy trend, KL divergence
   - **Play style**: Combo distribution, pass rate, tactical pass rate, 2s retention, trick win rate
   - **Opponent mix**: How self-play vs average vs greedy vs random evolved (from epoch-stats)

5. **Deep dive on chops/bombs** (run via python3 one-liners against eval game JSONL files):
   - **Optional**: don't do this unless asked
   - Count actual bomb and quad plays across eval files (the CSV rounds to 0 at low rates)
   - When facing a single 2: how often does the bot have a bomb or quad? How often does it chop?
   - Bomb play confidence when played

6. **Compare to other runs** if multiple exist in `packages/training/data/`. Highlight what changed (hyperparams, shaping) and whether metrics improved.

7. **Provide assessment**: Is the run plateaued? Is value loss diverging? What would you try next?

## Key file formats

- `eval-stats.csv`: Per-eval-checkpoint metrics (win_rate, avg_position, score, entropy stats). ~30 rows.
- `play-style.csv`: Detailed play style metrics per eval (combo distribution, pass rates, run lengths, etc). ~30 rows.
- `epoch-stats.csv`: Per-epoch training metrics (policy_loss, value_loss, entropy, kl, opponent_mix). ~3000 rows.
- `eval-games-N.jsonl`: Full game logs per eval checkpoint. Each line is a JSON game with all model moves, hands, valid_action_count, top_probs, cards_to_beat, etc. Only model moves are logged.
- `play-style.png`: Multi-panel chart showing play style evolution over training.

## Game log schema (eval-games-N.jsonl)

Each line is a game:
```json
{
  "eval_num": 1, "game_num": 0, "model_seat": 1,
  "model_finish_position": 2, "win_order": [2, 1, 0, 3],
  "moves": [
    {
      "player": 1, "is_model": true, "hand_size": 13,
      "valid_action_count": 5, "chose_pass": false, "can_pass": true,
      "cards": [{"rank": 0, "suit": 2, "value": 2}],
      "combo_type": "SINGLE", "combo_size": 1,
      "top_probs": [{"action_index": 0, "prob": 0.98, "summary": "3d"}],
      "model_confidence": 0.98,
      "cards_to_beat": {"combo": "SINGLE", "cards_summary": "3s 3c"},
      "hand": [...], "opponent_hand_sizes": [11, 13, 13, 13],
      "passed_players": [false, false, false, false],
      "players_in_game": [true, true, true, true],
      "last_play_by": 0
    }
  ]
}
```

Note: Only model moves are logged. Opponent actions must be inferred from `cards_to_beat` and `last_play_by`. Rank 12 = 2 (the highest rank).
