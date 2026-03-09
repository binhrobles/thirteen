import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
} from "aws-lambda";
import type { Combo, TourneyClientState } from "@thirteen/game-logic";

interface CardPayload { rank: number; suit: number; value: number }

interface LastPlayPayload {
  combo: Combo;
  cards: CardPayload[];
  suited: boolean;
  playedBy: number;
}

export interface LeaderboardEntry {
  position: number;
  playerName: string | null;
  totalScore: number;
  lastGamePoints: number;
  gamesWon: number;
}

export type WebSocketEvent = APIGatewayProxyWebsocketEventV2 & {
  requestContext: APIGatewayProxyWebsocketEventV2["requestContext"] & {
    domainName: string;
    stage: string;
  };
  queryStringParameters?: Record<string, string>;
};

export type LambdaResult = APIGatewayProxyResultV2;

export interface ConnectionRecord {
  connectionId: string;
  playerId: string;
  playerName: string;
  connectedAt: number;
  lastPing: number;
  ttl: number;
}

export interface WebSocketMessage {
  action: string;
  payload: Record<string, unknown>;
}

export type OutgoingMessage =
  | { type: "pong"; payload: { timestamp: number } }
  | { type: "error"; payload: { code: string; message: string } }
  | { type: "tourney/updated"; payload: TourneyClientState }
  | {
      type: "game/started";
      payload: {
        yourPosition: number;
        yourHand: CardPayload[];
        currentPlayer: number;
        players: (string | null | undefined)[];
        passedPlayers?: boolean[];
        handCounts?: number[];
      };
    }
  | {
      type: "game/updated";
      payload: {
        currentPlayer: number;
        lastPlay: LastPlayPayload | null;
        passedPlayers: boolean[];
        handCounts: number[];
        yourHand: CardPayload[];
      };
    }
  | {
      type: "game/over";
      payload: {
        winOrder: number[];
        pointsAwarded: number[];
        leaderboard: LeaderboardEntry[];
        tourneyComplete: boolean;
        winner: number | null;
      };
    }
  | { type: "debug/reset"; payload: { message: string } };
