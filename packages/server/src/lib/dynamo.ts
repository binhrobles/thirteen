import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, UpdateCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Tourney } from "@thirteen/game-logic";
import type { ConnectionRecord } from "./types.js";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE!;
const TOURNEY_TABLE = process.env.TOURNEY_TABLE!;

// ── Connections ──

export async function putConnection(record: ConnectionRecord): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: CONNECTIONS_TABLE, Item: record }),
  );
}

export async function getConnection(
  connectionId: string,
): Promise<ConnectionRecord | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    }),
  );
  return (result.Item as ConnectionRecord) ?? null;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
    }),
  );
}

export async function updateConnectionPing(
  connectionId: string,
  timestamp: number,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId },
      UpdateExpression: "SET lastPing = :now",
      ExpressionAttributeValues: { ":now": timestamp },
    }),
  );
}

export async function getAllConnectionIds(): Promise<string[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: CONNECTIONS_TABLE,
      ProjectionExpression: "connectionId",
    }),
  );
  return (result.Items ?? [])
    .map((item) => item.connectionId as string)
    .filter(Boolean);
}

// ── Tourney ──

export async function getOrCreateTourney(): Promise<Tourney> {
  const result = await docClient.send(
    new GetCommand({
      TableName: TOURNEY_TABLE,
      Key: { tourneyId: Tourney.GLOBAL_ID },
    }),
  );

  if (result.Item) {
    return Tourney.fromDynamo(result.Item as Record<string, unknown>);
  }

  const tourney = new Tourney();
  await saveTourney(tourney);
  return tourney;
}

export async function saveTourney(tourney: Tourney): Promise<void> {
  await docClient.send(
    new PutCommand({ TableName: TOURNEY_TABLE, Item: tourney.toDynamo() }),
  );
}

export async function setDisconnectedAt(
  seatPosition: number,
  timestamp: number,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: TOURNEY_TABLE,
      Key: { tourneyId: Tourney.GLOBAL_ID },
      UpdateExpression: `SET seats[${seatPosition}].disconnectedAt = :t`,
      ExpressionAttributeValues: { ":t": timestamp },
    }),
  );
}
