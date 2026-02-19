import { TourneyStatus } from "@thirteen/game-logic";
import {
  deleteConnection,
  getConnection,
  getOrCreateTourney,
  setDisconnectedAt,
} from "./lib/dynamo.js";
import type { WebSocketEvent, LambdaResult } from "./lib/types.js";

export async function handler(event: WebSocketEvent): Promise<LambdaResult> {
  const connectionId = event.requestContext.connectionId;

  try {
    const connection = await getConnection(connectionId);
    if (!connection) {
      console.log(`Connection ${connectionId} not found`);
      return { statusCode: 200 };
    }

    const { playerId } = connection;

    await deleteConnection(connectionId);
    console.log(`Connection removed: ${connectionId} for player ${playerId}`);

    await handleTourneyDisconnect(playerId);

    return { statusCode: 200 };
  } catch (err) {
    console.error("Error handling disconnect:", err);
    return { statusCode: 500 };
  }
}

async function handleTourneyDisconnect(playerId: string): Promise<void> {
  try {
    const tourney = await getOrCreateTourney();
    const seat = tourney.getSeatByPlayer(playerId);
    if (!seat) return;

    if (
      tourney.status === TourneyStatus.WAITING ||
      tourney.status === TourneyStatus.STARTING
    ) {
      const disconnectTime = Math.floor(Date.now() / 1000);
      await setDisconnectedAt(seat.position, disconnectTime);
      console.log(
        `Player ${playerId} disconnected from tournament (grace period: 5s)`,
      );
    }
  } catch (err) {
    console.error("Error handling tournament disconnect:", err);
  }
}
