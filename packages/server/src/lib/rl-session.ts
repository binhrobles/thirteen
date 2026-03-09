import { writeFile, access } from "fs/promises";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { InferenceSession } from "onnxruntime-common";

const CACHE_PATH = "/tmp/model.onnx";
const MODEL_BUCKET = "thirteen-training";
const MODEL_KEY = "models/model.onnx";
const s3 = new S3Client({});
let cachedSession: InferenceSession | null = null;

/**
 * Load the ONNX model session, downloading from S3 on first call and caching
 * in /tmp + in-memory for subsequent invocations on the same Lambda instance.
 *
 * Model location: s3://thirteen-training/models/model.onnx
 */
export async function getRLSession(): Promise<InferenceSession> {
  if (cachedSession) return cachedSession;

  // Check /tmp cache (survives warm Lambda restarts)
  try {
    await access(CACHE_PATH);
  } catch {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: MODEL_BUCKET, Key: MODEL_KEY }),
    );
    const bytes = await res.Body!.transformToByteArray();
    await writeFile(CACHE_PATH, bytes);
  }

  // Dynamic import so onnxruntime-node (native binaries) stays external to esbuild
  const ort = await import("onnxruntime-node");
  cachedSession = await ort.InferenceSession.create(CACHE_PATH);
  return cachedSession;
}
