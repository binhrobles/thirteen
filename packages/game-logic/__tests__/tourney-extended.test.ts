import { describe, expect, it } from "vitest";
import { Tourney, TourneyStatus } from "../src/tourney.js";

describe("Tourney.startGame", () => {
  function fillTourney(): Tourney {
    const tourney = new Tourney();
    tourney.claimSeat("p1", "Alice", "conn1", 0);
    tourney.addBot(1);
    tourney.addBot(2);
    tourney.addBot(3);
    return tourney;
  }

  it("creates a GameState and stores snapshot as currentGame", () => {
    const tourney = fillTourney();
    tourney.setReady("p1");

    const game = tourney.startGame();
    expect(game).toBeDefined();
    expect(tourney.currentGame).not.toBeNull();

    // Snapshot should have hands with 13 cards each
    const snap = tourney.currentGame as Record<string, unknown>;
    const hands = snap.hands as unknown[][];
    expect(hands).toHaveLength(4);
    for (const hand of hands) {
      expect(hand).toHaveLength(13);
    }
  });

  it("resets ready flags", () => {
    const tourney = fillTourney();
    tourney.setReady("p1");
    tourney.startGame();

    for (const seat of tourney.seats) {
      expect(seat.ready).toBe(false);
    }
  });

  it("throws if not all seats filled", () => {
    const tourney = new Tourney();
    tourney.claimSeat("p1", "Alice", "conn1", 0);
    expect(() => tourney.startGame()).toThrow();
  });

  it("returns a playable GameState", () => {
    const tourney = fillTourney();
    tourney.setReady("p1");
    const game = tourney.startGame();

    const player = game.currentPlayer;
    const card = game.getHand(player)[0];
    const result = game.playCards(player, [card]);
    expect(result.valid).toBe(true);
  });
});

describe("Tourney.cleanupDisconnectedPlayers", () => {
  it("removes players past grace period", () => {
    const tourney = new Tourney();
    tourney.claimSeat("p1", "Alice", "conn1", 0);
    tourney.claimSeat("p2", "Bob", "conn2", 1);

    // Simulate disconnect 10 seconds ago
    tourney.seats[1].disconnectedAt = 100;

    const removed = tourney.cleanupDisconnectedPlayers(5, 111);
    expect(removed).toBe(true);
    expect(tourney.seats[1].playerId).toBeNull();
    expect(tourney.status).toBe(TourneyStatus.WAITING);
  });

  it("does not remove players within grace period", () => {
    const tourney = new Tourney();
    tourney.claimSeat("p1", "Alice", "conn1", 0);
    tourney.claimSeat("p2", "Bob", "conn2", 1);

    // Simulate disconnect 2 seconds ago
    tourney.seats[1].disconnectedAt = 100;

    const removed = tourney.cleanupDisconnectedPlayers(5, 102);
    expect(removed).toBe(false);
    expect(tourney.seats[1].playerId).toBe("p2");
  });

  it("does nothing for IN_PROGRESS tournaments", () => {
    const tourney = new Tourney();
    tourney.claimSeat("p1", "Alice", "conn1", 0);
    tourney.addBot(1);
    tourney.addBot(2);
    tourney.addBot(3);
    tourney.setReady("p1");
    // status is now IN_PROGRESS
    tourney.seats[0].disconnectedAt = 0;

    const removed = tourney.cleanupDisconnectedPlayers(5, 100);
    expect(removed).toBe(false);
  });

  it("returns false when no one disconnected", () => {
    const tourney = new Tourney();
    tourney.claimSeat("p1", "Alice", "conn1", 0);

    const removed = tourney.cleanupDisconnectedPlayers(5, 100);
    expect(removed).toBe(false);
  });
});
