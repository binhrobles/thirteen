"""
Export trained PyTorch model to ONNX format.

Usage:
    python export_onnx.py --model model.pt --output bot.onnx
"""

import argparse
import os

import torch
import onnx
import onnxruntime as ort
import numpy as np

from features import STATE_SIZE, ACTION_SIZE
from model import TienLenNet


def export(model_path: str, output_path: str, max_actions: int = 80):
    # Load model
    model = TienLenNet()
    model.load_state_dict(torch.load(model_path, weights_only=True))
    model.eval()

    # Dummy inputs matching inference shapes
    dummy_state = torch.randn(1, STATE_SIZE)
    dummy_actions = torch.randn(1, max_actions, ACTION_SIZE)

    # Export
    torch.onnx.export(
        model,
        (dummy_state, dummy_actions),
        output_path,
        input_names=["state", "action_features"],
        output_names=["scores"],
        dynamic_axes={
            "state": {0: "batch"},
            "action_features": {0: "batch", 1: "num_actions"},
            "scores": {0: "batch", 1: "num_actions"},
        },
        opset_version=17,
    )
    print(f"Exported ONNX model to {output_path}")

    # Validate
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    print("ONNX model validation passed")

    # Re-save with weights inline — avoids .data sidecar file which onnxruntime-web can't load
    onnx.save(onnx_model, output_path, save_as_external_data=False)
    print("Saved with inline weights (no external data file)")

    # Test inference
    session = ort.InferenceSession(output_path)
    state_np = dummy_state.numpy()
    actions_np = dummy_actions.numpy()

    result = session.run(None, {"state": state_np, "action_features": actions_np})
    scores = result[0]

    print(f"Test inference: state {state_np.shape}, actions {actions_np.shape} → scores {scores.shape}")

    # Compare with PyTorch output
    with torch.no_grad():
        torch_scores = model(dummy_state, dummy_actions).numpy()

    max_diff = np.abs(scores - torch_scores).max()
    print(f"Max difference vs PyTorch: {max_diff:.6f}")
    if max_diff < 1e-4:
        print("Outputs match within tolerance")
    else:
        print("WARNING: Outputs differ significantly!")

    # Print model size
    import os

    size_kb = os.path.getsize(output_path) / 1024
    print(f"Model size: {size_kb:.0f} KB")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export model to ONNX")
    parser.add_argument("--model", required=True, help="Path to .pt model file")
    parser.add_argument("--output-dir", default=None, help="Output directory (default: same directory as model)")
    parser.add_argument("--max-actions", type=int, default=80)
    args = parser.parse_args()

    model_basename = os.path.splitext(os.path.basename(args.model))[0] + ".onnx"
    output_dir = args.output_dir or os.path.dirname(args.model) or "."
    output_path = os.path.join(output_dir, model_basename)
    export(args.model, output_path, args.max_actions)
