#!/usr/bin/env node
/**
 * Step-by-step game server for PPO training.
 *
 * Communicates via JSON lines over stdin/stdout.
 * Python sends commands, TS responds with game state.
 *
 * Protocol:
 *   → {"cmd": "new_game"}
 *   ← {"type": "turn", "state": <snapshot>, "player": 2, "valid_actions": [[cards]...], "can_pass": false}
 *
 *   → {"cmd": "step", "action_index": 5}
 *   ← {"type": "turn", ...} or {"type": "game_over", "win_order": [2,0,3,1]}
 *
 *   → {"cmd": "quit"}
 *   (process exits)
 */

import { Card } from "../card.js";
import { GameState } from "../game-state.js";
import { deal } from "../deck.js";
import { evaluate, getAllPlays } from "../bot/hand-evaluator.js";
import { choosePlay } from "../bot/bot-player.js";
import type { CardData } from "../types.js";
import { createInterface } from "node:readline";

function cardsToData(cards: Card[]): CardData[] {
  return cards.map((c) => ({ rank: c.rank, suit: c.suit, value: c.value }));
}

function send(obj: unknown) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

let game: GameState | null = null;
let greedySeats: Set<number> = new Set();

/**
 * Auto-play greedy seats until it's a non-greedy player's turn or game over.
 * Returns the response for the next non-greedy turn (or game_over).
 */
function advancePastGreedy() {
  const SAFETY_CAP = 500;
  for (let i = 0; i < SAFETY_CAP && game && !game.isGameOver(); i++) {
    const player = game.currentPlayer;
    if (!greedySeats.has(player)) break;

    const hand = game.getHand(player);
    const cardsToPlay = choosePlay(hand, game.lastPlay);
    if (cardsToPlay.length > 0) {
      game.playCards(player, cardsToPlay);
    } else {
      game.passTurn(player);
    }
  }
  return getTurnResponse();
}

function getTurnResponse() {
  if (!game || game.isGameOver()) {
    return { type: "game_over", win_order: game ? [...game.winOrder] : [] };
  }

  const player = game.currentPlayer;
  const hand = game.getHand(player);
  const snapshot = game.toSnapshot();
  const evaluation = evaluate(hand, game.lastPlay);
  const validPlays = getAllPlays(evaluation);
  const canPass = game.lastPlay !== null;

  return {
    type: "turn",
    state: snapshot,
    player,
    valid_actions: validPlays.map(cardsToData),
    can_pass: canPass,
  };
}

function handleCommand(line: string) {
  let msg: { cmd: string; action_index?: number; greedy_seats?: number[] };
  try {
    msg = JSON.parse(line);
  } catch {
    send({ type: "error", message: "Invalid JSON" });
    return;
  }

  switch (msg.cmd) {
    case "new_game": {
      const hands = deal();
      game = new GameState(hands);
      greedySeats = new Set(msg.greedy_seats ?? []);
      send(advancePastGreedy());
      break;
    }

    case "step": {
      if (!game || game.isGameOver()) {
        send({ type: "error", message: "No active game" });
        break;
      }

      const player = game.currentPlayer;
      const hand = game.getHand(player);
      const evaluation = evaluate(hand, game.lastPlay);
      const validPlays = getAllPlays(evaluation);
      const canPass = game.lastPlay !== null;
      const actionIndex = msg.action_index ?? 0;

      // action_index == validPlays.length means pass (when canPass is true)
      if (canPass && actionIndex === validPlays.length) {
        game.passTurn(player);
      } else if (actionIndex >= 0 && actionIndex < validPlays.length) {
        game.playCards(player, validPlays[actionIndex]);
      } else {
        send({
          type: "error",
          message: `Invalid action_index ${actionIndex} (${validPlays.length} plays, canPass=${canPass})`,
        });
        break;
      }

      // After the model's move, auto-play any greedy seats before responding
      send(advancePastGreedy());
      break;
    }

    case "quit": {
      process.exit(0);
    }

    default:
      send({ type: "error", message: `Unknown command: ${msg.cmd}` });
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", handleCommand);
rl.on("close", () => process.exit(0));
