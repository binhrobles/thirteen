import { putConnection } from "./lib/dynamo.js";
import type { WebSocketEvent, LambdaResult } from "./lib/types.js";

export async function handler(event: WebSocketEvent): Promise<LambdaResult> {
  const connectionId = event.requestContext.connectionId;
  const queryParams = event.queryStringParameters ?? {};
  const playerId = queryParams.playerId;
  const playerName = queryParams.playerName ?? "Player";

  if (!playerId) {
    return { statusCode: 403, body: JSON.stringify({ error: "playerId required" }) };
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    await putConnection({
      connectionId,
      playerId,
      playerName,
      connectedAt: now,
      lastPing: now,
      ttl: now + 2 * 60 * 60, // 2 hours
    });

    console.log(`Connection established: ${connectionId} for player ${playerId}`);
    return { statusCode: 200, body: JSON.stringify({ message: "Connected" }) };
  } catch (err) {
    console.error("Error storing connection:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Failed to establish connection" }) };
  }
}
