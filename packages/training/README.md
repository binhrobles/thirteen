# Training Pipeline

End-to-end pipeline for training Tiến Lên bots via imitation learning and RL.

## Validation Pipeline (Imitation Learning)

### 1. Generate training data

Simulates 10K games of 4 greedy bots playing each other. At every decision point, records the full game state, all legal moves, and which move the bot chose. Outputs one JSON object per game to a JSONL file (~13MB per 1K games).

```bash
# From repo root
yarn workspace @thirteen/game-logic generate-data --games=10000 --output=packages/training/data/greedy-10k.jsonl
```

### 2. Train imitation model

Behavioral cloning: loads every decision from the JSONL, encodes the game state (337 floats) and all valid actions (63 floats each), then trains the neural net to predict which action the greedy bot chose. Uses cross-entropy loss with a 90/10 train/val split. Saves the best checkpoint by validation accuracy.

```bash
cd packages/training/python
uv run train_imitation.py --data ../data/greedy-10k.jsonl --epochs 50 --output ../data/imitation-model.pt
```

Expect ~95%+ accuracy on greedy bot cloning (it's a deterministic strategy, so the model should learn it almost perfectly).

### 3. Export to ONNX

Converts the PyTorch model to ONNX format so it can run in TypeScript (via onnxruntime-node on Lambda, or onnxruntime-web in the browser). Validates the export by comparing PyTorch vs ONNX outputs on dummy input — they should match within 1e-4. Produces a ~500KB file.

```bash
uv run export_onnx.py --model ../data/imitation-model.pt --output ../data/imitation-bot.onnx
```

### 4. Evaluate

Replays the JSONL training data through the ONNX model and measures how often it picks the same action as the greedy bot. Reports an action match rate (1.0 = perfect clone). This validates the full pipeline: TS encoding → JSONL → Python encoding → training → ONNX export → inference all produce consistent results.

```bash
uv run evaluate.py --model ../data/imitation-bot.onnx --data ../data/greedy-10k.jsonl --games 1000
```

## PPO Pipeline (EC2)

PPO trains via self-play through a TS↔Python bridge. The game engine stays in TypeScript; Python drives all 4 seats and collects trajectories for PPO updates.

### Running locally

```bash
cd packages/training/python
uv run train_ppo.py --epochs 100 --batch-size 2048 --output ../data/ppo-model.pt
```

### Running on EC2

`run.sh` automates the full workflow: git pull → PPO training → ONNX export → S3 upload → evaluation.

```bash
./run.sh                          # Full pipeline with defaults
./run.sh --skip-pull --epochs 2000  # Skip git pull, override epochs
```

Set `S3_BUCKET` env var to override the default bucket (`thirteen-training`).

### Evaluation

```bash
# Model vs greedy bots (runs 1v3, 2v2, 3v1 configs with randomized seating)
uv run evaluate.py --model ../data/bot.onnx --vs-greedy --games 1000

# Replay evaluation (compare model choices to greedy bot on JSONL data)
uv run evaluate.py --model ../data/bot.onnx --data ../data/greedy-10k.jsonl --games 1000
```

## Architecture

See [docs/rl-training-design.md](../../docs/rl-training-design.md) for the full design.

### Game Bridge

PPO training uses a stdin/stdout JSON-line bridge between Python and the TS game engine:

```
Python (train_ppo.py) ←→ game_bridge.py ←→ [subprocess] game-server.ts ←→ GameState
```

- `game-server.ts` — TS process that accepts `new_game`/`step`/`quit` commands, returns game state + valid actions
- `game_bridge.py` — Python wrapper that spawns and manages the TS subprocess
- The TS process stays alive across games for efficiency

### File Layout

- **TypeScript** (packages/game-logic/src/training/): Feature encoders, game logger, data generation, game server
- **Python** (packages/training/python/): Model definition, training scripts (imitation + PPO), ONNX export, game bridge
- **Data format**: JSONL — one game per line with full state snapshots at each decision point
