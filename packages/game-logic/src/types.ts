/** Shared interfaces for serialization (DynamoDB, WebSocket messages) */

export interface CardData {
  rank: number;
  suit: number;
  value: number;
}

export interface PlayData {
  combo: string;
  cards: CardData[];
  suited: boolean;
}

export interface MoveEntry {
  player: number;
  action: "play" | "pass";
  cards?: CardData[];
}

export interface TourneyContext {
  scores: number[];        // tournament score per seat [4]
  targetScore: number;     // e.g. 21
  gameNumber: number;      // current game number (1-indexed)
  expectedTotalGames: number; // estimated total games in tournament
}

export interface GameStateSnapshot {
  hands: CardData[][];
  currentPlayer: number;
  lastPlay: PlayData | null;
  lastPlayBy: number;
  passedPlayers: boolean[];
  winOrder: number[];
  playersInGame: boolean[];
  /** Cards each player has played so far (indexed by absolute player). Optional for backward compat. */
  cardsPlayedByPlayer?: CardData[][];
  /** Combo type counts per player (indexed by absolute player). Maps combo string → count. */
  combosPlayedByPlayer?: Record<string, number>[];
  /** Per-card combo type breakdown: 52×7 flat array, [card0_single, card0_pair, ..., card0_bomb, card1_single, ...]. */
  handComboTypeMap?: number[];
  /** Tournament context for tournament-aware training. Undefined when not in a tournament. */
  tourneyContext?: TourneyContext;
}

export interface GameSnapshot {
  gameNumber: number;
  winOrder: number[];
  pointsAwarded: number[];
}
