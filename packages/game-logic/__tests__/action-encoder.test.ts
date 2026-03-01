import { describe, it, expect } from "vitest";
import { Rank, Suit } from "../src/card.js";
import type { CardData } from "../src/types.js";
import { encodeAction, encodePassAction } from "../src/training/action-encoder.js";
import { ACTION_SIZE, DECK_SIZE } from "../src/training/constants.js";

const cd = (rank: number, suit: number): CardData => ({
  rank,
  suit,
  value: rank * 4 + suit,
});

describe("encodeAction", () => {
  it("returns Float32Array of ACTION_SIZE length", () => {
    const result = encodeAction([cd(Rank.THREE, Suit.SPADES)]);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(ACTION_SIZE);
  });

  it("encodes a single card", () => {
    // Rank.SEVEN = 4 (enum starts at THREE=0), Suit.HEARTS = 3
    const card = cd(Rank.SEVEN, Suit.HEARTS); // value = 4*4+3 = 19
    const result = encodeAction([card]);

    // Card bit
    expect(result[19]).toBe(1);
    // SINGLE = combo index 0
    expect(result[DECK_SIZE + 0]).toBe(1);
    // Combo size
    expect(result[DECK_SIZE + 7]).toBeCloseTo(1 / 13);
    // Highest value
    expect(result[DECK_SIZE + 8]).toBeCloseTo(19 / 51);
    // Suited (single is trivially suited)
    expect(result[DECK_SIZE + 9]).toBe(1);
    // Not pass
    expect(result[ACTION_SIZE - 1]).toBe(0);
  });

  it("encodes a pair", () => {
    const cards = [cd(Rank.KING, Suit.SPADES), cd(Rank.KING, Suit.CLUBS)];
    const result = encodeAction(cards);

    // Card bits
    expect(result[Rank.KING * 4 + Suit.SPADES]).toBe(1);
    expect(result[Rank.KING * 4 + Suit.CLUBS]).toBe(1);
    // PAIR = combo index 1
    expect(result[DECK_SIZE + 1]).toBe(1);
    expect(result[DECK_SIZE + 0]).toBe(0); // SINGLE not set
    // Combo size
    expect(result[DECK_SIZE + 7]).toBeCloseTo(2 / 13);
    // Highest value = K♣ = 10*4+1 = 41
    expect(result[DECK_SIZE + 8]).toBeCloseTo(41 / 51);
    // Not suited (different suits)
    expect(result[DECK_SIZE + 9]).toBe(0);
  });

  it("encodes a suited run", () => {
    const cards = [
      cd(Rank.THREE, Suit.HEARTS),
      cd(Rank.FOUR, Suit.HEARTS),
      cd(Rank.FIVE, Suit.HEARTS),
    ];
    const result = encodeAction(cards);

    // RUN = combo index 4
    expect(result[DECK_SIZE + 4]).toBe(1);
    // Combo size
    expect(result[DECK_SIZE + 7]).toBeCloseTo(3 / 13);
    // Highest = 5♥ = 2*4+3 = 11
    expect(result[DECK_SIZE + 8]).toBeCloseTo(11 / 51);
    // Suited
    expect(result[DECK_SIZE + 9]).toBe(1);
  });

  it("encodes highest card correctly for 2♥", () => {
    const result = encodeAction([cd(Rank.TWO, Suit.HEARTS)]); // value 51
    expect(result[DECK_SIZE + 8]).toBeCloseTo(1.0); // 51/51
  });

  it("encodes lowest card correctly for 3♠", () => {
    const result = encodeAction([cd(Rank.THREE, Suit.SPADES)]); // value 0
    expect(result[DECK_SIZE + 8]).toBeCloseTo(0.0); // 0/51
  });
});

describe("encodePassAction", () => {
  it("returns Float32Array of ACTION_SIZE length", () => {
    const result = encodePassAction();
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(ACTION_SIZE);
  });

  it("has only is_pass flag set", () => {
    const result = encodePassAction();
    expect(result[ACTION_SIZE - 1]).toBe(1);
    for (let i = 0; i < ACTION_SIZE - 1; i++) {
      expect(result[i]).toBe(0);
    }
  });
});
