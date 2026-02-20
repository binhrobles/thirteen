/**
 * Online game store
 *
 * Manages state for online multiplayer games via WebSocket.
 */

import { Card, type CardData } from "@thirteen/game-logic";
import {
  wsClient,
  ConnectionState,
  type GameStartedPayload,
  type GameUpdatedPayload,
  type GameOverPayload,
} from "../ws/index.js";

// ── Tourney Types ──

export interface Seat {
  position: number;
  playerId: string | null;
  playerName: string | null;
  isBot: boolean;
  isReady: boolean;
  score: number;
}

export interface TourneyState {
  status: "waiting" | "in_progress" | "complete";
  seats: Seat[];
  targetScore: number;
  gamesPlayed: number;
}

// ── Store ──

class OnlineStore {
  // Connection
  connectionState = $state<ConnectionState>(ConnectionState.DISCONNECTED);

  // Player identity
  playerId = $state<string>("");
  playerName = $state<string>("Player");
  yourPosition = $state<number>(-1);

  // Tourney state
  tourney = $state<TourneyState | null>(null);

  // Game state
  inGame = $state<boolean>(false);
  yourHand = $state<Card[]>([]);
  currentPlayer = $state<number>(-1);
  lastPlay = $state<{
    combo: number;
    cards: Card[];
    suited: boolean;
  } | null>(null);
  passedPlayers = $state<boolean[]>([false, false, false, false]);
  handCounts = $state<number[]>([13, 13, 13, 13]);
  selectedCards = $state<Set<number>>(new Set());

  // Game over
  gameOver = $state<boolean>(false);
  winOrder = $state<number[]>([]);
  pointsAwarded = $state<number[]>([]);
  tourneyComplete = $state<boolean>(false);
  tourneyWinner = $state<number | null>(null);

  // UI state
  statusMessage = $state<string>("");
  errorMessage = $state<string>("");
}

export const online = new OnlineStore();

// ── Initialization ──

let initialized = false;

export function initOnline(): void {
  if (initialized) return;
  initialized = true;

  // Generate player ID if not set
  if (!online.playerId) {
    online.playerId = `player-${Math.random().toString(36).slice(2, 10)}`;
  }

  // Wire up WebSocket event handlers
  wsClient.on({
    onConnected: () => {
      online.connectionState = ConnectionState.CONNECTED;
      online.statusMessage = "Connected to server";
      online.errorMessage = "";
    },

    onDisconnected: () => {
      online.connectionState = wsClient.state;
      online.statusMessage = "Disconnected";
    },

    onError: (error) => {
      online.connectionState = ConnectionState.ERROR;
      online.errorMessage = error;
    },

    onTourneyUpdated: (payload) => {
      online.tourney = payload as unknown as TourneyState;
      online.statusMessage = "";
    },

    onGameStarted: (payload: GameStartedPayload) => {
      online.inGame = true;
      online.gameOver = false;
      online.yourPosition = payload.yourPosition;
      online.yourHand = payload.yourHand.map((c) => Card.fromValue(c.value));
      online.currentPlayer = payload.currentPlayer;
      online.lastPlay = null;
      online.passedPlayers = [false, false, false, false];
      online.handCounts = [13, 13, 13, 13];
      online.selectedCards = new Set();
      online.statusMessage = payload.currentPlayer === payload.yourPosition
        ? "Your turn!"
        : `Player ${payload.currentPlayer + 1}'s turn`;
    },

    onGameUpdated: (payload: GameUpdatedPayload) => {
      online.yourHand = payload.yourHand.map((c) => Card.fromValue(c.value));
      online.currentPlayer = payload.currentPlayer;
      online.passedPlayers = payload.passedPlayers;
      online.handCounts = payload.handCounts;

      if (payload.lastPlay) {
        online.lastPlay = {
          combo: payload.lastPlay.combo,
          cards: payload.lastPlay.cards.map((c) => Card.fromValue(c.value)),
          suited: payload.lastPlay.suited,
        };
      } else {
        online.lastPlay = null;
      }

      // Remove any selected cards that are no longer in hand
      const handValues = new Set(online.yourHand.map((c) => c.value));
      const newSelected = new Set<number>();
      for (const v of online.selectedCards) {
        if (handValues.has(v)) newSelected.add(v);
      }
      online.selectedCards = newSelected;

      online.statusMessage = payload.currentPlayer === online.yourPosition
        ? "Your turn!"
        : `Player ${payload.currentPlayer + 1}'s turn`;
    },

    onGameOver: (payload: GameOverPayload) => {
      online.gameOver = true;
      online.winOrder = payload.winOrder;
      online.pointsAwarded = payload.pointsAwarded;
      online.tourneyComplete = payload.tourneyComplete;
      online.tourneyWinner = payload.winner;

      if (payload.tourneyComplete) {
        online.statusMessage = `Tournament complete! Winner: Player ${(payload.winner ?? 0) + 1}`;
      } else {
        online.statusMessage = "Game over!";
      }
    },

    onServerError: (code, message) => {
      online.errorMessage = `[${code}] ${message}`;
    },
  });

  // Sync connection state
  $effect.root(() => {
    $effect(() => {
      online.connectionState = wsClient.state;
    });
  });
}

// ── Actions ──

export function connectToServer(url: string): void {
  initOnline();
  wsClient.connect(url, online.playerId, online.playerName);
}

export function disconnectFromServer(): void {
  wsClient.disconnect();
  online.inGame = false;
  online.tourney = null;
}

export function setPlayerName(name: string): void {
  online.playerName = name;
}

export function claimSeat(position?: number): void {
  wsClient.claimSeat(position);
}

export function leaveTourney(): void {
  wsClient.leaveTourney();
}

export function readyUp(): void {
  wsClient.readyUp();
}

export function addBot(position: number): void {
  wsClient.addBot(position);
}

export function kickBot(position: number): void {
  wsClient.kickBot(position);
}

export function toggleCard(cardValue: number): void {
  const next = new Set(online.selectedCards);
  if (next.has(cardValue)) next.delete(cardValue);
  else next.add(cardValue);
  online.selectedCards = next;
}

export function clearSelection(): void {
  online.selectedCards = new Set();
}

export function playSelectedCards(): void {
  const cards = online.yourHand.filter((c) => online.selectedCards.has(c.value));
  if (cards.length === 0) return;

  const cardData: CardData[] = cards.map((c) => ({
    rank: c.rank,
    suit: c.suit,
    value: c.value,
  }));

  wsClient.playCards(cardData);
  clearSelection();
}

export function passTurn(): void {
  wsClient.passTurn();
}

export function debugQuickStart(seat = 0): void {
  wsClient.debugQuickStart(seat);
}

export function debugReset(): void {
  wsClient.debugReset();
}

// ── Helpers ──

export function isYourTurn(): boolean {
  return online.inGame && online.currentPlayer === online.yourPosition;
}

export function hasPower(): boolean {
  return online.lastPlay === null;
}

export function canPass(): boolean {
  return isYourTurn() && !hasPower();
}
