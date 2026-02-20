/**
 * Local game adapter
 *
 * Wraps the existing game.svelte.ts store to provide a unified interface
 * for the shared game UI components.
 */

import { Play, type Card, type PlayLogEntry } from "@thirteen/game-logic";
import {
  game,
  toggleCard as gameToggleCard,
  clearSelection as gameClearSelection,
  playSelectedCards,
  passTurn,
  startLocalGame,
  toggleRoundHistory as gameToggleRoundHistory,
  closeRoundHistory as gameCloseRoundHistory,
  HUMAN_PLAYER,
} from "../game.svelte.js";
import type {
  UnifiedGameContext,
  UnifiedGameState,
  GameActions,
  GameHelpers,
  GameStateView,
} from "../types.js";

// Default bot names for local play
const BOT_NAMES = ["Bot Alice", "Bot Bob", "Bot Carol"];

function getLocalPlayerName(position: number): string {
  if (position === HUMAN_PLAYER) return "You";
  const botIndex = position > HUMAN_PLAYER ? position - 1 : position;
  return BOT_NAMES[botIndex] ?? `Bot ${position}`;
}

export function createLocalAdapter(): UnifiedGameContext {
  // Derive unified state from local game store
  const state: UnifiedGameState = $derived.by(() => {
    // Access stateVersion to trigger reactivity
    game.stateVersion;
    const gs = game.gameState;

    return {
      // Core game state
      playerHand: gs?.getHand(HUMAN_PLAYER) ?? [],
      currentPlayer: gs?.currentPlayer ?? -1,
      lastPlay: gs?.lastPlay
        ? {
            combo: gs.lastPlay.combo,
            cards: gs.lastPlay.cards,
            suited: gs.lastPlay.suited,
          }
        : null,
      passedPlayers: gs?.playersInRound.map((inRound) => !inRound) ?? [
        false,
        false,
        false,
        false,
      ],
      handCounts: gs
        ? [0, 1, 2, 3].map((i) => gs.getHand(i).length)
        : [0, 0, 0, 0],
      isGameOver: gs?.isGameOver() ?? false,
      winOrder: game.winOrder ?? [],

      // UI state
      selectedCards: game.selectedCards,
      statusMessage: game.statusMessage,
      isStatusError: game.isStatusError,
      isThinking: game.botThinking,
      showRoundHistory: game.showRoundHistory,
      playLog: gs?.playLog ?? [],

      // Context
      yourPosition: HUMAN_PLAYER,
      mode: "local" as const,

      // No tournament in local mode
      tournament: undefined,
    };
  });

  // Create a GameStateView for Pixi rendering
  const stateView: GameStateView = $derived.by(() => {
    game.stateVersion;
    const gs = game.gameState;

    if (!gs) {
      // Return a minimal view when no game state exists
      return {
        getHand: () => [],
        playersInRound: [false, false, false, false],
        currentPlayer: -1,
        lastPlay: null,
        isGameOver: () => true,
      };
    }

    return {
      getHand: (player: number): Card[] => gs.getHand(player),
      playersInRound: gs.playersInRound,
      currentPlayer: gs.currentPlayer,
      lastPlay: gs.lastPlay,
      isGameOver: (): boolean => gs.isGameOver(),
    };
  });

  const actions: GameActions = {
    playCards: () => {
      playSelectedCards();
    },
    pass: () => {
      passTurn();
    },
    toggleCard: (cardValue: number) => {
      gameToggleCard(cardValue);
    },
    clearSelection: () => {
      gameClearSelection();
    },
    toggleRoundHistory: () => {
      gameToggleRoundHistory();
    },
    closeRoundHistory: () => {
      gameCloseRoundHistory();
    },
    startNewGame: () => {
      startLocalGame();
    },
    readyUp: () => {
      // No-op for local mode - no tournament readying
    },
  };

  const helpers: GameHelpers = {
    isYourTurn: (): boolean => {
      game.stateVersion;
      const gs = game.gameState;
      return (
        gs !== null &&
        !gs.isGameOver() &&
        gs.currentPlayer === HUMAN_PLAYER &&
        !game.botThinking
      );
    },
    hasPower: (): boolean => {
      game.stateVersion;
      return game.gameState !== null && game.gameState.lastPlay === null;
    },
    canPass: (): boolean => {
      game.stateVersion;
      const gs = game.gameState;
      return (
        gs !== null &&
        !gs.isGameOver() &&
        gs.currentPlayer === HUMAN_PLAYER &&
        !game.botThinking &&
        gs.lastPlay !== null
      );
    },
    getPlayerName: getLocalPlayerName,
  };

  return {
    get state() {
      return state;
    },
    get stateView() {
      return stateView;
    },
    actions,
    helpers,
  };
}
