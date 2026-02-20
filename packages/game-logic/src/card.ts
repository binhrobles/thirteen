/** Card ranking: THREE=0 (lowest) through TWO=12 (highest) */
export enum Rank {
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
  NINE,
  TEN,
  JACK,
  QUEEN,
  KING,
  ACE,
  TWO,
}

/** Suit ranking: SPADES=0 (lowest) through HEARTS=3 (highest) */
export enum Suit {
  SPADES,
  CLUBS,
  DIAMONDS,
  HEARTS,
}

const RANK_LABELS = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
];
const SUIT_SYMBOLS = ["♠", "♣", "♦", "♥"];

export class Card {
  readonly rank: Rank;
  readonly suit: Suit;
  /** rank * 4 + suit — unique per card, natural sort order */
  readonly value: number;

  constructor(rank: Rank, suit: Suit) {
    this.rank = rank;
    this.suit = suit;
    this.value = rank * 4 + suit;
  }

  toString(): string {
    return RANK_LABELS[this.rank] + SUIT_SYMBOLS[this.suit];
  }

  /** For use with Array.sort — ascending by value */
  static compare(a: Card, b: Card): number {
    return a.value - b.value;
  }

  static fromValue(value: number): Card {
    const rank = Math.floor(value / 4) as Rank;
    const suit = (value % 4) as Suit;
    return new Card(rank, suit);
  }
}
