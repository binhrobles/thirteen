import { describe, it, expect } from "vitest";
import { greedyBot } from "../src/bot/bot-player.js";
import { playAndLog } from "../src/training/game-logger.js";
import type { GameLog } from "../src/training/game-logger.js";

describe("playAndLog", () => {
  it("plays a complete game and returns a valid log", () => {
    // Run a few games since random deals can rarely produce stuck states
    const strategies = [greedyBot, greedyBot, greedyBot, greedyBot];
    const labels = ["greedy", "greedy", "greedy", "greedy"];

    let completed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const log = playAndLog(strategies, labels, "test-game");
      expect(log.game_id).toBe("test-game");
      expect(log.players).toEqual(labels);
      expect(log.moves.length).toBeGreaterThan(0);

      if (log.win_order.length === 4) {
        expect(log.winner).toBe(log.win_order[0]);
        completed = true;
        break;
      }
    }
    expect(completed).toBe(true);
  });

  it("logs correct state and valid actions for each move", () => {
    const strategies = [greedyBot, greedyBot, greedyBot, greedyBot];
    const labels = ["greedy", "greedy", "greedy", "greedy"];
    const log = playAndLog(strategies, labels);

    for (const move of log.moves) {
      // Player must be 0-3
      expect(move.player).toBeGreaterThanOrEqual(0);
      expect(move.player).toBeLessThanOrEqual(3);

      // Action must be play or pass
      expect(["play", "pass"]).toContain(move.action);

      // State must have required fields
      expect(move.state.hands).toHaveLength(4);
      expect(move.state.playersInGame).toHaveLength(4);
      expect(move.state.passedPlayers).toHaveLength(4);

      // Valid action count must be positive
      expect(move.valid_action_count).toBeGreaterThan(0);

      if (move.action === "play") {
        // Played cards must not be empty
        expect(move.cards.length).toBeGreaterThan(0);
        // Played cards must be a subset of valid actions
        const chosenValues = new Set(move.cards.map((c) => c.value));
        const matchFound = move.valid_actions.some((va) => {
          const vaValues = new Set(va.map((c) => c.value));
          return (
            vaValues.size === chosenValues.size &&
            [...chosenValues].every((v) => vaValues.has(v))
          );
        });
        expect(matchFound).toBe(true);
      } else {
        // Pass: cards must be empty
        expect(move.cards).toHaveLength(0);
      }
    }
  });

  it("includes cardsPlayedByPlayer in snapshots", () => {
    const strategies = [greedyBot, greedyBot, greedyBot, greedyBot];
    const labels = ["greedy", "greedy", "greedy", "greedy"];
    const log = playAndLog(strategies, labels);

    // First move should have empty cardsPlayedByPlayer
    const firstMove = log.moves[0];
    expect(firstMove.state.cardsPlayedByPlayer).toBeDefined();
    expect(firstMove.state.cardsPlayedByPlayer!.every((p) => p.length === 0)).toBe(true);

    // After some plays, cardsPlayedByPlayer should be populated
    const laterMoves = log.moves.filter((m) => m.action === "play");
    if (laterMoves.length > 1) {
      const laterMove = laterMoves[laterMoves.length - 1];
      const totalPlayed = laterMove.state.cardsPlayedByPlayer!.reduce(
        (sum, p) => sum + p.length,
        0,
      );
      expect(totalPlayed).toBeGreaterThan(0);
    }
  });

  it("produces valid JSONL output", () => {
    const strategies = [greedyBot, greedyBot, greedyBot, greedyBot];
    const log = playAndLog(strategies, ["g", "g", "g", "g"]);

    // Should be serializable to JSON
    const json = JSON.stringify(log);
    const parsed: GameLog = JSON.parse(json);

    expect(parsed.game_id).toBe(log.game_id);
    expect(parsed.moves.length).toBe(log.moves.length);
  });
});
