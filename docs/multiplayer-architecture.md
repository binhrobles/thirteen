# Multiplayer Architecture

Online multiplayer for Tiến Lên (Thirteen) using AWS serverless infrastructure (Lambda + WebSocket API Gateway + DynamoDB).

## Tournament Model

- **4-player tournaments** with seat-based lobbying
- Play multiple games with same group
- **Scoring:** 4/2/1/0 points for 1st/2nd/3rd/4th place
- **Between games:** Show leaderboard, all players must ready up
- **Tournament ends:** First to 21 points
- **MVP:** Single global tournament (future: multiple concurrent tournaments)

## Architecture Diagram

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│    Web      │◄──────────────────►│  API Gateway     │
│   Client    │      (WSS)         │   (WebSocket)    │
└─────────────┘                    └────────┬─────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │ Lambda Functions│
                                   │  - $connect     │
                                   │  - $disconnect  │
                                   │  - $default     │
                                   │  - actions/*    │
                                   └────────┬────────┘
                                            │
                      ┌─────────────────────┴─────────────────────┐
                      ▼                                           ▼
              ┌──────────────┐                            ┌──────────────┐
              │  DynamoDB    │                            │  DynamoDB    │
              │ Connections  │                            │   Tourney    │
              └──────────────┘                            │  (singleton) │
                                                          └──────────────┘
```

## Core Components

### WebSocket API Gateway
- Persistent bidirectional communication (WSS)
- Routes: `$connect`, `$disconnect`, `$default`, custom actions
- Connection management via unique `connectionId` stored in DynamoDB
- Heartbeat pings every 30 seconds (2-hour connection TTL)

### Lambda Functions

**Connection Handler (`$connect`):**
- Validates auth token, stores connection in DynamoDB, associates with player ID

**Disconnection Handler (`$disconnect`):**
- Removes connection, marks player as disconnected, starts 60s reconnection timeout
- Before first game: frees seat | During tournament: replaces with bot

**Message Router (`$default`):**
- Routes messages to action handlers, validates format, handles errors

**Action Handlers:**
- `tourney/claim_seat`, `tourney/leave`, `tourney/ready`, `tourney/reset`
- `game/play`, `game/pass`, `ping`

### DynamoDB Tables

**Connections:** Tracks active WebSocket connections (connectionId → playerId mapping)

**Tourney (Singleton):** Single global tournament state with seats, scores, game history, current game state

## Message Flow

1. **Server is source of truth** - Client sends intents, server validates and broadcasts
2. **Optimistic UI** - Client updates immediately, rollbacks on rejection
3. **Delta updates** - Only changed state transmitted
4. **WebSocket guarantees ordering** per connection

## Detailed Documentation

- **[API Reference](multiplayer/api-reference.md)** - WebSocket message formats (read when implementing actions)
- **[Database Schema](multiplayer/database-schema.md)** - DynamoDB table structures (read when querying data)
- **[Tournament Lifecycle](multiplayer/tournament-lifecycle.md)** - State machine and transitions (read for lobby logic)
- **[Error Handling](multiplayer/error-handling.md)** - Reconnection and error strategies (read for debugging)
- **[Operations](multiplayer/operations.md)** - Deployment, monitoring, testing (read for DevOps work)

## References

- [AWS API Gateway WebSocket](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html)
- [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
