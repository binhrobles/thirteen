import type { CardData, GameStateSnapshot } from "../types.js";
import {
  DECK_SIZE,
  NUM_PLAYERS,
  NUM_OPPONENTS,
  NUM_COMBO_TYPES,
  NUM_ACTION_COMBO_TYPES,
  STATE_SIZE,
} from "./constants.js";

const COMBO_INDEX: Record<string, number> = {
  SINGLE: 0,
  PAIR: 1,
  TRIPLE: 2,
  QUAD: 3,
  RUN: 4,
  BOMB: 5,
  INVALID: 6,
};
const POWER_INDEX = 7;

function setCardBits(
  cards: CardData[],
  out: Float32Array,
  offset: number,
): void {
  for (const card of cards) {
    out[offset + card.value] = 1;
  }
}

/**
 * Encode the full game state from the perspective of `playerIndex`.
 *
 * All features use relative player indexing:
 *   Slot 0 = self (acting player)
 *   Slot 1 = next clockwise (left)
 *   Slot 2 = across
 *   Slot 3 = previous (right)
 *
 * Opponent-only arrays (passed, inGame, winOrder) use 3 slots for opponents 1-3.
 */
export function encodeState(
  snapshot: GameStateSnapshot,
  playerIndex: number,
): Float32Array {
  const out = new Float32Array(STATE_SIZE);
  let offset = 0;

  // Hand combo type map (52 × 7 = 364) — per-card combo type breakdown
  // Replaces both "own hand" and "card combo participation" with richer info.
  // For each card: [single_count, pair_count, triple_count, quad_count, run_count, bomb_count, 0]
  // A nonzero row means the card is in hand. Slot 6 (INVALID) is unused but keeps alignment.
  const comboTypeMap = snapshot.handComboTypeMap;
  if (comboTypeMap) {
    for (let i = 0; i < DECK_SIZE * NUM_ACTION_COMBO_TYPES; i++) {
      out[offset + i] = comboTypeMap[i];
    }
  }
  offset += DECK_SIZE * NUM_ACTION_COMBO_TYPES;

  // Cards played total (52) — union of all players
  const played = snapshot.cardsPlayedByPlayer;
  if (played) {
    for (let p = 0; p < NUM_PLAYERS; p++) {
      setCardBits(played[p], out, offset);
    }
  }
  offset += DECK_SIZE;

  // Cards played by each opponent (52 × 3 = 156)
  for (let rel = 1; rel <= NUM_OPPONENTS; rel++) {
    const abs = (playerIndex + rel) % NUM_PLAYERS;
    if (played) {
      setCardBits(played[abs], out, offset);
    }
    offset += DECK_SIZE;
  }

  // Opponent hand sizes (3) — normalized by 13
  for (let rel = 1; rel <= NUM_OPPONENTS; rel++) {
    const abs = (playerIndex + rel) % NUM_PLAYERS;
    out[offset++] = snapshot.hands[abs].length / 13;
  }

  // Last play cards (52)
  if (snapshot.lastPlay) {
    setCardBits(snapshot.lastPlay.cards, out, offset);
  }
  offset += DECK_SIZE;

  // Last play combo type (8) — one-hot
  const comboIdx = snapshot.lastPlay
    ? (COMBO_INDEX[snapshot.lastPlay.combo] ?? 6)
    : POWER_INDEX;
  out[offset + comboIdx] = 1;
  offset += NUM_COMBO_TYPES;

  // Last play suited (1)
  out[offset++] = snapshot.lastPlay?.suited ? 1 : 0;

  // Last played by — relative (4) — one-hot
  if (snapshot.lastPlay) {
    const rel =
      (snapshot.lastPlayBy - playerIndex + NUM_PLAYERS) % NUM_PLAYERS;
    out[offset + rel] = 1;
  }
  offset += NUM_PLAYERS;

  // Players passed this round (3) — opponents only
  for (let rel = 1; rel <= NUM_OPPONENTS; rel++) {
    const abs = (playerIndex + rel) % NUM_PLAYERS;
    out[offset++] = snapshot.passedPlayers[abs] ? 1 : 0;
  }

  // Players still in game (3) — opponents only
  for (let rel = 1; rel <= NUM_OPPONENTS; rel++) {
    const abs = (playerIndex + rel) % NUM_PLAYERS;
    out[offset++] = snapshot.playersInGame[abs] ? 1 : 0;
  }

  // Win order filled (3) — positions 1st, 2nd, 3rd
  for (let pos = 0; pos < 3; pos++) {
    out[offset++] = pos < snapshot.winOrder.length ? 1 : 0;
  }

  // Unseen cards (52) — cards not in our hand and not yet played by anyone
  // Tells the model what opponents could be holding
  const myHand = new Set(snapshot.hands[playerIndex].map((c) => c.value));
  for (let cardVal = 0; cardVal < DECK_SIZE; cardVal++) {
    // Card is unseen if: not in our hand AND not in the played-total region
    // (played-total was encoded at offset 52..103, reuse that logic)
    const inHand = myHand.has(cardVal);
    let wasPlayed = false;
    if (played) {
      for (let p = 0; p < NUM_PLAYERS; p++) {
        for (const card of played[p]) {
          if (card.value === cardVal) {
            wasPlayed = true;
            break;
          }
        }
        if (wasPlayed) break;
      }
    }
    out[offset + cardVal] = !inHand && !wasPlayed ? 1 : 0;
  }
  offset += DECK_SIZE;

  // Relative hand advantage (3) — (myHandSize - opponentHandSize) / 13
  // Positive = I have more cards (bad), negative = I have fewer (good)
  const mySize = snapshot.hands[playerIndex].length;
  for (let rel = 1; rel <= NUM_OPPONENTS; rel++) {
    const abs = (playerIndex + rel) % NUM_PLAYERS;
    out[offset++] = (mySize - snapshot.hands[abs].length) / 13;
  }

  // Combo history (3 × 7 = 21) — per-opponent combo type counts, normalized
  const combos = snapshot.combosPlayedByPlayer;
  for (let rel = 1; rel <= NUM_OPPONENTS; rel++) {
    const abs = (playerIndex + rel) % NUM_PLAYERS;
    if (combos) {
      const playerCombos = combos[abs];
      for (const [comboName, idx] of Object.entries(COMBO_INDEX)) {
        out[offset + idx] = (playerCombos[comboName] ?? 0) / 5;
      }
    }
    offset += NUM_ACTION_COMBO_TYPES;
  }

  return out;
}
