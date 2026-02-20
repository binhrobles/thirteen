import { Card, Rank } from "./card.js";

export enum Combo {
  SINGLE,
  PAIR,
  TRIPLE,
  QUAD,
  RUN,
  BOMB,
  INVALID,
}

export class Play {
  readonly combo: Combo;
  readonly cards: Card[];
  readonly suited: boolean;
  /** Value of highest card — used for comparison */
  readonly value: number;

  constructor(combo: Combo, cards: Card[], suited = false) {
    this.combo = combo;
    console.log('[Play] Input cards:', cards.map(c => `${c}(${c.value})`).join(', '));
    // Sort ascending so cards[0] is lowest
    this.cards = [...cards].sort(Card.compare);
    console.log('[Play] After sort:', this.cards.map(c => `${c}(${c.value})`).join(', '));
    this.suited = suited;
    // Value is the highest card (for comparison)
    this.value = this.cards[this.cards.length - 1].value;
    console.log('[Play] Value set to:', this.value);
  }

  toString(): string {
    return `${Combo[this.combo]}: ${this.cards.join(" ")}`;
  }

  // ── Combo detection ──────────────────────────────────────────

  static isSingle(cards: Card[]): boolean {
    return cards.length === 1;
  }

  static isPair(cards: Card[]): boolean {
    return cards.length === 2 && cards[0].rank === cards[1].rank;
  }

  static isTriple(cards: Card[]): boolean {
    return (
      cards.length === 3 &&
      cards[0].rank === cards[1].rank &&
      cards[0].rank === cards[2].rank
    );
  }

  static isQuad(cards: Card[]): boolean {
    return (
      cards.length === 4 &&
      cards[0].rank === cards[1].rank &&
      cards[0].rank === cards[2].rank &&
      cards[0].rank === cards[3].rank
    );
  }

  static isRun(cards: Card[]): boolean {
    if (cards.length < 3) return false;
    // 2s cannot appear in runs
    for (const card of cards) {
      if (card.rank === Rank.TWO) return false;
    }
    const sorted = [...cards].sort(Card.compare);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].rank + 1 !== sorted[i + 1].rank) return false;
    }
    return true;
  }

  static isBomb(cards: Card[]): boolean {
    // A bomb is 3+ consecutive pairs (6+ cards)
    if (cards.length < 6 || cards.length % 2 !== 0) return false;
    const sorted = [...cards].sort(Card.compare);
    // Check pairs
    for (let i = 0; i < sorted.length; i += 2) {
      if (!Play.isPair([sorted[i], sorted[i + 1]])) return false;
    }
    // Check consecutive ranks (use every other card)
    const rankCards: Card[] = [];
    for (let i = 1; i < sorted.length; i += 2) {
      rankCards.push(sorted[i]);
    }
    return Play.isRun(rankCards);
  }

  static isSuited(cards: Card[]): boolean {
    if (cards.length === 0) return false;
    const firstSuit = cards[0].suit;
    return cards.every((c) => c.suit === firstSuit);
  }

  // ── Combo determination ──────────────────────────────────────

  static determineCombo(cards: Card[]): Combo {
    if (Play.isSingle(cards)) return Combo.SINGLE;
    if (Play.isPair(cards)) return Combo.PAIR;
    if (Play.isTriple(cards)) return Combo.TRIPLE;
    if (Play.isQuad(cards)) return Combo.QUAD;
    if (Play.isRun(cards)) return Combo.RUN;
    if (Play.isBomb(cards)) return Combo.BOMB;
    return Combo.INVALID;
  }

  static matchesCombo(play: Play, attemptCards: Card[]): boolean {
    switch (play.combo) {
      case Combo.SINGLE:
        return Play.isSingle(attemptCards);
      case Combo.PAIR:
        return Play.isPair(attemptCards);
      case Combo.TRIPLE:
        return Play.isTriple(attemptCards);
      case Combo.QUAD:
        return Play.isQuad(attemptCards);
      case Combo.RUN:
        return (
          attemptCards.length === play.cards.length && Play.isRun(attemptCards)
        );
      case Combo.BOMB:
        return (
          attemptCards.length === play.cards.length && Play.isBomb(attemptCards)
        );
      default:
        return false;
    }
  }
}
