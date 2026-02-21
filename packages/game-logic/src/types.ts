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

export interface GameStateSnapshot {
  hands: CardData[][];
  currentPlayer: number;
  lastPlay: PlayData | null;
  lastPlayBy: number;
  passedPlayers: boolean[];
  winOrder: number[];
  playersInGame: boolean[];
}

export interface GameSnapshot {
  gameNumber: number;
  winOrder: number[];
  pointsAwarded: number[];
}
