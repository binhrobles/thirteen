export const COMBO = Object.freeze({
  SINGLE: 'Single',
  PAIR: 'Pair',
  TRIPLE: 'Triple',
  RUN: 'Run', // TODO: ideally, prompted after play if suited or not
  QUAD: 'Quad',
  BOMB: 'Bomb',
  INVALID: null,
});

export function isSingle(cards) {
  return cards.length === 1;
}

export function isPair(cards) {
  return cards.length === 2 && cards[0].rank === cards[1].rank;
}
export function isTriple(cards) {
  return (
    cards.length === 3 &&
    cards[0].rank === cards[1].rank &&
    cards[0].rank === cards[2].rank
  );
}

export function isQuad(cards) {
  return (
    cards.length === 4 &&
    cards[0].rank === cards[1].rank &&
    cards[0].rank === cards[2].rank &&
    cards[0].rank === cards[3].rank
  );
}

export class Play {
  constructor(combo, cards) {
    this.cards = cards;
    this.combo = combo;
  }

  matchesCombo(cards) {
    switch (this.combo) {
      case COMBO.SINGLE:
        return isSingle(cards);
      case COMBO.PAIR:
        return isPair(cards);
      case COMBO.TRIPLE:
        return isTriple(cards);
      case COMBO.QUAD:
        return isQuad(cards);
      default:
        throw new Error(COMBO.INVALID);
    }
  }

  isBeatenBy(cards) {
    switch (this.combo) {
      case COMBO.SINGLE:
      case COMBO.PAIR:
      case COMBO.TRIPLE:
      case COMBO.QUAD:
        return this.cards[0].rank < cards[0].rank;
      default:
        throw new Error(COMBO.INVALID);
    }
  }

  toString() {
    return `Combo: ${this.combo}\nCards: ${this.cards}\nSuited? ${this.suited}`;
  }

  static DetermineCombo(cards) {
    if (isSingle(cards)) return COMBO.SINGLE;
    if (isPair(cards)) return COMBO.PAIR;
    if (isTriple(cards)) return COMBO.TRIPLE;
    if (isQuad(cards)) return COMBO.QUAD;
    return COMBO.INVALID;
  }
}
