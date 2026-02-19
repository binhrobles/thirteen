import { describe, expect, it } from "vitest";
import { Card, Rank, Suit } from "../src/card.js";
import { Combo, Play } from "../src/play.js";
import { GameState } from "../src/game-state.js";
import { deal } from "../src/deck.js";

describe("GameState snapshot round-trip", () => {
  it("round-trips a fresh game", () => {
    const hands = deal(4);
    const game = new GameState(hands);

    const snapshot = game.toSnapshot();
    const restored = GameState.fromSnapshot(snapshot);

    expect(restored.currentPlayer).toBe(game.currentPlayer);
    expect(restored.lastPlay).toBeNull();
    expect(restored.lastPlayBy).toBe(-1);
    expect(restored.winOrder).toEqual([]);
    expect(restored.playersInGame).toEqual([true, true, true, true]);
    expect(restored.isGameOver()).toBe(false);

    // Hands should match by card values
    for (let i = 0; i < 4; i++) {
      const originalValues = game.getHand(i).map((c) => c.value);
      const restoredValues = restored.getHand(i).map((c) => c.value);
      expect(restoredValues).toEqual(originalValues);
    }
  });

  it("round-trips a game with a lastPlay", () => {
    const hands = deal(4);
    const game = new GameState(hands);

    // Play the lowest card as a single
    const player = game.currentPlayer;
    const card = game.getHand(player)[0];
    game.playCards(player, [card]);

    const snapshot = game.toSnapshot();
    const restored = GameState.fromSnapshot(snapshot);

    expect(restored.lastPlay).not.toBeNull();
    expect(restored.lastPlay!.combo).toBe(Combo.SINGLE);
    expect(restored.lastPlay!.cards[0].value).toBe(card.value);
    expect(restored.lastPlayBy).toBe(player);
    expect(restored.currentPlayer).toBe(game.currentPlayer);
  });

  it("round-trips a game with passed players", () => {
    const hands = deal(4);
    const game = new GameState(hands);

    // Play a card, then have next player pass
    const player = game.currentPlayer;
    const card = game.getHand(player)[0];
    game.playCards(player, [card]);

    const nextPlayer = game.currentPlayer;
    game.passTurn(nextPlayer);

    const snapshot = game.toSnapshot();
    expect(snapshot.passedPlayers[nextPlayer]).toBe(true);

    const restored = GameState.fromSnapshot(snapshot);
    // passedPlayers = !playersInRound
    expect(restored.playersInRound[nextPlayer]).toBe(false);
  });

  it("preserves snapshot structure for DynamoDB", () => {
    const hands = deal(4);
    const game = new GameState(hands);
    const snapshot = game.toSnapshot();

    // Verify all required fields exist
    expect(snapshot).toHaveProperty("hands");
    expect(snapshot).toHaveProperty("currentPlayer");
    expect(snapshot).toHaveProperty("lastPlay");
    expect(snapshot).toHaveProperty("lastPlayBy");
    expect(snapshot).toHaveProperty("passedPlayers");
    expect(snapshot).toHaveProperty("winOrder");
    expect(snapshot).toHaveProperty("playersInGame");

    // Verify CardData shape
    const firstCard = snapshot.hands[0][0];
    expect(firstCard).toHaveProperty("rank");
    expect(firstCard).toHaveProperty("suit");
    expect(firstCard).toHaveProperty("value");
  });

  it("restored game is playable", () => {
    const hands = deal(4);
    const game = new GameState(hands);

    const snapshot = game.toSnapshot();
    const restored = GameState.fromSnapshot(snapshot);

    // Should be able to play cards on the restored game
    const player = restored.currentPlayer;
    const card = restored.getHand(player)[0];
    const result = restored.playCards(player, [card]);
    expect(result.valid).toBe(true);
  });
});
