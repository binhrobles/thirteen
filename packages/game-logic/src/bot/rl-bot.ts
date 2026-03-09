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
 * ONNX model inputs (must match Python export_onnx.py):
 *   - "state":          Float32[1, 465]   — game state
 *   - "action_features": Float32[1, N, 63] — all N candidate actions
 * ONNX model output:
 *   - "scores": Float32[1, N] — score per candidate action
 *
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

    // state: [1, STATE_SIZE]
    const stateTensor = new Tensor("float32", stateFeats, [1, STATE_SIZE]);

    // action_features: [1, N, ACTION_SIZE]
    const actionBatch = new Float32Array(N * ACTION_SIZE);
    for (let i = 0; i < N; i++) {
      const feats =
        candidates[i].length > 0
          ? encodeAction(candidates[i])
          : encodePassAction();
      actionBatch.set(feats, i * ACTION_SIZE);
    }
    const actionTensor = new Tensor("float32", actionBatch, [1, N, ACTION_SIZE]);

    const results = await this.session.run({
      state: stateTensor,
      action_features: actionTensor,
    });

    // scores: [1, N]
    const scores = results["scores"].data as Float32Array;

    let bestIdx = 0;
    for (let i = 1; i < N; i++) {
      if (scores[i] > scores[bestIdx]) bestIdx = i;
    }

    return candidates[bestIdx].map((cd) => Card.fromValue(cd.value));
  }
}
