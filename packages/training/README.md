# Training Pipeline

End-to-end pipeline for training Tiến Lên bots via imitation learning and RL.

## Quick Start

### 1. Generate training data

Simulates 10K games of 4 greedy bots playing each other. At every decision point, records the full game state, all legal moves, and which move the bot chose. Outputs one JSON object per game to a JSONL file (~13MB per 1K games).

```bash
# From repo root
yarn workspace @thirteen/game-logic generate-data --games=10000 --output=packages/training/data/greedy-10k.jsonl
```

### 2. Install Python dependencies

Installs PyTorch (training framework), ONNX (model format), and ONNX Runtime (inference engine). ~2GB download for PyTorch.

```bash
cd packages/training/python
pip install -r requirements.txt
```

### 3. Train imitation model

Behavioral cloning: loads every decision from the JSONL, encodes the game state (337 floats) and all valid actions (63 floats each), then trains the neural net to predict which action the greedy bot chose. Uses cross-entropy loss with a 90/10 train/val split. Saves the best checkpoint by validation accuracy.

```bash
python train_imitation.py --data ../data/greedy-10k.jsonl --epochs 50 --output ../data/model.pt
```

Expect ~95%+ accuracy on greedy bot cloning (it's a deterministic strategy, so the model should learn it almost perfectly).

### 4. Export to ONNX

Converts the PyTorch model to ONNX format so it can run in TypeScript (via onnxruntime-node on Lambda, or onnxruntime-web in the browser). Validates the export by comparing PyTorch vs ONNX outputs on dummy input — they should match within 1e-4. Produces a ~500KB file.

```bash
python export_onnx.py --model ../data/model.pt --output ../data/bot.onnx
```

### 5. Evaluate

Replays the JSONL training data through the ONNX model and measures how often it picks the same action as the greedy bot. Reports an action match rate (1.0 = perfect clone). This validates the full pipeline: TS encoding → JSONL → Python encoding → training → ONNX export → inference all produce consistent results.

```bash
python evaluate.py --model ../data/bot.onnx --data ../data/greedy-10k.jsonl --games 1000
```

## Architecture

See [docs/rl-training-design.md](../../docs/rl-training-design.md) for the full design.

- **TypeScript** (packages/game-logic/src/training/): Feature encoders, game logger, data generation
- **Python** (packages/training/python/): Model definition, training scripts, ONNX export
- **Data format**: JSONL — one game per line with full state snapshots at each decision point
