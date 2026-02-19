import { describe, it, expect } from "vitest";
import { Card, Rank, Suit } from "../src/card.js";
import { Play, Combo } from "../src/play.js";

const c = (rank: Rank, suit: Suit) => new Card(rank, suit);

describe("Play", () => {
  describe("combo detection", () => {
    it("detects single", () => {
      expect(Play.isSingle([c(Rank.THREE, Suit.SPADES)])).toBe(true);
      expect(Play.isSingle([])).toBe(false);
      expect(
        Play.isSingle([c(Rank.THREE, Suit.SPADES), c(Rank.FOUR, Suit.SPADES)]),
      ).toBe(false);
    });

    it("detects pair", () => {
      expect(
        Play.isPair([c(Rank.FIVE, Suit.SPADES), c(Rank.FIVE, Suit.HEARTS)]),
      ).toBe(true);
      expect(
        Play.isPair([c(Rank.FIVE, Suit.SPADES), c(Rank.SIX, Suit.HEARTS)]),
      ).toBe(false);
    });

    it("detects triple", () => {
      expect(
        Play.isTriple([
          c(Rank.KING, Suit.SPADES),
          c(Rank.KING, Suit.CLUBS),
          c(Rank.KING, Suit.HEARTS),
        ]),
      ).toBe(true);
    });

    it("detects quad", () => {
      expect(
        Play.isQuad([
          c(Rank.JACK, Suit.SPADES),
          c(Rank.JACK, Suit.CLUBS),
          c(Rank.JACK, Suit.DIAMONDS),
          c(Rank.JACK, Suit.HEARTS),
        ]),
      ).toBe(true);
    });

    it("detects run (3+ consecutive, no 2s)", () => {
      expect(
        Play.isRun([
          c(Rank.THREE, Suit.SPADES),
          c(Rank.FOUR, Suit.CLUBS),
          c(Rank.FIVE, Suit.HEARTS),
        ]),
      ).toBe(true);
      // 2s not allowed
      expect(
        Play.isRun([
          c(Rank.KING, Suit.SPADES),
          c(Rank.ACE, Suit.CLUBS),
          c(Rank.TWO, Suit.HEARTS),
        ]),
      ).toBe(false);
      // Gap
      expect(
        Play.isRun([
          c(Rank.THREE, Suit.SPADES),
          c(Rank.FIVE, Suit.CLUBS),
          c(Rank.SEVEN, Suit.HEARTS),
        ]),
      ).toBe(false);
      // Too short
      expect(
        Play.isRun([c(Rank.THREE, Suit.SPADES), c(Rank.FOUR, Suit.CLUBS)]),
      ).toBe(false);
    });

    it("detects long runs", () => {
      const longRun = [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.HEARTS),
        c(Rank.SIX, Suit.DIAMONDS),
        c(Rank.SEVEN, Suit.SPADES),
        c(Rank.EIGHT, Suit.CLUBS),
      ];
      expect(Play.isRun(longRun)).toBe(true);
    });

    it("detects bomb (3+ consecutive pairs)", () => {
      const bomb = [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.THREE, Suit.CLUBS),
        c(Rank.FOUR, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.SPADES),
        c(Rank.FIVE, Suit.CLUBS),
      ];
      expect(Play.isBomb(bomb)).toBe(true);
    });

    it("rejects non-consecutive pairs as bomb", () => {
      const notBomb = [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.THREE, Suit.CLUBS),
        c(Rank.FIVE, Suit.SPADES), // gap
        c(Rank.FIVE, Suit.CLUBS),
        c(Rank.SIX, Suit.SPADES),
        c(Rank.SIX, Suit.CLUBS),
      ];
      expect(Play.isBomb(notBomb)).toBe(false);
    });

    it("detects suited cards", () => {
      expect(
        Play.isSuited([
          c(Rank.THREE, Suit.HEARTS),
          c(Rank.FOUR, Suit.HEARTS),
          c(Rank.FIVE, Suit.HEARTS),
        ]),
      ).toBe(true);
      expect(
        Play.isSuited([
          c(Rank.THREE, Suit.HEARTS),
          c(Rank.FOUR, Suit.SPADES),
          c(Rank.FIVE, Suit.HEARTS),
        ]),
      ).toBe(false);
    });
  });

  describe("determineCombo", () => {
    it("returns correct combo for each type", () => {
      expect(Play.determineCombo([c(Rank.ACE, Suit.SPADES)])).toBe(
        Combo.SINGLE,
      );
      expect(
        Play.determineCombo([
          c(Rank.ACE, Suit.SPADES),
          c(Rank.ACE, Suit.HEARTS),
        ]),
      ).toBe(Combo.PAIR);
      expect(
        Play.determineCombo([
          c(Rank.ACE, Suit.SPADES),
          c(Rank.ACE, Suit.HEARTS),
          c(Rank.ACE, Suit.CLUBS),
        ]),
      ).toBe(Combo.TRIPLE);
      expect(
        Play.determineCombo([
          c(Rank.ACE, Suit.SPADES),
          c(Rank.ACE, Suit.HEARTS),
          c(Rank.ACE, Suit.CLUBS),
          c(Rank.ACE, Suit.DIAMONDS),
        ]),
      ).toBe(Combo.QUAD);
    });

    it("returns INVALID for garbage", () => {
      expect(
        Play.determineCombo([
          c(Rank.THREE, Suit.SPADES),
          c(Rank.SEVEN, Suit.HEARTS),
        ]),
      ).toBe(Combo.INVALID);
    });
  });

  describe("Play construction", () => {
    it("sorts cards descending and sets value from highest card", () => {
      const play = new Play(Combo.RUN, [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.FIVE, Suit.CLUBS),
        c(Rank.FOUR, Suit.HEARTS),
      ]);
      expect(play.cards[0].rank).toBe(Rank.FIVE);
      expect(play.value).toBe(play.cards[0].value);
    });
  });

  describe("matchesCombo", () => {
    it("run must match length", () => {
      const run3 = new Play(Combo.RUN, [
        c(Rank.THREE, Suit.SPADES),
        c(Rank.FOUR, Suit.CLUBS),
        c(Rank.FIVE, Suit.HEARTS),
      ]);
      // 4-card run doesn't match 3-card run
      expect(
        Play.matchesCombo(run3, [
          c(Rank.SIX, Suit.SPADES),
          c(Rank.SEVEN, Suit.CLUBS),
          c(Rank.EIGHT, Suit.HEARTS),
          c(Rank.NINE, Suit.DIAMONDS),
        ]),
      ).toBe(false);
      // 3-card run matches
      expect(
        Play.matchesCombo(run3, [
          c(Rank.SIX, Suit.SPADES),
          c(Rank.SEVEN, Suit.CLUBS),
          c(Rank.EIGHT, Suit.HEARTS),
        ]),
      ).toBe(true);
    });
  });
});
