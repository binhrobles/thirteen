import type { CardData } from "../types.js";
import { Card } from "../card.js";
import { Play } from "../play.js";
import { DECK_SIZE, NUM_ACTION_COMBO_TYPES, ACTION_SIZE } from "./constants.js";

/**
 * Encode a play action (cards to play) as a fixed-size feature vector.
 */
export function encodeAction(cards: CardData[]): Float32Array {
  const out = new Float32Array(ACTION_SIZE);
  let offset = 0;

  // Cards in play (52) — binary
  let maxValue = 0;
  for (const card of cards) {
    out[offset + card.value] = 1;
    if (card.value > maxValue) maxValue = card.value;
  }
  offset += DECK_SIZE;

  // Combo type (7) — one-hot
  const cardObjects = cards.map((c) => Card.fromValue(c.value));
  const combo = Play.determineCombo(cardObjects);
  out[offset + combo] = 1;
  offset += NUM_ACTION_COMBO_TYPES;

  // Combo size (1) — normalized
  out[offset++] = cards.length / 13;

  // Highest card value (1) — normalized
  out[offset++] = maxValue / 51;

  // Is suited (1)
  out[offset++] = Play.isSuited(cardObjects) ? 1 : 0;

  // Is pass (1)
  out[offset++] = 0;

  return out;
}

/**
 * Encode the pass action. All zeros except the is_pass flag.
 */
export function encodePassAction(): Float32Array {
  const out = new Float32Array(ACTION_SIZE);
  out[ACTION_SIZE - 1] = 1;
  return out;
}
