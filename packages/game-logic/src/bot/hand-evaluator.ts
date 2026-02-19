import { Card, Rank } from "../card.js";
import { Combo, Play } from "../play.js";
import { validate } from "../move-validator.js";

export interface EvaluationResult {
  singles: Card[][];
  pairs: Card[][];
  triples: Card[][];
  quads: Card[][];
  runs: Card[][];
  bombs: Card[][];
}

export function getAllPlays(result: EvaluationResult): Card[][] {
  return [
    ...result.singles,
    ...result.pairs,
    ...result.triples,
    ...result.quads,
    ...result.runs,
    ...result.bombs,
  ];
}

export function hasAnyPlays(result: EvaluationResult): boolean {
  return getAllPlays(result).length > 0;
}

function groupByRank(hand: Card[]): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>();
  for (const card of hand) {
    const existing = groups.get(card.rank);
    if (existing) existing.push(card);
    else groups.set(card.rank, [card]);
  }
  return groups;
}

function findSingles(hand: Card[], lastPlay: Play | null): Card[][] {
  const valid: Card[][] = [];
  for (const card of hand) {
    const cards = [card];
    if (validate(lastPlay, cards).valid) valid.push(cards);
  }
  return valid;
}

function findPairs(
  byRank: Map<Rank, Card[]>,
  lastPlay: Play | null,
): Card[][] {
  const valid: Card[][] = [];
  for (const [, cardsOfRank] of byRank) {
    if (cardsOfRank.length < 2) continue;
    for (let i = 0; i < cardsOfRank.length; i++) {
      for (let j = i + 1; j < cardsOfRank.length; j++) {
        const cards = [cardsOfRank[i], cardsOfRank[j]];
        if (validate(lastPlay, cards).valid) valid.push(cards);
      }
    }
  }
  return valid;
}

function findTriples(
  byRank: Map<Rank, Card[]>,
  lastPlay: Play | null,
): Card[][] {
  const valid: Card[][] = [];
  for (const [, cardsOfRank] of byRank) {
    if (cardsOfRank.length < 3) continue;
    for (let i = 0; i < cardsOfRank.length; i++) {
      for (let j = i + 1; j < cardsOfRank.length; j++) {
        for (let k = j + 1; k < cardsOfRank.length; k++) {
          const cards = [cardsOfRank[i], cardsOfRank[j], cardsOfRank[k]];
          if (validate(lastPlay, cards).valid) valid.push(cards);
        }
      }
    }
  }
  return valid;
}

function findQuads(
  byRank: Map<Rank, Card[]>,
  lastPlay: Play | null,
): Card[][] {
  const valid: Card[][] = [];
  for (const [, cardsOfRank] of byRank) {
    if (cardsOfRank.length !== 4) continue;
    const cards = [...cardsOfRank];
    if (validate(lastPlay, cards).valid) valid.push(cards);
  }
  return valid;
}

function findRuns(hand: Card[], lastPlay: Play | null): Card[][] {
  const valid: Card[][] = [];

  // Filter out 2s
  const eligible = hand.filter((c) => c.rank !== Rank.TWO);
  if (eligible.length < 3) return valid;

  const sorted = [...eligible].sort(Card.compare);

  let minLength = 3;
  let maxLength = sorted.length;

  if (lastPlay && lastPlay.combo === Combo.RUN) {
    minLength = lastPlay.cards.length;
    maxLength = lastPlay.cards.length;
  }

  for (let length = minLength; length <= maxLength; length++) {
    for (let startIdx = 0; startIdx <= sorted.length - length; startIdx++) {
      const runCards: Card[] = [];

      for (let i = startIdx; i < sorted.length; i++) {
        const card = sorted[i];

        if (runCards.length === 0) {
          runCards.push(card);
        } else if (card.rank === runCards[runCards.length - 1].rank + 1) {
          runCards.push(card);
        } else if (card.rank === runCards[runCards.length - 1].rank) {
          continue; // Skip duplicates
        } else {
          break; // Gap in sequence
        }

        if (runCards.length === length) {
          if (validate(lastPlay, runCards).valid) valid.push([...runCards]);
          break;
        }
      }
    }
  }

  return valid;
}

function findBombs(hand: Card[], lastPlay: Play | null): Card[][] {
  const valid: Card[][] = [];
  const byRank = groupByRank(hand);

  // Filter to only ranks with pairs
  const pairRanks: Rank[] = [];
  for (const [rank, cards] of byRank) {
    if (cards.length >= 2) pairRanks.push(rank);
  }

  if (pairRanks.length < 3) return valid;
  pairRanks.sort((a, b) => a - b);

  let minPairs = 3;
  let maxPairs = pairRanks.length;

  if (lastPlay && lastPlay.combo === Combo.BOMB) {
    const requiredPairs = lastPlay.cards.length / 2;
    minPairs = requiredPairs;
    maxPairs = requiredPairs;
  }

  for (let numPairs = minPairs; numPairs <= maxPairs; numPairs++) {
    for (
      let startIdx = 0;
      startIdx <= pairRanks.length - numPairs;
      startIdx++
    ) {
      // Check consecutive ranks
      let consecutive = true;
      for (let i = 0; i < numPairs - 1; i++) {
        if (pairRanks[startIdx + i] + 1 !== pairRanks[startIdx + i + 1]) {
          consecutive = false;
          break;
        }
      }
      if (!consecutive) continue;

      // Build bomb
      const bombCards: Card[] = [];
      for (let i = 0; i < numPairs; i++) {
        const rank = pairRanks[startIdx + i];
        const cardsOfRank = byRank.get(rank)!;
        bombCards.push(cardsOfRank[0], cardsOfRank[1]);
      }

      if (
        bombCards.length === numPairs * 2 &&
        validate(lastPlay, bombCards).valid
      ) {
        valid.push(bombCards);
      }
    }
  }

  return valid;
}

/**
 * Enumerate all valid plays from a hand given the current last play.
 */
export function evaluate(
  hand: Card[],
  lastPlay: Play | null,
): EvaluationResult {
  const byRank = groupByRank(hand);
  return {
    singles: findSingles(hand, lastPlay),
    pairs: findPairs(byRank, lastPlay),
    triples: findTriples(byRank, lastPlay),
    quads: findQuads(byRank, lastPlay),
    runs: findRuns(hand, lastPlay),
    bombs: findBombs(hand, lastPlay),
  };
}
