/**
 * WebSocket client for multiplayer connection
 *
 * Manages WebSocket connection to the backend server.
 * Handles connection state, message routing, and reconnection logic.
 */

import type { CardData, TourneyClientState } from "@thirteen/game-logic";

// ── Connection State ──

export enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  ERROR = "error",
}

// ── Message Types ──

export type OutgoingAction =
  | "ping"
  | "tourney/info"
  | "tourney/reconnect"
  | "tourney/claim_seat"
  | "tourney/leave"
  | "tourney/ready"
  | "tourney/add_bot"
  | "tourney/kick_bot"
  | "game/play"
  | "game/pass"
  | "debug/quick_start"
  | "debug/reset";

export type IncomingMessageType =
  | "pong"
  | "tourney/updated"
  | "game/started"
  | "game/updated"
  | "game/over"
  | "error";

export interface OutgoingMessage {
  action: OutgoingAction;
  payload?: Record<string, unknown>;
}

export interface IncomingMessage {
  type: IncomingMessageType;
  payload: Record<string, unknown>;
}

// ── Event Handlers ──

export interface WsEventHandlers {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: string) => void;
  onTourneyUpdated?: (payload: TourneyClientState) => void;
  onGameStarted?: (payload: GameStartedPayload) => void;
  onGameUpdated?: (payload: GameUpdatedPayload) => void;
  onGameOver?: (payload: GameOverPayload) => void;
  onServerError?: (code: string, message: string) => void;
}

export interface GameStartedPayload {
  yourPosition: number;
  yourHand: CardData[];
  currentPlayer: number;
  players: string[];
  passedPlayers?: boolean[];
  handCounts?: number[];
}

export interface GameUpdatedPayload {
  currentPlayer: number;
  lastPlay: {
    combo: number;
    cards: CardData[];
    suited: boolean;
    playedBy: number;
  } | null;
  passedPlayers: boolean[];
  handCounts: number[];
  yourHand: CardData[];
}

export interface GameOverPayload {
  winOrder: number[];
  pointsAwarded: number[];
  leaderboard: Array<{ name: string; score: number }>;
  tourneyComplete: boolean;
  winner: number | null;
}

// ── WebSocket Client ──

class WebSocketClient {
  // Connection state (reactive via Svelte 5 runes when used in .svelte.ts)
  state = $state<ConnectionState>(ConnectionState.DISCONNECTED);

  // Configuration
  private websocketUrl = "";
  private playerId = "";
  private playerName = "Player";

  // WebSocket instance
  private socket: WebSocket | null = null;

  // Reconnection settings
  private reconnectEnabled = true;
  private reconnectDelay = 1000; // ms
  private maxReconnectDelay = 30000; // ms
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Heartbeat
  private pingInterval = 30000; // ms
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  // Event handlers
  private handlers: WsEventHandlers = {};

  // Reconnection state
  private reconnectingSeatPosition: number | null = null;

  // ── Public API ──

  /**
   * Register event handlers
   */
  on(handlers: WsEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * Connect to WebSocket server
   */
  connect(url: string, playerId: string, playerName = "Player", reconnectToSeat?: number): void {
    if (
      this.state === ConnectionState.CONNECTED ||
      this.state === ConnectionState.CONNECTING
    ) {
      console.warn("[ws] Already connected or connecting");
      return;
    }

    this.websocketUrl = url;
    this.playerId = playerId;
    this.playerName = playerName;
    this.reconnectingSeatPosition = reconnectToSeat ?? null;

    this.state = ConnectionState.CONNECTING;

    const fullUrl = `${url}?playerId=${encodeURIComponent(playerId)}&playerName=${encodeURIComponent(playerName)}`;
    console.log("[ws] Connecting to:", fullUrl);

    try {
      this.socket = new WebSocket(fullUrl);
      this.socket.onopen = () => this.onConnectionEstablished();
      this.socket.onclose = () => this.onConnectionClosed();
      this.socket.onerror = (event) => this.onConnectionError(event);
      this.socket.onmessage = (event) => this.handleMessage(event.data);
    } catch (err) {
      this.state = ConnectionState.ERROR;
      this.handlers.onError?.(`Failed to connect: ${err}`);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.reconnectEnabled = false;
    this.clearTimers();

    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close();
    }

    this.state = ConnectionState.DISCONNECTED;
    this.handlers.onDisconnected?.();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Get state as display string
   */
  getStateString(): string {
    switch (this.state) {
      case ConnectionState.DISCONNECTED:
        return "Disconnected";
      case ConnectionState.CONNECTING:
        return "Connecting...";
      case ConnectionState.CONNECTED:
        return "Connected";
      case ConnectionState.RECONNECTING:
        return "Reconnecting...";
      case ConnectionState.ERROR:
        return "Error";
    }
  }

  // ── Game Actions ──

  /**
   * Request tournament info
   */
  requestTourneyInfo(): void {
    this.sendMessage("tourney/info");
  }

  /**
   * Claim a seat in the tournament
   */
  claimSeat(seatPosition?: number): void {
    const payload: Record<string, unknown> = {};
    if (seatPosition !== undefined && seatPosition >= 0) {
      payload.seatPosition = seatPosition;
    }
    this.sendMessage("tourney/claim_seat", payload);
  }

  /**
   * Leave the tournament
   */
  leaveTourney(): void {
    this.sendMessage("tourney/leave");
  }

  /**
   * Mark player as ready
   */
  readyUp(): void {
    this.sendMessage("tourney/ready");
  }

  /**
   * Add bot to a seat
   */
  addBot(seatPosition: number, botProfile?: string): void {
    const payload: Record<string, unknown> = { seatPosition };
    if (botProfile) payload.botProfile = botProfile;
    this.sendMessage("tourney/add_bot", payload);
  }

  /**
   * Kick bot from a seat
   */
  kickBot(seatPosition: number): void {
    this.sendMessage("tourney/kick_bot", { seatPosition });
  }

  /**
   * Play cards
   */
  playCards(cards: CardData[]): void {
    this.sendMessage("game/play", { cards });
  }

  /**
   * Pass turn
   */
  passTurn(): void {
    this.sendMessage("game/pass");
  }

  /**
   * Debug: Quick start with bots
   */
  debugQuickStart(seatPosition = 0): void {
    this.sendMessage("debug/quick_start", { seatPosition });
  }

  /**
   * Debug: Reset tournament
   */
  debugReset(): void {
    this.sendMessage("debug/reset");
  }

  // ── Internal Methods ──

  private sendMessage(action: OutgoingAction, payload: Record<string, unknown> = {}): void {
    if (this.state !== ConnectionState.CONNECTED || !this.socket) {
      console.error("[ws] Cannot send message: not connected");
      return;
    }

    const message: OutgoingMessage = { action, payload };
    const json = JSON.stringify(message);
    this.socket.send(json);
    console.log("[ws] Sent:", action, payload);
  }

  private onConnectionEstablished(): void {
    this.state = ConnectionState.CONNECTED;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;

    console.log("[ws] Connected!");
    this.handlers.onConnected?.();

    // Start heartbeat
    this.startPingTimer();

    // Check if this is a reconnection attempt
    if (this.reconnectingSeatPosition !== null && this.reconnectingSeatPosition >= 0) {
      console.log(`[ws] Attempting to reconnect to seat ${this.reconnectingSeatPosition}`);
      this.sendMessage("tourney/reconnect", { seatPosition: this.reconnectingSeatPosition });
      this.reconnectingSeatPosition = null;
    } else {
      // Request initial tournament info
      this.requestTourneyInfo();
    }
  }

  private onConnectionClosed(): void {
    const wasConnected = this.state === ConnectionState.CONNECTED;

    this.clearTimers();
    this.state = ConnectionState.DISCONNECTED;

    console.log("[ws] Connection closed");
    this.handlers.onDisconnected?.();

    if (wasConnected && this.reconnectEnabled) {
      this.scheduleReconnect();
    }
  }

  private onConnectionError(event: Event): void {
    console.error("[ws] Connection error:", event);
    this.handlers.onError?.("WebSocket connection error");
  }

  private scheduleReconnect(): void {
    if (!this.reconnectEnabled) return;

    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;

    // Exponential backoff
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`[ws] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      if (this.reconnectEnabled && this.state === ConnectionState.RECONNECTING) {
        this.connect(this.websocketUrl, this.playerId, this.playerName);
      }
    }, delay);
  }

  private startPingTimer(): void {
    this.pingTimer = setInterval(() => {
      if (this.state === ConnectionState.CONNECTED) {
        this.sendMessage("ping", { timestamp: Date.now() });
      }
    }, this.pingInterval);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private handleMessage(data: string): void {
    let message: IncomingMessage;
    try {
      message = JSON.parse(data);
    } catch {
      console.error("[ws] Failed to parse message:", data);
      return;
    }

    const { type, payload } = message;
    console.log("[ws] Received:", type, payload);

    switch (type) {
      case "pong":
        // Heartbeat response - no action needed
        break;

      case "tourney/updated":
        this.handlers.onTourneyUpdated?.(payload as unknown as TourneyClientState);
        break;

      case "game/started":
        this.handlers.onGameStarted?.(payload as unknown as GameStartedPayload);
        break;

      case "game/updated":
        this.handlers.onGameUpdated?.(payload as unknown as GameUpdatedPayload);
        break;

      case "game/over":
        this.handlers.onGameOver?.(payload as unknown as GameOverPayload);
        break;

      case "error": {
        const code = (payload.code as string) ?? "UNKNOWN";
        const msg = (payload.message as string) ?? "Unknown error";
        console.error(`[ws] Server error: [${code}] ${msg}`);
        this.handlers.onServerError?.(code, msg);
        break;
      }

      default:
        console.warn("[ws] Unknown message type:", type);
    }
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient();
