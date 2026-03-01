import { describe, it, expect } from "vitest";
import { Card, Rank, Suit } from "../src/card.js";
import { GameState, type GameEvent } from "../src/game-state.js";
import { deal } from "../src/deck.js";

const c = (rank: Rank, suit: Suit) => new Card(rank, suit);

/** Create a game state with controlled hands */
function makeGame(hands: Card[][]): GameState {
  return new GameState(hands);
}

describe("GameState", () => {
  it("sets starting player to whoever has 3♠", () => {
    const hands: Card[][] = [
      [c(Rank.FIVE, Suit.SPADES), c(Rank.SIX, Suit.CLUBS)],
      [c(Rank.THREE, Suit.SPADES), c(Rank.FOUR, Suit.HEARTS)],
      [c(Rank.SEVEN, Suit.DIAMONDS), c(Rank.EIGHT, Suit.CLUBS)],
      [c(Rank.NINE, Suit.HEARTS), c(Rank.TEN, Suit.SPADES)],
    ];
    const gs = makeGame(hands);
    expect(gs.currentPlayer).toBe(1);
  });

  it("validates and executes a play", () => {
    const hands: Card[][] = [
      [c(Rank.THREE, Suit.SPADES), c(Rank.FIVE, Suit.CLUBS)],
      [c(Rank.FOUR, Suit.HEARTS), c(Rank.SIX, Suit.DIAMONDS)],
      [c(Rank.SEVEN, Suit.CLUBS), c(Rank.EIGHT, Suit.HEARTS)],
      [c(Rank.NINE, Suit.SPADES), c(Rank.TEN, Suit.DIAMONDS)],
    ];
    const gs = makeGame(hands);
    // Player 0 has 3♠
    expect(gs.currentPlayer).toBe(0);

    const result = gs.playCards(0, [c(Rank.THREE, Suit.SPADES)]);
    expect(result.valid).toBe(true);
    expect(gs.hands[0].length).toBe(1); // removed one card
  });

  it("rejects play from wrong player", () => {
    const hands: Card[][] = [
      [c(Rank.THREE, Suit.SPADES)],
      [c(Rank.FOUR, Suit.HEARTS)],
      [c(Rank.SEVEN, Suit.CLUBS)],
      [c(Rank.NINE, Suit.SPADES)],
    ];
    const gs = makeGame(hands);
    const result = gs.canPlay(1, [c(Rank.FOUR, Suit.HEARTS)]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Not your turn");
  });

  it("rejects card not in hand", () => {
    const hands: Card[][] = [
      [c(Rank.THREE, Suit.SPADES)],
      [c(Rank.FOUR, Suit.HEARTS)],
      [c(Rank.SEVEN, Suit.CLUBS)],
      [c(Rank.NINE, Suit.SPADES)],
    ];
    const gs = makeGame(hands);
    const result = gs.canPlay(0, [c(Rank.ACE, Suit.HEARTS)]);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("You don't have that card");
  });

  it("pass locks player out of round", () => {
    const hands: Card[][] = [
      [c(Rank.THREE, Suit.SPADES), c(Rank.FIVE, Suit.CLUBS)],
      [c(Rank.FOUR, Suit.HEARTS), c(Rank.SIX, Suit.DIAMONDS)],
      [c(Rank.SEVEN, Suit.CLUBS), c(Rank.EIGHT, Suit.HEARTS)],
      [c(Rank.NINE, Suit.SPADES), c(Rank.TEN, Suit.DIAMONDS)],
    ];
    const gs = makeGame(hands);
    // Player 0 plays
    gs.playCards(0, [c(Rank.THREE, Suit.SPADES)]);
    // Clockwise: 0 → 1 → 2 → 3
    expect(gs.currentPlayer).toBe(1);
    gs.passTurn(1);
    expect(gs.playersInRound[1]).toBe(false);
  });

  it("can't pass with power", () => {
    const hands: Card[][] = [
      [c(Rank.THREE, Suit.SPADES)],
      [c(Rank.FOUR, Suit.HEARTS)],
      [c(Rank.SEVEN, Suit.CLUBS)],
      [c(Rank.NINE, Suit.SPADES)],
    ];
    const gs = makeGame(hands);
    expect(gs.hasPower()).toBe(true);
    expect(gs.passTurn(0)).toBe(false);
  });

  it("round resets when all others pass", () => {
    const hands: Card[][] = [
      [c(Rank.THREE, Suit.SPADES), c(Rank.FIVE, Suit.CLUBS), c(Rank.KING, Suit.HEARTS)],
      [c(Rank.FOUR, Suit.HEARTS), c(Rank.SIX, Suit.DIAMONDS), c(Rank.ACE, Suit.CLUBS)],
      [c(Rank.SEVEN, Suit.CLUBS), c(Rank.EIGHT, Suit.HEARTS), c(Rank.TEN, Suit.SPADES)],
      [c(Rank.NINE, Suit.SPADES), c(Rank.TEN, Suit.DIAMONDS), c(Rank.JACK, Suit.CLUBS)],
    ];
    const gs = makeGame(hands);
    const events: GameEvent[] = [];
    gs.on((e) => events.push(e));

    // Player 0 plays 3♠
    gs.playCards(0, [c(Rank.THREE, Suit.SPADES)]);
    // Clockwise: players 1, 2, 3 all pass
    gs.passTurn(1);
    gs.passTurn(2);
    gs.passTurn(3);

    // Player 0 should have power again
    expect(gs.currentPlayer).toBe(0);
    expect(gs.hasPower()).toBe(true);

    const roundResets = events.filter((e) => e.type === "round_reset");
    expect(roundResets.length).toBe(1);
  });

  it("emits game_over when only 1 player remains", () => {
    // Give each player just one card so they win immediately
    // Clockwise order: 0 → 1 → 2 → 3, so cards increase in that order
    const hands: Card[][] = [
      [c(Rank.THREE, Suit.SPADES)],   // Player 0: 3♠ (starts)
      [c(Rank.FOUR, Suit.HEARTS)],    // Player 1: 4♥
      [c(Rank.FIVE, Suit.CLUBS)],     // Player 2: 5♣
      [c(Rank.SIX, Suit.DIAMONDS)],   // Player 3: 6♦ (last, won't play)
    ];
    const gs = makeGame(hands);
    const events: GameEvent[] = [];
    gs.on((e) => events.push(e));

    // Clockwise order: 0 → 1 → 2 → 3
    // Player 0 plays and wins
    gs.playCards(0, [c(Rank.THREE, Suit.SPADES)]);
    // Player 1 plays and wins
    gs.playCards(1, [c(Rank.FOUR, Suit.HEARTS)]);
    // Player 2 plays and wins
    gs.playCards(2, [c(Rank.FIVE, Suit.CLUBS)]);

    expect(gs.isGameOver()).toBe(true);
    expect(gs.winOrder).toEqual([0, 1, 2, 3]);

    const gameOverEvents = events.filter((e) => e.type === "game_over");
    expect(gameOverEvents.length).toBe(1);
  });

  it("gives power to the next player clockwise when a player wins with last card and no one beats it", () => {
    // Player 0 has only 3♠ and will play their last card
    // Players 1, 2, 3 have higher cards but will pass
    // Power should go to player 1 (clockwise from 0)
    const hands: Card[][] = [
      [c(Rank.THREE, Suit.SPADES)],
      [c(Rank.FIVE, Suit.CLUBS), c(Rank.SIX, Suit.DIAMONDS)],
      [c(Rank.SEVEN, Suit.HEARTS), c(Rank.EIGHT, Suit.CLUBS)],
      [c(Rank.NINE, Suit.SPADES), c(Rank.TEN, Suit.DIAMONDS)],
    ];
    const gs = makeGame(hands);
    const events: GameEvent[] = [];
    gs.on((e) => events.push(e));

    // Player 0 plays their last card
    gs.playCards(0, [c(Rank.THREE, Suit.SPADES)]);
    expect(gs.winOrder).toEqual([0]);

    // Clockwise order: 1 → 2 → 3
    // Everyone passes
    gs.passTurn(1);
    gs.passTurn(2);
    gs.passTurn(3);

    // Player 1 (to the left of player 0) should have power
    expect(gs.currentPlayer).toBe(1);
    expect(gs.hasPower()).toBe(true);

    const roundResets = events.filter((e) => e.type === "round_reset");
    expect(roundResets.length).toBe(1);
    expect(roundResets[0].player).toBe(1);
  });

  it("plays a full game with dealt hands", () => {
    const hands = deal();
    const gs = new GameState(hands);
    let moves = 0;
    const maxMoves = 200;

    // Simple simulation: each player plays lowest card or passes
    while (!gs.isGameOver() && moves < maxMoves) {
      const player = gs.currentPlayer;
      const hand = gs.getHand(player);

      if (gs.hasPower()) {
        // Play lowest card
        gs.playCards(player, [hand[0]]);
      } else {
        // Try each card, play first valid one
        let played = false;
        for (const card of hand) {
          const result = gs.canPlay(player, [card]);
          if (result.valid) {
            gs.playCards(player, [card]);
            played = true;
            break;
          }
        }
        if (!played) {
          gs.passTurn(player);
        }
      }
      moves++;
    }

    expect(gs.isGameOver()).toBe(true);
    expect(gs.winOrder.length).toBe(4);
    // All 4 players should be in win order
    expect([...gs.winOrder].sort()).toEqual([0, 1, 2, 3]);
  });
});
