import type { InferenceSession } from "onnxruntime-common";
import { Tensor } from "onnxruntime-common";
import { Card } from "../card.js";
import type { Play } from "../play.js";
import type { CardData, GameStateSnapshot } from "../types.js";
import { encodeState } from "../training/state-encoder.js";
import { encodeAction, encodePassAction } from "../training/action-encoder.js";
import { evaluate, getAllPlays } from "./hand-evaluator.js";
import { STATE_SIZE, ACTION_SIZE } from "../training/constants.js";

/**
 * RL bot using an ONNX model for inference.
 *
 * ONNX model inputs (must match Python export):
 *   - "state":  Float32[N, 465]
 *   - "action": Float32[N, 63]
 * ONNX model output:
 *   - "score":  Float32[N] or Float32[N, 1]
 *
 * Each row is one (state, action) pair; the same state is repeated N times.
 * The highest-scoring candidate is chosen.
 */
export class RLBot {
  constructor(private session: InferenceSession) {}

  async choosePlay(
    hand: Card[],
    lastPlay: Play | null,
    snapshot: GameStateSnapshot,
    playerIndex: number,
  ): Promise<Card[]> {
    const stateFeats = encodeState(snapshot, playerIndex);

    const evaluation = evaluate(hand, lastPlay);
    const validPlays = getAllPlays(evaluation);
    const canPass = lastPlay !== null;

    // Build candidate list: valid plays + optional pass (empty = pass)
    const candidates: CardData[][] = validPlays.map((cards) =>
      cards.map((c) => ({ rank: c.rank, suit: c.suit, value: c.value })),
    );
    if (canPass) candidates.push([]);

    if (candidates.length === 0) return [];
    if (candidates.length === 1) return validPlays[0] ?? [];

    const N = candidates.length;

    // State batch: same state repeated N times → [N, STATE_SIZE]
    const stateBatch = new Float32Array(N * STATE_SIZE);
    for (let i = 0; i < N; i++) stateBatch.set(stateFeats, i * STATE_SIZE);

    // Action batch: one encoded action per candidate → [N, ACTION_SIZE]
    const actionBatch = new Float32Array(N * ACTION_SIZE);
    for (let i = 0; i < N; i++) {
      const feats =
        candidates[i].length > 0
          ? encodeAction(candidates[i])
          : encodePassAction();
      actionBatch.set(feats, i * ACTION_SIZE);
    }

    const results = await this.session.run({
      state: new Tensor("float32", stateBatch, [N, STATE_SIZE]),
      action: new Tensor("float32", actionBatch, [N, ACTION_SIZE]),
    });

    const scores = results["score"].data as Float32Array;

    let bestIdx = 0;
    for (let i = 1; i < N; i++) {
      if (scores[i] > scores[bestIdx]) bestIdx = i;
    }

    return candidates[bestIdx].map((cd) => Card.fromValue(cd.value));
  }
}
