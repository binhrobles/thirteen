import { Card } from "./card.js";
import { Play } from "./play.js";
import { validate, type MoveResult } from "./move-validator.js";
import { findStartingPlayer } from "./deck.js";

export type GameEvent =
  | { type: "turn_changed"; player: number }
  | { type: "round_reset"; player: number }
  | { type: "player_won"; player: number; position: number }
  | { type: "game_over"; winOrder: number[] };

export type PlayLogEntry =
  | { player: number; play: Play }
  | { player: number; play: "pass" }
  | "round_reset";

const NUM_PLAYERS = 4;

export class GameState {
  hands: Card[][];
  lastPlay: Play | null = null;
  lastPlayBy = -1;
  currentPlayer = 0;
  playersInRound = [true, true, true, true];
  playersInGame = [true, true, true, true];
  winOrder: number[] = [];
  playLog: PlayLogEntry[] = [];

  private listeners: ((event: GameEvent) => void)[] = [];

  constructor(dealtHands: Card[][]) {
    this.hands = dealtHands;
    this.currentPlayer = findStartingPlayer(dealtHands);
  }

  on(listener: (event: GameEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: GameEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  canPlay(playerId: number, cards: Card[]): MoveResult {
    if (playerId !== this.currentPlayer) {
      return { valid: false, play: null, error: "Not your turn" };
    }
    if (!this.playersInGame[playerId]) {
      return { valid: false, play: null, error: "You already won" };
    }
    const result = validate(this.lastPlay, cards);
    if (!result.valid) return result;

    // Check that player has these cards
    for (const card of cards) {
      if (!this.hasCard(playerId, card)) {
        return {
          valid: false,
          play: null,
          error: "You don't have that card",
        };
      }
    }
    return result;
  }

  playCards(playerId: number, cards: Card[]): MoveResult {
    const result = this.canPlay(playerId, cards);
    if (!result.valid) return result;

    // Remove cards from hand
    for (const card of cards) {
      const idx = this.hands[playerId].findIndex(
        (c) => c.value === card.value,
      );
      if (idx >= 0) this.hands[playerId].splice(idx, 1);
    }

    // Update game state
    this.lastPlay = result.play;
    this.lastPlayBy = playerId;
    this.playLog.push({ player: playerId, play: result.play! });

    // Check if player won (emptied hand)
    if (this.hands[playerId].length === 0) {
      this.playerWins(playerId);
    } else {
      this.advanceTurn();
      if (this.currentPlayer === this.lastPlayBy) {
        this.resetRound();
      }
    }

    return result;
  }

  passTurn(playerId: number): boolean {
    if (playerId !== this.currentPlayer) return false;
    if (!this.playersInGame[playerId]) return false;
    if (this.lastPlay === null) return false; // Can't pass with power

    this.playersInRound[playerId] = false;
    this.playLog.push({ player: playerId, play: "pass" });

    if (this.checkRoundOver()) {
      this.resetRound();
    } else {
      this.advanceTurn();
      if (this.currentPlayer === this.lastPlayBy) {
        this.resetRound();
      }
    }

    return true;
  }

  private playerWins(playerId: number): void {
    this.playersInGame[playerId] = false;
    this.playersInRound[playerId] = false;
    this.winOrder.push(playerId);

    const position = this.winOrder.length;
    this.emit({ type: "player_won", player: playerId, position });

    // Check if game is over (only 1 player left)
    let remaining = 0;
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (this.playersInGame[i]) remaining++;
    }

    if (remaining === 1) {
      for (let i = 0; i < NUM_PLAYERS; i++) {
        if (this.playersInGame[i]) {
          this.winOrder.push(i);
          break;
        }
      }
      this.emit({ type: "game_over", winOrder: this.winOrder });
    } else {
      if (this.checkRoundOver()) {
        this.resetRound();
      } else {
        this.advanceTurn();
      }
    }
  }

  private checkRoundOver(): boolean {
    for (let i = 0; i < NUM_PLAYERS; i++) {
      if (this.playersInGame[i] && this.playersInRound[i]) return false;
    }
    return true;
  }

  private resetRound(): void {
    this.lastPlay = null;
    this.lastPlayBy = -1;
    for (let i = 0; i < NUM_PLAYERS; i++) {
      this.playersInRound[i] = this.playersInGame[i];
    }
    this.playLog.push("round_reset");
    this.emit({ type: "round_reset", player: this.currentPlayer });
  }

  private advanceTurn(): void {
    const start = this.currentPlayer;
    while (true) {
      this.currentPlayer = (this.currentPlayer + 1) % NUM_PLAYERS;
      if (
        this.playersInGame[this.currentPlayer] &&
        this.playersInRound[this.currentPlayer]
      ) {
        break;
      }
      if (this.currentPlayer === start) {
        this.resetRound();
        return;
      }
    }
    this.emit({ type: "turn_changed", player: this.currentPlayer });
  }

  private hasCard(playerId: number, card: Card): boolean {
    return this.hands[playerId].some((c) => c.value === card.value);
  }

  getHand(playerId: number): Card[] {
    return this.hands[playerId];
  }

  isGameOver(): boolean {
    return this.winOrder.length >= NUM_PLAYERS - 1;
  }

  hasPower(): boolean {
    return this.lastPlay === null;
  }
}
