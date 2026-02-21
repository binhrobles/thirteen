# RL Training Infrastructure Design (bead fl4)

> **TODO**: SUITED_RUN combo is being added to game-logic. Once that lands, revisit:
> - Section 2 (Action Space): `evaluate()` will return suited runs separately; may affect MAX_ACTIONS sizing
> - Section 7 (DecisionRecord): `last_play.combo` values will include "SUITED_RUN"
> - Section 1 (Observation): `last_play_combo` one-hot may need an 8th slot for SUITED_RUN

## Context
Design the full RL training infrastructure for Tiến Lên — covering state features, action space, model variants, ONNX deployment, training framework, and (most importantly) training data collection & storage. This is a design document; implementation starts with data collection.

## 1. Observation Space (180 floats)

| Section | Size | Description |
|---------|------|-------------|
| `own_hand` | 52 | Binary: card i in my hand? |
| `cards_played` | 52 | Binary: card i already played? (from play log) |
| `last_play_cards` | 52 | Binary: card i in last play? |
| `last_play_combo` | 7 | One-hot: SINGLE/PAIR/TRIPLE/QUAD/RUN/BOMB/NONE |
| `last_play_by` | 1 | Relative seat [-1,1], -1 if none |
| `has_power` | 1 | Binary: can play anything? |
| `opponent_card_counts` | 3 | Float [0,1]: cards/13, clockwise from actor |
| `opponent_passed` | 3 | Binary: passed this round? |
| `opponent_in_game` | 3 | Binary: still playing? |
| `my_position` | 4 | One-hot: seat 0-3 |
| `win_order_len` | 1 | Float: players finished / 4 |
| `my_cards_remaining` | 1 | Float: my cards / 13 |

No hand heuristics — let the network learn them. Temporal history (last N plays) can be added later if needed.

## 2. Action Space — Enumerate + Mask

- `valid_actions = [pass] + getAllPlays(evaluate(hand, lastPlay))`
- Fixed output head: `MAX_ACTIONS = 300` logits with invalid actions masked to `-inf`
- Each action encoded as 52-bit card mask (pass = zero vector)
- Typical decision: 20-80 valid actions; 300 is generous headroom (needs empirical validation)

## 3. Three Model Variants

All share same obs/action space. Same 2-layer MLP architecture: `Input(180) → Dense(256, ReLU) → Dense(256, ReLU) → heads`

| Variant | Signal | Notes |
|---------|--------|-------|
| **Imitation Learning** | Cross-entropy vs human action | Supervised; ~500+ games needed |
| **PPO + Position Rewards** | 1st=+1.0, 2nd=+0.33, 3rd=-0.33, 4th=-1.0 | Self-play; init from imitation weights |
| **Vanilla RL** | Win=+1, Loss=-1, else 0 | Simpler signal, compare with PPO |

Training sequence: Collect human data → Imitation → PPO (initialized from imitation).

## 4. ONNX Deployment

- Export PyTorch → ONNX (opset 17), ~500KB-1MB model
- Stored in `s3://thirteen-ml-{stage}/models/v{N}/tienlen_bot.onnx`
- `SeatData.botProfile` maps to version: `"onnx:v3"` → load `models/v3/`
- Inference: <5ms per forward pass

## 5. Server-Side Bot Inference (Lambda)

- `onnxruntime-node` as Lambda Layer
- New `OnnxBotStrategy` implementing existing `BotStrategy` interface
- Bot selection via `seat.botProfile` (`undefined`/`"greedy"` → existing, `"onnx:vN"` → ONNX)
- Model cached in `/tmp` on cold start from S3

## 6. Self-Play Infrastructure

- Headless games using pure `game-logic` package (no I/O deps)
- Runs locally or EC2, NOT Lambda (pure compute, no AWS overhead needed)
- Single game ~50ms → 10K games in ~8 min single-threaded
- Output: same JSONL.gz format as live game data → S3

## 7. Training Data Collection & Storage (IMPLEMENT FIRST)

### What to capture — per decision point:

```typescript
interface DecisionRecord {
  game_id: string;
  decision_index: number;
  player_seat: number;           // 0-3
  player_type: "human" | "bot";
  bot_profile?: string;
  hand: number[];                // card values in hand
  opponent_hand_sizes: number[]; // [3 values] clockwise from actor
  last_play: { combo: string; cards: number[]; played_by: number } | null;
  passed_players: boolean[];     // [4]
  players_in_game: boolean[];    // [4]
  win_order: number[];
  cards_played_global: number[]; // all cards played so far
  valid_actions: number[][];     // each sub-array is a legal play
  action_taken: number[];        // cards played ([] = pass)
  action_index: number;          // index into valid_actions
  final_position: number;        // 0-3 (backfilled at game end)
  reward: number;                // position-based (backfilled)
}
```

### Game-level metadata:
```typescript
interface GameRecord {
  game_id: string;
  tourney_id: string;
  game_number: number;
  started_at: number;
  ended_at: number;
  total_decisions: number;
  win_order: number[];
  player_types: string[];     // per seat
  initial_hands: number[][];  // all 4 dealt hands (for replay)
  data_version: "1.0";
}
```

### Format & Storage
- **JSONL.gz** — first line = GameRecord, rest = DecisionRecords
- **S3**: `s3://thirteen-ml/training-data/{stage}/{YYYY}/{MM}/{DD}/{game_id}.jsonl.gz`
- **DynamoDB index**: `thirteen-training-meta` (PK: `{stage}#{game_id}`) for querying games by date/type
- Single shared bucket/table with stage prefixes (simpler, less isolation overhead)

### Collection approach — Post-game reconstruction (Option A)
- Hook into `finishMove()` in `default.ts` after `game.isGameOver()`
- Replay from `initialHands` + `playLog` to reconstruct full observation at each decision
- Fire-and-forget S3 write (no added latency to game flow)
- Requires storing `initialHands` on Tourney at `startGame()`

### What gets logged
- **All decisions** — both human and bot. Tagged with `player_type` so bot data can be filtered during imitation training. Useful for pipeline validation and volume.

### Privacy
- Hash playerIds with per-dataset salt → `player_hash`
- No names or connectionIds in training data
- Seat positions preserved (game-relevant)

### Implementation steps:
1. Add `initialHands` to Tourney (populate in `startGame()`, persist to DDB)
2. AWS infra in `backend/template.yaml`: S3 bucket (`thirteen-ml`), DDB table (`thirteen-training-meta`), IAM permissions for DefaultFunction
3. Create `packages/server/src/lib/training-data.ts` — replay engine that reconstructs observations from `initialHands` + `playLog`, builds DecisionRecords, gzips JSONL, writes to S3, indexes in DDB
4. Hook `emitTrainingData()` into `finishMove()` in `default.ts` (fire-and-forget, catch errors)
5. Validate: play a game, verify JSONL.gz in S3, metadata in DDB, spot-check schema

## 8. Training Framework

- **PyTorch** + **Stable-Baselines3** (`MaskablePPO` from sb3-contrib)
- Training env approach (Python port vs Node subprocess) deferred until we start building it
- Focus now is on data collection in TypeScript

```
packages/training/        # New Python package (not in yarn workspace)
  pyproject.toml
  src/
    tienlen_env.py        # Gymnasium environment
    features.py           # Observation builder
    imitation.py          # Behavioral cloning
    ppo_train.py          # PPO self-play
    export_onnx.py        # → ONNX
    data_loader.py        # S3 JSONL.gz reader
```

## Critical Files
- `packages/server/src/default.ts` — `finishMove()` hook point
- `packages/game-logic/src/game-state.ts` — `playLog`, snapshot serialization
- `packages/game-logic/src/bot/hand-evaluator.ts` — `evaluate()` for action enumeration
- `packages/game-logic/src/tourney.ts` — needs `initialHands` field
- `backend/template.yaml` — new S3 bucket, DDB table, IAM perms

## Dependency Order
```
Data Collection (§7) → Features (§1) → Action Space (§2) → Training Framework (§8)
  → Imitation (§3a) → PPO (§3b/c) + Self-Play (§6) → ONNX Export (§4) → Lambda Inference (§5)
```
