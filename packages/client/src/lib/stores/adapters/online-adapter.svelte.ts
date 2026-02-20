/**
 * Online game adapter
 *
 * Wraps the existing online.svelte.ts store to provide a unified interface
 * for the shared game UI components.
 */

import { Card, Play } from "@thirteen/game-logic";
import {
  online,
  toggleCard as onlineToggleCard,
  clearSelection as onlineClearSelection,
  playSelectedCards,
  passTurn,
  isYourTurn as onlineIsYourTurn,
  hasPower as onlineHasPower,
  canPass as onlineCanPass,
} from "../online.svelte.js";
import { navigate } from "../router.svelte.js";
import type {
  UnifiedGameContext,
  UnifiedGameState,
  GameActions,
  GameHelpers,
  GameStateView,
  TournamentState,
} from "../types.js";

function getOnlinePlayerName(position: number): string {
  if (position === online.yourPosition) return "You";
  return (
    online.tourney?.seats[position]?.playerName ?? `Player ${position + 1}`
  );
}

export function createOnlineAdapter(): UnifiedGameContext {
  // Derive unified state from online store
  const state: UnifiedGameState = $derived.by(() => {
    // Build tournament state if available
    let tournament: TournamentState | undefined;
    if (online.gameOver) {
      tournament = {
        pointsAwarded: online.pointsAwarded,
        tourneyComplete: online.tourneyComplete,
        tourneyWinner: online.tourneyWinner,
        seats:
          online.tourney?.seats.map((s) => ({
            position: s.position,
            playerName: s.playerName,
            isBot: s.isBot,
          })) ?? [],
      };
    }

    return {
      // Core game state
      playerHand: online.yourHand,
      currentPlayer: online.currentPlayer,
      lastPlay: online.lastPlay,
      passedPlayers: online.passedPlayers,
      handCounts: online.handCounts,
      isGameOver: online.gameOver,
      winOrder: online.winOrder,

      // UI state
      selectedCards: online.selectedCards,
      statusMessage: online.statusMessage,
      isStatusError: online.errorMessage !== "",
      isThinking: false, // Online doesn't show thinking state
      showRoundHistory: false, // Online doesn't support round history yet
      playLog: [], // Online doesn't track play log on client

      // Context
      yourPosition: online.yourPosition,
      mode: "online" as const,

      // Tournament state
      tournament,
    };
  });

  // Create a synthetic GameStateView for Pixi rendering
  const stateView: GameStateView = $derived.by(() => {
    // For online mode, we create a synthetic view since we only have partial data
    // Create placeholder cards for opponents based on hand counts

    return {
      getHand: (player: number): Card[] => {
        // Return actual cards for the human player
        if (player === online.yourPosition) {
          return online.yourHand;
        }
        // Return placeholder cards for opponents so Pixi can render card backs
        // We use arbitrary card values since only the count matters for card backs
        const count = online.handCounts[player] ?? 0;
        return Array.from({ length: count }, (_, i) => Card.fromValue(i));
      },
      playersInRound: online.passedPlayers.map((passed) => !passed),
      currentPlayer: online.currentPlayer,
      lastPlay: online.lastPlay
        ? new Play(
            online.lastPlay.combo,
            online.lastPlay.cards,
            online.lastPlay.suited,
          )
        : null,
      isGameOver: (): boolean => online.gameOver,
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
      onlineToggleCard(cardValue);
    },
    clearSelection: () => {
      onlineClearSelection();
    },
    toggleRoundHistory: () => {
      // Online doesn't support round history drawer yet
      // Could show a toast or implement later
    },
    closeRoundHistory: () => {
      // No-op for online
    },
    startNewGame: () => {
      // In online mode, "new game" returns to lobby
      online.inGame = false;
      online.gameOver = false;
      navigate("online-lobby");
    },
  };

  const helpers: GameHelpers = {
    isYourTurn: onlineIsYourTurn,
    hasPower: onlineHasPower,
    canPass: onlineCanPass,
    getPlayerName: getOnlinePlayerName,
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
