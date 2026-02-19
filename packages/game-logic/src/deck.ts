import { Card, Rank, Suit } from "./card.js";

/** Generate a full 52-card deck */
export function generate(): Card[] {
  const cards: Card[] = [];
  for (const rank of Object.values(Rank).filter(
    (v) => typeof v === "number",
  ) as Rank[]) {
    for (const suit of Object.values(Suit).filter(
      (v) => typeof v === "number",
    ) as Suit[]) {
      cards.push(new Card(rank, suit));
    }
  }
  return cards;
}

/** Fisher-Yates shuffle (in-place, returns same array) */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Deal cards to 4 players, returning sorted hands */
export function deal(numPlayers = 4): Card[][] {
  const cards = shuffle(generate());
  const cardsPerPlayer = Math.floor(cards.length / numPlayers);
  const hands: Card[][] = [];

  for (let i = 0; i < numPlayers; i++) {
    const hand = cards
      .slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer)
      .sort(Card.compare);
    hands.push(hand);
  }

  return hands;
}

/** Find the player with 3♠ (value 0). Fallback: player with lowest card. */
export function findStartingPlayer(hands: Card[][]): number {
  for (let i = 0; i < hands.length; i++) {
    for (const card of hands[i]) {
      if (card.rank === Rank.THREE && card.suit === Suit.SPADES) {
        return i;
      }
    }
  }
  // Fallback: lowest card
  let lowestValue = Infinity;
  let lowestPlayer = 0;
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].length > 0 && hands[i][0].value < lowestValue) {
      lowestValue = hands[i][0].value;
      lowestPlayer = i;
    }
  }
  return lowestPlayer;
}
