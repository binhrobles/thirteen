import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from "@aws-sdk/client-apigatewaymanagementapi";
import type { GameState, Tourney } from "@thirteen/game-logic";
import { getAllConnectionIds } from "./dynamo.js";
import type { OutgoingMessage } from "./types.js";

let apiClient: ApiGatewayManagementApiClient | null = null;

export function initApiClient(domainName: string, stage: string): void {
  apiClient = new ApiGatewayManagementApiClient({
    endpoint: `https://${domainName}/${stage}`,
  });
}

export async function sendToConnection(
  connectionId: string,
  data: OutgoingMessage,
): Promise<void> {
  if (!apiClient) throw new Error("API client not initialized");
  try {
    await apiClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(data)),
      }),
    );
  } catch (err) {
    if (err instanceof GoneException) {
      console.log(`Connection ${connectionId} is gone`);
    } else {
      console.error(`Error sending to ${connectionId}:`, err);
    }
  }
}

export async function sendError(
  connectionId: string,
  code: string,
  message: string,
): Promise<void> {
  await sendToConnection(connectionId, {
    type: "error",
    payload: { code, message },
  });
}

export async function broadcastTourneyUpdate(tourney: Tourney): Promise<void> {
  const message: OutgoingMessage = {
    type: "tourney/updated",
    payload: tourney.toClientState() as Record<string, unknown>,
  };

  // Gather all connection IDs from seats + connections table
  const connectionIds = new Set<string>();

  for (const seat of tourney.seats) {
    if (seat.isOccupied() && seat.connectionId) {
      connectionIds.add(seat.connectionId);
    }
  }

  try {
    const allConns = await getAllConnectionIds();
    for (const id of allConns) connectionIds.add(id);
  } catch (err) {
    console.error("Error scanning connections:", err);
  }

  await Promise.all(
    [...connectionIds].map((id) => sendToConnection(id, message)),
  );
}

export async function broadcastGameStarted(
  tourney: Tourney,
  game: GameState,
): Promise<void> {
  const promises: Promise<void>[] = [];

  for (let i = 0; i < tourney.seats.length; i++) {
    const seat = tourney.seats[i];
    if (seat.isOccupied() && seat.connectionId) {
      const hand = game.getHand(i);
      promises.push(
        sendToConnection(seat.connectionId, {
          type: "game/started",
          payload: {
            yourPosition: i,
            yourHand: hand.map((c) => ({
              rank: c.rank,
              suit: c.suit,
              value: c.value,
            })),
            currentPlayer: game.currentPlayer,
            players: tourney.seats.map((s) => s.playerName),
          },
        }),
      );
    }
  }

  await Promise.all(promises);
}

export async function broadcastGameUpdate(
  tourney: Tourney,
  game: GameState,
): Promise<void> {
  const promises: Promise<void>[] = [];

  for (let i = 0; i < tourney.seats.length; i++) {
    const seat = tourney.seats[i];
    if (seat.isOccupied() && seat.connectionId) {
      const hand = game.getHand(i);
      promises.push(
        sendToConnection(seat.connectionId, {
          type: "game/updated",
          payload: {
            currentPlayer: game.currentPlayer,
            lastPlay: game.lastPlay
              ? {
                  combo: game.lastPlay.combo,
                  cards: game.lastPlay.cards.map((c) => ({
                    rank: c.rank,
                    suit: c.suit,
                    value: c.value,
                  })),
                  suited: game.lastPlay.suited,
                }
              : null,
            passedPlayers: game.playersInRound.map((inRound) => !inRound),
            handCounts: game.hands.map((h) => h.length),
            yourHand: hand.map((c) => ({
              rank: c.rank,
              suit: c.suit,
              value: c.value,
            })),
          },
        }),
      );
    }
  }

  await Promise.all(promises);
}

export async function broadcastGameOver(
  tourney: Tourney,
  winOrder: number[],
  tourneyComplete: boolean,
): Promise<void> {
  const leaderboard = tourney.getLeaderboard();
  const pointsAwarded = [4, 2, 1, 0];

  let winner: number | null = null;
  if (tourneyComplete) {
    let maxScore = -1;
    for (let i = 0; i < tourney.seats.length; i++) {
      if (tourney.seats[i].score > maxScore) {
        maxScore = tourney.seats[i].score;
        winner = i;
      }
    }
  }

  const message: OutgoingMessage = {
    type: "game/over",
    payload: {
      winOrder,
      pointsAwarded,
      leaderboard,
      tourneyComplete,
      winner,
    },
  };

  const promises: Promise<void>[] = [];
  for (const seat of tourney.seats) {
    if (seat.isOccupied() && seat.connectionId) {
      promises.push(sendToConnection(seat.connectionId, message));
    }
  }

  await Promise.all(promises);
}
