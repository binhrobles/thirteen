#!/usr/bin/env bash
#
# PPO training run script for Tiến Lên bot models.
# Automates: git pull → train PPO → export ONNX → upload → evaluate
#
# Usage:
#   ./run.sh                          # Full pipeline with defaults
#   ./run.sh --skip-pull              # Skip git pull (already up to date)
#   ./run.sh --epochs 100             # Override training epochs
#
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────────────
S3_BUCKET="${S3_BUCKET:-thirteen-training}"
S3_MODELS_PREFIX="models"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON_DIR="$SCRIPT_DIR/python"
DATA_DIR="$SCRIPT_DIR/data"

EPOCHS=1000
BATCH_SIZE=2048
LR="3e-4"
SKIP_PULL=false

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pull)       SKIP_PULL=true; shift ;;
    --epochs)          EPOCHS="$2"; shift 2 ;;
    --batch-size)      BATCH_SIZE="$2"; shift 2 ;;
    --lr)              LR="$2"; shift 2 ;;
    --bucket)          S3_BUCKET="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,/^$/s/^# *//p' "$0"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

RUN_ID="$(date +%Y%m%d-%H%M%S)"

log() { echo "[$(date +%H:%M:%S)] $*"; }

# ── 1. Pull latest code ─────────────────────────────────────────────────────
if [[ "$SKIP_PULL" == false ]]; then
  log "Pulling latest code..."
  cd "$REPO_ROOT"
  git pull --ff-only
  cd "$SCRIPT_DIR"
else
  log "Skipping git pull"
fi

# ── 2. Train PPO via self-play ───────────────────────────────────────────────
mkdir -p "$DATA_DIR"

log "Starting PPO training: epochs=$EPOCHS batch_size=$BATCH_SIZE lr=$LR"

cd "$PYTHON_DIR"

uv run train_ppo.py \
  --epochs "$EPOCHS" \
  --batch-size "$BATCH_SIZE" \
  --lr "$LR" \
  --output-dir "$DATA_DIR"

log "Training complete"

# Find the run directory (most recently created timestamped dir)
RUN_DIR="$(ls -dt "$DATA_DIR"/[0-9]*-ppo-* 2>/dev/null | head -1)"
if [[ -z "$RUN_DIR" ]]; then
  echo "ERROR: Could not find run directory in $DATA_DIR" >&2
  exit 1
fi
log "Run directory: $RUN_DIR"

# Find the model file in the run directory
MODEL_FILE="$RUN_DIR/model.pt"
ONNX_FILE="$RUN_DIR/bot.onnx"

# ── 3. Export to ONNX ────────────────────────────────────────────────────────
log "Exporting to ONNX..."
uv run export_onnx.py --model "$MODEL_FILE" --output "$ONNX_FILE"

# ── 4. Upload ONNX model to S3 ──────────────────────────────────────────────
log "Uploading model to s3://$S3_BUCKET/$S3_MODELS_PREFIX/$RUN_ID/bot.onnx ..."
aws s3 cp "$ONNX_FILE" "s3://$S3_BUCKET/$S3_MODELS_PREFIX/$RUN_ID/bot.onnx"
aws s3 cp "$ONNX_FILE" "s3://$S3_BUCKET/$S3_MODELS_PREFIX/latest/bot.onnx"
log "Model uploaded"

# ── 5. Evaluate ──────────────────────────────────────────────────────────────
log "Running evaluation..."
uv run evaluate.py --model "$ONNX_FILE" --vs-greedy --games 1000

# ── 6. Play style analytics ─────────────────────────────────────────────────
log "Generating play style analytics..."
uv run play_style_analytics.py --run-dir "$RUN_DIR" --plot || true

# ── 7. Summary ───────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo "  Training Run Complete: $RUN_ID"
echo "════════════════════════════════════════════"
echo "  Model:  s3://$S3_BUCKET/$S3_MODELS_PREFIX/$RUN_ID/bot.onnx"
echo "  Latest: s3://$S3_BUCKET/$S3_MODELS_PREFIX/latest/bot.onnx"
echo "════════════════════════════════════════════"
