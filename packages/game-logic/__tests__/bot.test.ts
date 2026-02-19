import { describe, it, expect } from "vitest";
import { Card, Rank, Suit } from "../src/card.js";
import { Play, Combo } from "../src/play.js";
import { evaluate, hasAnyPlays } from "../src/bot/hand-evaluator.js";
import { choosePlay } from "../src/bot/bot-player.js";
import { GameState } from "../src/game-state.js";
import { deal } from "../src/deck.js";

const c = (rank: Rank, suit: Suit) => new Card(rank, suit);

describe("BotHandEvaluator", () => {
  it("finds all singles when opening", () => {
    const hand = [
      c(Rank.THREE, Suit.SPADES),
      c(Rank.FIVE, Suit.HEARTS),
      c(Rank.SEVEN, Suit.CLUBS),
    ];
    const result = evaluate(hand, null);
    expect(result.singles.length).toBe(3);
  });

  it("finds pairs", () => {
    const hand = [
      c(Rank.FIVE, Suit.SPADES),
      c(Rank.FIVE, Suit.HEARTS),
      c(Rank.SEVEN, Suit.CLUBS),
    ];
    const result = evaluate(hand, null);
    expect(result.pairs.length).toBe(1);
    expect(result.pairs[0].length).toBe(2);
  });

  it("finds all pair combinations from 3 of same rank", () => {
    const hand = [
      c(Rank.FIVE, Suit.SPADES),
      c(Rank.FIVE, Suit.HEARTS),
      c(Rank.FIVE, Suit.CLUBS),
    ];
    const result = evaluate(hand, null);
    // C(3,2) = 3 pairs
    expect(result.pairs.length).toBe(3);
    expect(result.triples.length).toBe(1);
  });

  it("finds runs", () => {
    const hand = [
      c(Rank.THREE, Suit.SPADES),
      c(Rank.FOUR, Suit.CLUBS),
      c(Rank.FIVE, Suit.HEARTS),
      c(Rank.SIX, Suit.DIAMONDS),
    ];
    const result = evaluate(hand, null);
    // Should find 3-card and 4-card runs
    expect(result.runs.length).toBeGreaterThanOrEqual(2);
  });

  it("finds only beating plays against a last play", () => {
    const lastPlay = new Play(Combo.SINGLE, [c(Rank.SEVEN, Suit.HEARTS)]);
    const hand = [
      c(Rank.THREE, Suit.SPADES),
      c(Rank.FIVE, Suit.HEARTS),
      c(Rank.NINE, Suit.CLUBS),
    ];
    const result = evaluate(hand, lastPlay);
    // Only 9 beats 7
    expect(result.singles.length).toBe(1);
    expect(result.singles[0][0].rank).toBe(Rank.NINE);
  });

  it("finds bombs", () => {
    const hand = [
      c(Rank.THREE, Suit.SPADES),
      c(Rank.THREE, Suit.CLUBS),
      c(Rank.FOUR, Suit.SPADES),
      c(Rank.FOUR, Suit.CLUBS),
      c(Rank.FIVE, Suit.SPADES),
      c(Rank.FIVE, Suit.CLUBS),
    ];
    const result = evaluate(hand, null);
    expect(result.bombs.length).toBeGreaterThanOrEqual(1);
  });

  it("finds quads for chopping 2s", () => {
    const lastPlay = new Play(Combo.SINGLE, [c(Rank.TWO, Suit.HEARTS)]);
    const hand = [
      c(Rank.SIX, Suit.SPADES),
      c(Rank.SIX, Suit.CLUBS),
      c(Rank.SIX, Suit.DIAMONDS),
      c(Rank.SIX, Suit.HEARTS),
      c(Rank.SEVEN, Suit.SPADES),
    ];
    const result = evaluate(hand, lastPlay);
    expect(result.quads.length).toBe(1);
  });

  it("hasAnyPlays returns false when no plays available", () => {
    const lastPlay = new Play(Combo.SINGLE, [c(Rank.TWO, Suit.HEARTS)]);
    const hand = [c(Rank.THREE, Suit.SPADES)]; // Can't beat 2♥
    const result = evaluate(hand, lastPlay);
    expect(hasAnyPlays(result)).toBe(false);
  });
});

describe("BotPlayer", () => {
  it("plays lowest single when opening", () => {
    const hand = [
      c(Rank.THREE, Suit.SPADES),
      c(Rank.FIVE, Suit.HEARTS),
      c(Rank.ACE, Suit.CLUBS),
    ];
    const cards = choosePlay(hand, null);
    expect(cards.length).toBe(1);
    expect(cards[0].rank).toBe(Rank.THREE);
  });

  it("plays lowest valid combo when responding", () => {
    const lastPlay = new Play(Combo.SINGLE, [c(Rank.FIVE, Suit.SPADES)]);
    const hand = [
      c(Rank.THREE, Suit.SPADES),
      c(Rank.SEVEN, Suit.HEARTS),
      c(Rank.ACE, Suit.CLUBS),
    ];
    const cards = choosePlay(hand, lastPlay);
    expect(cards.length).toBe(1);
    expect(cards[0].rank).toBe(Rank.SEVEN); // Lowest that beats 5
  });

  it("returns empty array (pass) when can't beat", () => {
    const lastPlay = new Play(Combo.SINGLE, [c(Rank.TWO, Suit.HEARTS)]);
    const hand = [c(Rank.THREE, Suit.SPADES), c(Rank.FIVE, Suit.CLUBS)];
    const cards = choosePlay(hand, lastPlay);
    expect(cards.length).toBe(0);
  });

  it("plays a full game with 4 bots to completion", () => {
    const hands = deal();
    const gs = new GameState(hands);
    let moves = 0;
    const maxMoves = 500;

    while (!gs.isGameOver() && moves < maxMoves) {
      const player = gs.currentPlayer;
      const hand = gs.getHand(player);
      const cards = choosePlay(hand, gs.lastPlay);

      if (cards.length > 0) {
        const result = gs.playCards(player, cards);
        if (!result.valid) {
          // Shouldn't happen — bot returned invalid play
          throw new Error(
            `Bot ${player} returned invalid play: ${result.error}`,
          );
        }
      } else {
        const passed = gs.passTurn(player);
        if (!passed) {
          throw new Error(`Bot ${player} failed to pass`);
        }
      }
      moves++;
    }

    expect(gs.isGameOver()).toBe(true);
    expect(gs.winOrder.length).toBe(4);
    expect([...gs.winOrder].sort()).toEqual([0, 1, 2, 3]);
  });

  it("plays multiple full games consistently", () => {
    // Run 10 games to check for any edge-case crashes
    for (let game = 0; game < 10; game++) {
      const hands = deal();
      const gs = new GameState(hands);
      let moves = 0;

      while (!gs.isGameOver() && moves < 1000) {
        const player = gs.currentPlayer;
        const hand = gs.getHand(player);
        const cards = choosePlay(hand, gs.lastPlay);

        if (cards.length > 0) {
          gs.playCards(player, cards);
        } else {
          gs.passTurn(player);
        }
        moves++;
      }

      expect(gs.isGameOver()).toBe(true);
    }
  });
});
