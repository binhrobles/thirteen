import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
} from "aws-lambda";

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

export interface OutgoingMessage {
  type: string;
  payload: Record<string, unknown>;
}
