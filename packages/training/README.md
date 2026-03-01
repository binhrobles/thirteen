# Training Pipeline

End-to-end pipeline for training Tiến Lên bots via imitation learning and RL.

## Quick Start

### 1. Generate training data

```bash
# From repo root — generates JSONL of greedy-vs-greedy games
yarn workspace @thirteen/game-logic generate-data --games=10000 --output=packages/training/data/greedy-10k.jsonl
```

### 2. Install Python dependencies

```bash
cd packages/training/python
pip install -r requirements.txt
```

### 3. Train imitation model

```bash
python train_imitation.py --data ../data/greedy-10k.jsonl --epochs 50 --output ../data/model.pt
```

### 4. Export to ONNX

```bash
python export_onnx.py --model ../data/model.pt --output ../data/bot.onnx
```

### 5. Evaluate

```bash
python evaluate.py --model ../data/bot.onnx --data ../data/greedy-10k.jsonl --games 1000
```

## Architecture

See [docs/rl-training-design.md](../../docs/rl-training-design.md) for the full design.

- **TypeScript** (packages/game-logic/src/training/): Feature encoders, game logger, data generation
- **Python** (packages/training/python/): Model definition, training scripts, ONNX export
- **Data format**: JSONL — one game per line with full state snapshots at each decision point
