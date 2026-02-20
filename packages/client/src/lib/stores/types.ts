/**
 * Unified game types for adapter pattern
 *
 * These types allow local and online game modes to share the same UI components.
 */

import type { Card, Play, PlayLogEntry } from "@thirteen/game-logic";

// ── Unified Game State ──

export interface UnifiedGameState {
  // Core game state
  playerHand: Card[];
  currentPlayer: number;
  lastPlay: { combo: number; cards: Card[]; suited: boolean } | null;
  passedPlayers: boolean[];
  handCounts: number[];
  isGameOver: boolean;
  winOrder: number[];

  // UI state
  selectedCards: Set<number>;
  statusMessage: string;
  isStatusError: boolean;
  isThinking: boolean;
  showRoundHistory: boolean;
  playLog: PlayLogEntry[];

  // Context
  yourPosition: number;
  mode: "local" | "online";

  // Tournament (online only)
  tournament?: TournamentState;
}

export interface TournamentState {
  pointsAwarded: number[];
  tourneyComplete: boolean;
  tourneyWinner: number | null;
  seats: TourneySeat[];
}

export interface TourneySeat {
  position: number;
  playerName: string | null;
  isBot: boolean;
}

// ── Game Actions ──

export interface GameActions {
  playCards(): void;
  pass(): void;
  toggleCard(cardValue: number): void;
  clearSelection(): void;
  toggleRoundHistory(): void;
  closeRoundHistory(): void;
  startNewGame(): void;
}

// ── Game Helpers ──

export interface GameHelpers {
  isYourTurn(): boolean;
  hasPower(): boolean;
  canPass(): boolean;
  getPlayerName(position: number): string;
}

// ── Game State View (for Pixi rendering) ──

/**
 * Interface that GameApp actually needs from game state.
 * This is a subset of GameState that both adapters can provide.
 */
export interface GameStateView {
  getHand(player: number): Card[];
  playersInRound: boolean[];
  currentPlayer: number;
  lastPlay: Play | null;
  isGameOver(): boolean;
}

// ── Unified Game Context ──

export interface UnifiedGameContext {
  readonly state: UnifiedGameState;
  readonly actions: GameActions;
  readonly helpers: GameHelpers;
  readonly stateView: GameStateView;
}
