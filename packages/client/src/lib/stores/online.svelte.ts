/**
 * Online game store
 *
 * Manages state for online multiplayer games via WebSocket.
 */

import {
  Card,
  Play,
  type CardData,
  type PlayLogEntry,
  type SeatClientState,
  type TourneyClientState,
} from "@thirteen/game-logic";
import {
  wsClient,
  ConnectionState,
  type GameStartedPayload,
  type GameUpdatedPayload,
  type GameOverPayload,
} from "../ws/index.js";

// Re-export for components that need the types
export type { SeatClientState, TourneyClientState };

// ── Constants ──

const EVENT_RENDER_DELAY_MS = 800;

// ── Session Storage ──

const SESSION_KEY = "thirteen_session";

interface SessionData {
  playerId: string;
  playerName: string;
  seatPosition: number;
  inGame: boolean;
}

function saveSession(data: SessionData): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("[session] Failed to save session:", err);
  }
}

function loadSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  } catch (err) {
    console.warn("[session] Failed to load session:", err);
    return null;
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (err) {
    console.warn("[session] Failed to clear session:", err);
  }
}

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  tourney = $state<TourneyClientState | null>(null);

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
  showRoundHistory = $state<boolean>(false);
  playLog = $state<PlayLogEntry[]>([]);

  /** Bumped on every state update to force Svelte reactivity */
  stateVersion = $state(0);

  // Event queue for delayed rendering
  private updateQueue: GameUpdatedPayload[] = [];
  private isProcessingQueue = false;
  private lastOwnActionTime = 0;
  private lastUpdateTime = 0;
  private readonly OWN_ACTION_WINDOW_MS = 200;

  /**
   * Mark that we just took an action - the next update should render immediately
   */
  markOwnAction(): void {
    this.lastOwnActionTime = Date.now();
  }

  /**
   * Queue a game update for delayed rendering
   */
  queueGameUpdate(payload: GameUpdatedPayload): void {
    this.updateQueue.push(payload);
    this.processQueue();
  }

  /**
   * Process queued updates with delays between them.
   * Ensures minimum 800ms gap between bot moves for visual clarity.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    // Check if first update should render immediately (player's own action)
    const isFirstUpdateOwnAction = this.updateQueue.length > 0 &&
      Date.now() - this.lastOwnActionTime < this.OWN_ACTION_WINDOW_MS;

    let isFirstUpdate = true;

    while (this.updateQueue.length > 0) {
      const payload = this.updateQueue.shift()!;

      // Only skip sleep for the FIRST update if it's the player's own action
      const shouldSkipSleep = isFirstUpdate && isFirstUpdateOwnAction;

      // Ensure minimum delay since last update (unless first update after own action)
      if (!shouldSkipSleep && this.lastUpdateTime > 0) {
        const elapsed = Date.now() - this.lastUpdateTime;
        const waitTime = Math.max(0, EVENT_RENDER_DELAY_MS - elapsed);
        console.log(`[queue] Sleeping for ${waitTime}ms before next update`);
        if (waitTime > 0) {
          await sleep(waitTime);
        }
      } else {
        console.log(`[queue] No sleep (shouldSkipSleep: ${shouldSkipSleep}, firstUpdate: ${this.lastUpdateTime === 0})`);
      }

      console.log("[queue] Applying update...");
      applyGameUpdate(payload);
      this.lastUpdateTime = Date.now();
      console.log("[queue] Update applied, stateVersion now:", online.stateVersion);

      // Yield to allow UI to update after each state change
      await Promise.resolve();
      console.log("[queue] Yielded to UI");

      isFirstUpdate = false;
    }

    console.log("[queue] Queue empty, processing complete");
    this.isProcessingQueue = false;
  }
}

export const online = new OnlineStore();

// ── Game Update Application ──

/**
 * Apply a game update to the store (called from queue processor)
 */
function applyGameUpdate(payload: GameUpdatedPayload): void {
  // Capture previous state for play log tracking
  const prevLastPlay = online.lastPlay;
  const prevPassedPlayers = [...online.passedPlayers];
  const prevHandCounts = [...online.handCounts];

  console.log("[playLog] Update received:", {
    prevCounts: prevHandCounts,
    newCounts: payload.handCounts,
    prevLP: prevLastPlay?.cards.map(c => c.toString()).join(","),
    newLP: payload.lastPlay?.cards.map(c => c.toString()).join(","),
  });

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

  // Track play log changes
  // Case 1: Round reset (lastPlay went from something to null)
  if (prevLastPlay !== null && online.lastPlay === null) {
    console.log("[playLog] Round reset detected");
    online.playLog.push("round_reset");
  }

  // Case 2: New play detected (lastPlay changed and is not null)
  if (online.lastPlay !== null) {
    const playChanged =
      prevLastPlay === null ||
      prevLastPlay.cards.length !== online.lastPlay.cards.length ||
      !prevLastPlay.cards.every(
        (c, i) => c.value === online.lastPlay!.cards[i].value
      );

    if (playChanged) {
      // Infer who played by checking which player's hand decreased
      let playerWhoPlayed = -1;
      const handChanges = [];
      for (let i = 0; i < 4; i++) {
        const change = online.handCounts[i] - prevHandCounts[i];
        handChanges.push(change);
        if (prevHandCounts[i] > online.handCounts[i]) {
          playerWhoPlayed = i;
          break;
        }
      }

      console.log("[playLog] Hand changes:", handChanges, "detected player:", playerWhoPlayed);

      if (playerWhoPlayed >= 0) {
        const play = new Play(
          online.lastPlay.combo,
          online.lastPlay.cards,
          online.lastPlay.suited
        );
        console.log(`[playLog] Play detected: player ${playerWhoPlayed} played ${online.lastPlay.cards.map(c => c.toString()).join(",")}`);
        online.playLog.push({ player: playerWhoPlayed, play });
      } else {
        console.warn("[playLog] Play detected but couldn't infer player. prevCounts:", prevHandCounts, "newCounts:", online.handCounts);
      }
    }
  }

  // Case 3: Pass detected (passedPlayers changed)
  for (let i = 0; i < 4; i++) {
    if (!prevPassedPlayers[i] && payload.passedPlayers[i]) {
      // Player i just passed
      console.log(`[playLog] Pass detected: player ${i} passed`);
      online.playLog.push({ player: i, play: "pass" });
    }
  }

  console.log("[playLog] Current log length:", online.playLog.length);

  // Bump version to trigger reactivity
  online.stateVersion++;

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
}

// ── Initialization ──

let initialized = false;

export function initOnline(): void {
  if (initialized) return;
  initialized = true;

  // Try to restore session first
  const session = loadSession();
  if (session) {
    online.playerId = session.playerId;
    online.playerName = session.playerName;
    console.log("[session] Restored session:", session);
  } else if (!online.playerId) {
    // Generate player ID if not set and no session
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
      online.tourney = payload;
      online.statusMessage = "";

      // Save session if we have a seat
      const mySeat = payload.seats.find((s) => s.playerId === online.playerId);
      if (mySeat) {
        saveSession({
          playerId: online.playerId,
          playerName: online.playerName,
          seatPosition: mySeat.position,
          inGame: online.inGame,
        });
      }
    },

    onGameStarted: (payload: GameStartedPayload) => {
      online.inGame = true;
      online.gameOver = false;
      online.yourPosition = payload.yourPosition;
      online.yourHand = payload.yourHand.map((c) => Card.fromValue(c.value));
      online.currentPlayer = payload.currentPlayer;
      online.lastPlay = null;
      // Use provided values for reconnection, or defaults for new game
      online.passedPlayers = payload.passedPlayers ?? [false, false, false, false];
      online.handCounts = payload.handCounts ?? [13, 13, 13, 13];
      online.selectedCards = new Set();
      online.playLog = [];
      online.showRoundHistory = false;
      online.statusMessage = payload.currentPlayer === payload.yourPosition
        ? "Your turn!"
        : `Player ${payload.currentPlayer + 1}'s turn`;

      // Save session with inGame flag
      saveSession({
        playerId: online.playerId,
        playerName: online.playerName,
        seatPosition: payload.yourPosition,
        inGame: true,
      });
    },

    onGameUpdated: (payload: GameUpdatedPayload) => {
      // Queue updates for delayed rendering (bots play fast, we slow it down)
      online.queueGameUpdate(payload);
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

      // Clear session on certain unrecoverable errors
      if (code === "SEAT_NOT_FOUND" || code === "SEAT_TAKEN") {
        clearSession();
        online.statusMessage = "Session expired or game reset";
      }
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

  // Check if we should attempt reconnection
  const session = loadSession();
  const reconnectToSeat = session?.seatPosition ?? undefined;

  if (reconnectToSeat !== undefined && reconnectToSeat >= 0) {
    console.log(`[online] Reconnecting to seat ${reconnectToSeat}`);
    online.statusMessage = "Reconnecting to your game...";
  }

  wsClient.connect(url, online.playerId, online.playerName, reconnectToSeat);
}

export function disconnectFromServer(): void {
  wsClient.disconnect();
  online.inGame = false;
  online.tourney = null;
  clearSession();
}

export function setPlayerName(name: string): void {
  online.playerName = name;
}

export function claimSeat(position?: number): void {
  wsClient.claimSeat(position);
}

export function leaveTourney(): void {
  wsClient.leaveTourney();
  clearSession();
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

  online.markOwnAction();
  wsClient.playCards(cardData);
  clearSelection();
}

export function passTurn(): void {
  online.markOwnAction();
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

export function toggleRoundHistory(): void {
  online.showRoundHistory = !online.showRoundHistory;
}

export function closeRoundHistory(): void {
  online.showRoundHistory = false;
}

/**
 * Get stored session for reconnection
 */
export function getStoredSession(): SessionData | null {
  return loadSession();
}
