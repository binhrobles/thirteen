import { Card } from "../card.js";
import { GameState } from "../game-state.js";
import { deal } from "../deck.js";
import type { BotStrategy } from "../bot/bot-player.js";
import { evaluate, getAllPlays } from "../bot/hand-evaluator.js";
import type { CardData, GameStateSnapshot } from "../types.js";

export interface LoggedMove {
  state: GameStateSnapshot;
  player: number;
  action: "play" | "pass";
  cards: CardData[];
  valid_actions: CardData[][];
  valid_action_count: number;
}

export interface GameLog {
  game_id: string;
  timestamp: string;
  players: string[];
  winner: number;
  win_order: number[];
  moves: LoggedMove[];
}

function cardsToData(cards: Card[]): CardData[] {
  return cards.map((c) => ({ rank: c.rank, suit: c.suit, value: c.value }));
}

const SAFETY_CAP = 500;

/**
 * Play a full game between bot strategies and log every decision point.
 * Returns a complete game log suitable for training data.
 */
export function playAndLog(
  strategies: BotStrategy[],
  playerLabels: string[],
  gameId?: string,
): GameLog {
  const hands = deal();
  const game = new GameState(hands);
  const moves: LoggedMove[] = [];

  for (let turn = 0; turn < SAFETY_CAP && !game.isGameOver(); turn++) {
    const player = game.currentPlayer;
    const hand = game.getHand(player);
    const snapshot = game.toSnapshot();

    const evaluation = evaluate(hand, game.lastPlay);
    const validPlays = getAllPlays(evaluation);
    const canPass = game.lastPlay !== null;

    const chosen = strategies[player].choosePlay(
      hand,
      game.lastPlay,
      snapshot,
    );

    if (chosen.length > 0) {
      moves.push({
        state: snapshot,
        player,
        action: "play",
        cards: cardsToData(chosen),
        valid_actions: validPlays.map(cardsToData),
        valid_action_count: validPlays.length + (canPass ? 1 : 0),
      });
      game.playCards(player, chosen);
    } else {
      moves.push({
        state: snapshot,
        player,
        action: "pass",
        cards: [],
        valid_actions: validPlays.map(cardsToData),
        valid_action_count: validPlays.length + 1,
      });
      game.passTurn(player);
    }
  }

  return {
    game_id: gameId ?? crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    players: playerLabels,
    winner: game.winOrder[0],
    win_order: [...game.winOrder],
    moves,
  };
}
