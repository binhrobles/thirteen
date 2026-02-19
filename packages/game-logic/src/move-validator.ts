import { Card, Rank } from "./card.js";
import { Combo, Play } from "./play.js";

export interface MoveResult {
  valid: boolean;
  play: Play | null;
  error: string;
}

function ok(play: Play): MoveResult {
  return { valid: true, play, error: "" };
}

function fail(error: string): MoveResult {
  return { valid: false, play: null, error };
}

function tryOpeningMove(cards: Card[]): MoveResult {
  const combo = Play.determineCombo(cards);
  if (combo === Combo.INVALID) return fail("That's not a valid hand");
  const suited = Play.isRun(cards) && Play.isSuited(cards);
  return ok(new Play(combo, cards, suited));
}

function tryChop(lastPlay: Play, cards: Card[]): MoveResult {
  const combo = Play.determineCombo(cards);
  const numTwos = lastPlay.cards.length;

  // Quad chops a single 2
  if (numTwos === 1 && combo === Combo.QUAD) {
    return ok(new Play(combo, cards));
  }

  // Bomb chops 2s: need (numTwos + 2) pairs = (numTwos + 2) * 2 cards
  if (combo === Combo.BOMB && cards.length === (numTwos + 2) * 2) {
    return ok(new Play(combo, cards));
  }

  return fail("You need to play a valid chop");
}

function tryStandardMove(lastPlay: Play, cards: Card[]): MoveResult {
  if (!Play.matchesCombo(lastPlay, cards)) {
    // Special case: chopping 2s
    if (lastPlay.cards[0].rank === Rank.TWO) {
      return tryChop(lastPlay, cards);
    }
    return fail(`You need to play a ${Combo[lastPlay.combo]}`);
  }

  // Suited run enforcement
  if (
    lastPlay.combo === Combo.RUN &&
    lastPlay.suited &&
    !Play.isSuited(cards)
  ) {
    return fail("You need to play a suited run");
  }

  const suited =
    lastPlay.combo === Combo.RUN ? lastPlay.suited : false;
  const attempt = new Play(lastPlay.combo, cards, suited);

  if (lastPlay.value >= attempt.value) {
    return fail("That doesn't beat the last play");
  }

  return ok(attempt);
}

/**
 * Main entry point: validates a move against the current game state.
 * lastPlay is null when the player has power (opening move).
 */
export function validate(
  lastPlay: Play | null,
  cards: Card[],
): MoveResult {
  if (lastPlay === null) return tryOpeningMove(cards);
  return tryStandardMove(lastPlay, cards);
}
