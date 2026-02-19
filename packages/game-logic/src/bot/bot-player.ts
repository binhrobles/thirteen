import { Card } from "../card.js";
import { Play } from "../play.js";
import type { GameStateSnapshot } from "../types.js";
import { evaluate, getAllPlays } from "./hand-evaluator.js";

/** Strategy interface for future ONNX integration */
export interface BotStrategy {
  choosePlay(
    hand: Card[],
    lastPlay: Play | null,
    state?: GameStateSnapshot,
  ): Card[];
}

function getPlayValue(cards: Card[]): number {
  let max = 0;
  for (const card of cards) {
    if (card.value > max) max = card.value;
  }
  return max;
}

/**
 * Greedy bot: plays the lowest-value valid combo.
 * If opening (has power): plays the lowest single.
 * Returns empty array to pass.
 */
export function choosePlay(hand: Card[], lastPlay: Play | null): Card[] {
  const evaluation = evaluate(hand, lastPlay);

  // If opening (has power), play the lowest single
  if (lastPlay === null && evaluation.singles.length > 0) {
    return evaluation.singles[0];
  }

  const allPlays = getAllPlays(evaluation);
  if (allPlays.length === 0) return []; // Pass

  // Sort by value (lowest first)
  allPlays.sort((a, b) => getPlayValue(a) - getPlayValue(b));
  return allPlays[0];
}

/** GreedyBot implementing BotStrategy interface */
export const greedyBot: BotStrategy = {
  choosePlay(hand, lastPlay) {
    return choosePlay(hand, lastPlay);
  },
};
