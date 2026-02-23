import { Card } from "../card.js";
import type { GameState } from "../game-state.js";
import { Play } from "../play.js";
import type { SeatData } from "../tourney.js";
import type { CardData, GameStateSnapshot, MoveEntry } from "../types.js";
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
 * If opening (has power): plays the lowest card in the largest non-bomb combo.
 * Returns empty array to pass.
 */
export function choosePlay(hand: Card[], lastPlay: Play | null): Card[] {
  const evaluation = evaluate(hand, lastPlay);

  // If opening (has power), play the lowest card in the largest non-bomb combo
  if (lastPlay === null) {
    const nonBombPlays = [
      ...evaluation.singles,
      ...evaluation.pairs,
      ...evaluation.triples,
      ...evaluation.runs,
    ];

    // no non-bomb plays remain, so play the first bomb
    if (nonBombPlays.length === 0) {
      if (evaluation.quads.length > 0) {
        return evaluation.quads[0];
      }
      if (evaluation.bombs.length > 0) {
        return evaluation.bombs[0];
      }
      // Safety: if no plays at all (shouldn't happen), return first card as single
      console.error("[bot] No valid plays found when opening - playing first card");
      return hand.length > 0 ? [hand[0]] : [];
    }

    // Find the lowest card value across all plays
    const lowestValue = Math.min(
      ...nonBombPlays.flatMap((p) => p.map((c) => c.value)),
    );

    // Filter to plays containing that lowest card
    const playsWithLowest = nonBombPlays.filter((p) =>
      p.some((c) => c.value === lowestValue),
    );

    // Pick the largest combo (most cards); break ties by lowest max value
    playsWithLowest.sort(
      (a, b) => b.length - a.length || getPlayValue(a) - getPlayValue(b),
    );
    return playsWithLowest[0] ?? (hand.length > 0 ? [hand[0]] : []);
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

/**
 * Execute bot turns in a loop until it's a human's turn or game over.
 * Returns list of MoveEntry objects describing each bot action.
 */
export function executeBotTurns(
  seats: SeatData[],
  game: GameState,
): MoveEntry[] {
  const moves: MoveEntry[] = [];
  const SAFETY_CAP = 100;

  for (let i = 0; i < SAFETY_CAP; i++) {
    if (game.isGameOver()) break;

    const pos = game.currentPlayer;
    const seat = seats[pos];

    if (!seat.isBot) break; // Human's turn

    const hand = game.getHand(pos);
    const cardsToPlay = choosePlay(hand, game.lastPlay);

    if (cardsToPlay.length > 0) {
      game.playCards(pos, cardsToPlay);
      moves.push({
        player: pos,
        action: "play",
        cards: cardsToPlay.map(
          (c): CardData => ({ rank: c.rank, suit: c.suit, value: c.value }),
        ),
      });
    } else {
      game.passTurn(pos);
      moves.push({ player: pos, action: "pass" });
    }
  }

  return moves;
}
