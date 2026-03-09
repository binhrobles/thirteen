import type { InferenceSession } from "onnxruntime-common";

let cachedSession: InferenceSession | null = null;

/**
 * Load the ONNX bot model via onnxruntime-web (WASM).
 * Model must be served at /models/bot.onnx (place file in public/models/).
 * Returns null if the model is unavailable (e.g. during development).
 */
export async function getRLSession(): Promise<InferenceSession | null> {
  if (cachedSession) return cachedSession;

  try {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort-wasm/`;
    cachedSession = await ort.InferenceSession.create(`${import.meta.env.BASE_URL}models/bot.onnx`);
    return cachedSession;
  } catch (err) {
    console.info("[rl-session] ONNX model not available, bots will use greedy:", err);
    return null;
  }
}
