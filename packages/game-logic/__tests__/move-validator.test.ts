import { describe, it, expect } from "vitest";
import { Card, Rank, Suit } from "../src/card.js";
import { Play, Combo } from "../src/play.js";
import { validate } from "../src/move-validator.js";

const c = (rank: Rank, suit: Suit) => new Card(rank, suit);

describe("MoveValidator", () => {
  describe("opening moves (no last play)", () => {
    it("accepts any valid combo", () => {
      const result = validate(null, [c(Rank.THREE, Suit.SPADES)]);
      expect(result.valid).toBe(true);
      expect(result.play!.combo).toBe(Combo.SINGLE);
    });

    it("accepts a pair opening", () => {
      const result = validate(null, [
        c(Rank.FIVE, Suit.SPADES),
        c(Rank.FIVE, Suit.HEARTS),
      ]);
      expect(result.valid).toBe(true);
      expect(result.play!.combo).toBe(Combo.PAIR);
    });

    it("accepts a run opening", () => {
      const result = validate(null, [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.HEARTS),
      ]);
      expect(result.valid).toBe(true);
      expect(result.play!.combo).toBe(Combo.RUN);
    });

    it("rejects invalid combo", () => {
      const result = validate(null, [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.SEVEN, Suit.HEARTS),
      ]);
      expect(result.valid).toBe(false);
    });

    it("marks suited runs", () => {
      const result = validate(null, [
        c(Rank.THREE, Suit.HEARTS),
        c(Rank.FOUR, Suit.HEARTS),
        c(Rank.FIVE, Suit.HEARTS),
      ]);
      expect(result.valid).toBe(true);
      expect(result.play!.suited).toBe(true);
    });
  });

  describe("standard moves", () => {
    it("single beats lower single", () => {
      const lastPlay = new Play(Combo.SINGLE, [c(Rank.FIVE, Suit.SPADES)]);
      const result = validate(lastPlay, [c(Rank.SEVEN, Suit.SPADES)]);
      expect(result.valid).toBe(true);
    });

    it("single cannot beat higher single", () => {
      const lastPlay = new Play(Combo.SINGLE, [c(Rank.SEVEN, Suit.HEARTS)]);
      const result = validate(lastPlay, [c(Rank.FIVE, Suit.SPADES)]);
      expect(result.valid).toBe(false);
    });

    it("same rank higher suit beats", () => {
      const lastPlay = new Play(Combo.SINGLE, [c(Rank.FIVE, Suit.SPADES)]);
      const result = validate(lastPlay, [c(Rank.FIVE, Suit.HEARTS)]);
      expect(result.valid).toBe(true);
    });

    it("must match combo type", () => {
      const lastPlay = new Play(Combo.SINGLE, [c(Rank.FIVE, Suit.SPADES)]);
      const result = validate(lastPlay, [
        c(Rank.SEVEN, Suit.SPADES),
        c(Rank.SEVEN, Suit.HEARTS),
      ]);
      expect(result.valid).toBe(false);
    });

    it("pair beats lower pair", () => {
      const lastPlay = new Play(Combo.PAIR, [
        c(Rank.FIVE, Suit.SPADES),
        c(Rank.FIVE, Suit.CLUBS),
      ]);
      const result = validate(lastPlay, [
        c(Rank.SEVEN, Suit.SPADES),
        c(Rank.SEVEN, Suit.HEARTS),
      ]);
      expect(result.valid).toBe(true);
    });

    it("run must match length", () => {
      const lastPlay = new Play(Combo.RUN, [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.HEARTS),
      ]);
      // 4-card run can't beat 3-card run
      const result = validate(lastPlay, [
        c(Rank.SIX, Suit.SPADES),
        c(Rank.SEVEN, Suit.CLUBS),
        c(Rank.EIGHT, Suit.HEARTS),
        c(Rank.NINE, Suit.DIAMONDS),
      ]);
      expect(result.valid).toBe(false);
    });

    it("higher run beats lower run of same length", () => {
      const lastPlay = new Play(Combo.RUN, [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.HEARTS),
      ]);
      const result = validate(lastPlay, [
        c(Rank.SIX, Suit.SPADES),
        c(Rank.SEVEN, Suit.CLUBS),
        c(Rank.EIGHT, Suit.HEARTS),
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe("suited run enforcement", () => {
    it("suited run must be beaten by suited run", () => {
      const lastPlay = new Play(
        Combo.RUN,
        [
          c(Rank.THREE, Suit.HEARTS),
          c(Rank.FOUR, Suit.HEARTS),
          c(Rank.FIVE, Suit.HEARTS),
        ],
        true,
      );
      // Non-suited run can't beat suited run
      const result = validate(lastPlay, [
        c(Rank.SIX, Suit.SPADES),
        c(Rank.SEVEN, Suit.CLUBS),
        c(Rank.EIGHT, Suit.HEARTS),
      ]);
      expect(result.valid).toBe(false);
    });

    it("suited run beats lower suited run", () => {
      const lastPlay = new Play(
        Combo.RUN,
        [
          c(Rank.THREE, Suit.HEARTS),
          c(Rank.FOUR, Suit.HEARTS),
          c(Rank.FIVE, Suit.HEARTS),
        ],
        true,
      );
      const result = validate(lastPlay, [
        c(Rank.SIX, Suit.DIAMONDS),
        c(Rank.SEVEN, Suit.DIAMONDS),
        c(Rank.EIGHT, Suit.DIAMONDS),
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe("chop rules", () => {
    it("quad chops a single 2", () => {
      const lastPlay = new Play(Combo.SINGLE, [c(Rank.TWO, Suit.HEARTS)]);
      const result = validate(lastPlay, [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.THREE, Suit.CLUBS),
        c(Rank.THREE, Suit.DIAMONDS),
        c(Rank.THREE, Suit.HEARTS),
      ]);
      expect(result.valid).toBe(true);
      expect(result.play!.combo).toBe(Combo.QUAD);
    });

    it("3-pair bomb chops single 2", () => {
      const lastPlay = new Play(Combo.SINGLE, [c(Rank.TWO, Suit.HEARTS)]);
      const bomb = [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.THREE, Suit.CLUBS),
        c(Rank.FOUR, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.SPADES),
        c(Rank.FIVE, Suit.CLUBS),
      ];
      const result = validate(lastPlay, bomb);
      expect(result.valid).toBe(true);
      expect(result.play!.combo).toBe(Combo.BOMB);
    });

    it("4-pair bomb chops pair of 2s", () => {
      const lastPlay = new Play(Combo.PAIR, [
        c(Rank.TWO, Suit.SPADES),
        c(Rank.TWO, Suit.HEARTS),
      ]);
      const bomb = [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.THREE, Suit.CLUBS),
        c(Rank.FOUR, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.SPADES),
        c(Rank.FIVE, Suit.CLUBS),
        c(Rank.SIX, Suit.SPADES),
        c(Rank.SIX, Suit.CLUBS),
      ];
      const result = validate(lastPlay, bomb);
      expect(result.valid).toBe(true);
    });

    it("3-pair bomb doesn't chop pair of 2s (too small)", () => {
      const lastPlay = new Play(Combo.PAIR, [
        c(Rank.TWO, Suit.SPADES),
        c(Rank.TWO, Suit.HEARTS),
      ]);
      const bomb = [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.THREE, Suit.CLUBS),
        c(Rank.FOUR, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.SPADES),
        c(Rank.FIVE, Suit.CLUBS),
      ];
      const result = validate(lastPlay, bomb);
      expect(result.valid).toBe(false);
    });

    it("5-pair bomb chops triple of 2s", () => {
      const lastPlay = new Play(Combo.TRIPLE, [
        c(Rank.TWO, Suit.SPADES),
        c(Rank.TWO, Suit.HEARTS),
        c(Rank.TWO, Suit.CLUBS),
      ]);
      const bomb = [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.THREE, Suit.CLUBS),
        c(Rank.FOUR, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.SPADES),
        c(Rank.FIVE, Suit.CLUBS),
        c(Rank.SIX, Suit.SPADES),
        c(Rank.SIX, Suit.CLUBS),
        c(Rank.SEVEN, Suit.SPADES),
        c(Rank.SEVEN, Suit.CLUBS),
      ];
      const result = validate(lastPlay, bomb);
      expect(result.valid).toBe(true);
    });
  });
});
