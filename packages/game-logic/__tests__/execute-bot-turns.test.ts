import { describe, expect, it } from "vitest";
import { GameState } from "../src/game-state.js";
import { executeBotTurns } from "../src/bot/bot-player.js";
import { deal } from "../src/deck.js";
import type { SeatData } from "../src/tourney.js";

function makeSeats(botPositions: number[]): SeatData[] {
  return [0, 1, 2, 3].map(
    (i): SeatData => ({
      position: i,
      playerId: botPositions.includes(i) ? `bot_${i}` : `human_${i}`,
      playerName: botPositions.includes(i) ? `Bot_${i}` : `Human_${i}`,
      connectionId: botPositions.includes(i) ? null : `conn_${i}`,
      score: 0,
      gamesWon: 0,
      lastGamePoints: 0,
      ready: true,
      isBot: botPositions.includes(i),
    }),
  );
}

describe("executeBotTurns", () => {
  it("runs bot turns until a human player", () => {
    const hands = deal(4);
    const game = new GameState(hands);
    const startPlayer = game.currentPlayer;

    // Make all players except seat 0 bots
    const seats = makeSeats([1, 2, 3]);

    if (startPlayer === 0) {
      // Human starts, no bot turns
      const moves = executeBotTurns(seats, game);
      expect(moves).toHaveLength(0);
    } else {
      // A bot starts
      const moves = executeBotTurns(seats, game);
      expect(moves.length).toBeGreaterThan(0);
      // Every move should be from a bot seat
      for (const move of moves) {
        expect(seats[move.player].isBot).toBe(true);
      }
    }
  });

  it("stops at game over", () => {
    // All bots — game should run to completion
    const hands = deal(4);
    const game = new GameState(hands);
    const seats = makeSeats([0, 1, 2, 3]);

    const moves = executeBotTurns(seats, game);
    expect(game.isGameOver()).toBe(true);
    expect(moves.length).toBeGreaterThan(0);
  });

  it("returns move entries with correct shape", () => {
    const hands = deal(4);
    const game = new GameState(hands);
    const seats = makeSeats([0, 1, 2, 3]);

    const moves = executeBotTurns(seats, game);
    for (const move of moves) {
      expect(move).toHaveProperty("player");
      expect(move).toHaveProperty("action");
      expect(["play", "pass"]).toContain(move.action);
      if (move.action === "play") {
        expect(move.cards).toBeDefined();
        expect(move.cards!.length).toBeGreaterThan(0);
        // CardData shape
        expect(move.cards![0]).toHaveProperty("rank");
        expect(move.cards![0]).toHaveProperty("suit");
        expect(move.cards![0]).toHaveProperty("value");
      }
    }
  });

  it("returns empty array when starting player is human", () => {
    const hands = deal(4);
    const game = new GameState(hands);
    // Make starting player human, rest bots
    const startPlayer = game.currentPlayer;
    const botPositions = [0, 1, 2, 3].filter((i) => i !== startPlayer);
    const seats = makeSeats(botPositions);

    const moves = executeBotTurns(seats, game);
    expect(moves).toHaveLength(0);
  });
});
