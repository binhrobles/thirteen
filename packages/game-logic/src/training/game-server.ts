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

let tourneyScores: number[] = [0, 0, 0, 0];
let tourneyGameNumber = 0;
let tourneyTargetScore = 21;
let tourneyMode = false;

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

  // ⚠️  SYNC WARNING: This must match packages/training/python/features.py encode_state().
  // Per-card combo type breakdown: 52×7 flat array.
  // For each card, tracks how many combos of each type (SINGLE=0..BOMB=5, INVALID=6) it appears in.
  // Encodes both card versatility AND combo strength — a card in a bomb is very different from one only in singles.
  const potential = evaluate(hand, null);
  const comboTypeMap = new Array(52 * 7).fill(0);
  const comboGroups: [string, Card[][]][] = [
    ["SINGLE", potential.singles],
    ["PAIR", potential.pairs],
    ["TRIPLE", potential.triples],
    ["QUAD", potential.quads],
    ["RUN", potential.runs],
    ["BOMB", potential.bombs],
  ];
  for (const [comboName, plays] of comboGroups) {
    const comboIdx = comboName === "SINGLE" ? 0 : comboName === "PAIR" ? 1 : comboName === "TRIPLE" ? 2 : comboName === "QUAD" ? 3 : comboName === "RUN" ? 4 : 5;
    for (const play of plays) {
      for (const card of play) {
        comboTypeMap[card.value * 7 + comboIdx]++;
      }
    }
  }
  snapshot.handComboTypeMap = comboTypeMap;

  if (tourneyMode) {
    // Estimate expected total games: target_score / avg_ppg_per_game
    // Average PPG per player = 7/4 = 1.75, so ~12 games to reach 21
    const expectedTotal = Math.ceil(tourneyTargetScore / 1.75);
    snapshot.tourneyContext = {
      scores: [...tourneyScores],
      targetScore: tourneyTargetScore,
      gameNumber: tourneyGameNumber,
      expectedTotalGames: expectedTotal,
    };
  }

  return {
    type: "turn",
    state: snapshot,
    player,
    valid_actions: validPlays.map(cardsToData),
    can_pass: canPass,
  };
}

function handleCommand(line: string) {
  let msg: { cmd: string; action_index?: number; greedy_seats?: number[]; target_score?: number; win_order?: number[] };
  try {
    msg = JSON.parse(line);
  } catch {
    send({ type: "error", message: "Invalid JSON" });
    return;
  }

  switch (msg.cmd) {
    case "new_game": {
      tourneyMode = false;
      const hands = deal();
      game = new GameState(hands);
      greedySeats = new Set(msg.greedy_seats ?? []);
      send(advancePastGreedy());
      break;
    }

    case "new_tourney": {
      tourneyMode = true;
      tourneyScores = [0, 0, 0, 0];
      tourneyGameNumber = 0;
      tourneyTargetScore = msg.target_score ?? 21;
      // Start first game
      const hands = deal();
      game = new GameState(hands);
      greedySeats = new Set(msg.greedy_seats ?? []);
      tourneyGameNumber = 1;
      send(advancePastGreedy());
      break;
    }

    case "next_game": {
      if (!tourneyMode) {
        send({ type: "error", message: "Not in tournament mode" });
        break;
      }
      // Update scores from the win order of the previous game
      const winOrder: number[] = msg.win_order!;
      const points = [4, 2, 1, 0];
      for (let i = 0; i < winOrder.length; i++) {
        tourneyScores[winOrder[i]] += points[i];
      }

      // Check if tournament is over
      const maxScore = Math.max(...tourneyScores);
      if (maxScore >= tourneyTargetScore) {
        send({
          type: "tourney_over",
          scores: [...tourneyScores],
          games_played: tourneyGameNumber,
        });
        tourneyMode = false;
        break;
      }

      // Start next game
      const hands = deal();
      game = new GameState(hands);
      greedySeats = new Set(msg.greedy_seats ?? []);
      tourneyGameNumber++;
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
