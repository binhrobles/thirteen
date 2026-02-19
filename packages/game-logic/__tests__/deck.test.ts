import { describe, it, expect } from "vitest";
import { Card, Rank, Suit } from "../src/card.js";
import { generate, deal, findStartingPlayer, shuffle } from "../src/deck.js";

describe("Deck", () => {
  describe("generate", () => {
    it("creates 52 cards", () => {
      expect(generate().length).toBe(52);
    });

    it("all cards have unique values", () => {
      const values = generate().map((c) => c.value);
      expect(new Set(values).size).toBe(52);
    });

    it("includes 3♠ (value 0) and 2♥ (value 51)", () => {
      const cards = generate();
      expect(cards.some((c) => c.value === 0)).toBe(true);
      expect(cards.some((c) => c.value === 51)).toBe(true);
    });
  });

  describe("shuffle", () => {
    it("returns same length array", () => {
      const cards = generate();
      const shuffled = shuffle([...cards]);
      expect(shuffled.length).toBe(52);
    });

    it("preserves all cards", () => {
      const cards = generate();
      const shuffled = shuffle([...cards]);
      const values = shuffled.map((c) => c.value).sort((a, b) => a - b);
      const origValues = cards.map((c) => c.value).sort((a, b) => a - b);
      expect(values).toEqual(origValues);
    });
  });

  describe("deal", () => {
    it("returns 4 hands of 13 cards each", () => {
      const hands = deal();
      expect(hands.length).toBe(4);
      for (const hand of hands) {
        expect(hand.length).toBe(13);
      }
    });

    it("hands are sorted ascending", () => {
      const hands = deal();
      for (const hand of hands) {
        for (let i = 0; i < hand.length - 1; i++) {
          expect(hand[i].value).toBeLessThan(hand[i + 1].value);
        }
      }
    });

    it("all 52 cards distributed across hands", () => {
      const hands = deal();
      const allValues = hands.flat().map((c) => c.value);
      expect(new Set(allValues).size).toBe(52);
    });
  });

  describe("findStartingPlayer", () => {
    it("finds player with 3♠", () => {
      const hands: Card[][] = [
        [new Card(Rank.FIVE, Suit.SPADES)],
        [new Card(Rank.THREE, Suit.SPADES)],
        [new Card(Rank.SEVEN, Suit.HEARTS)],
        [new Card(Rank.ACE, Suit.CLUBS)],
      ];
      expect(findStartingPlayer(hands)).toBe(1);
    });

    it("fallback: finds player with lowest card value", () => {
      // No 3♠ in any hand
      const hands: Card[][] = [
        [new Card(Rank.FIVE, Suit.SPADES)],
        [new Card(Rank.SEVEN, Suit.HEARTS)],
        [new Card(Rank.THREE, Suit.CLUBS)], // lowest: 3♣ = value 1
        [new Card(Rank.ACE, Suit.CLUBS)],
      ];
      expect(findStartingPlayer(hands)).toBe(2);
    });
  });
});
