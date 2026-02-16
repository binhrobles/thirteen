# Multiplayer Architecture Design

**Status:** Draft
**Created:** 2026-02-16
**Owner:** Architecture Team

## Overview

This document describes the architecture for online multiplayer in Tiến Lên (Thirteen), enabling 4-player real-time gameplay over the internet using AWS serverless infrastructure.

## Architecture Diagram

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│   Godot     │◄──────────────────►│  API Gateway     │
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
                      ┌─────────────────────┼─────────────────────┐
                      ▼                     ▼                     ▼
              ┌──────────────┐      ┌──────────────┐     ┌──────────────┐
              │  DynamoDB    │      │  DynamoDB    │     │  DynamoDB    │
              │ Connections  │      │   Lobbies    │     │    Games     │
              └──────────────┘      └──────────────┘     └──────────────┘
```

## Core Components

### 1. WebSocket API Gateway

**Purpose:** Persistent bidirectional communication between clients and backend

**Configuration:**
- Protocol: WSS (WebSocket Secure)
- Routes:
  - `$connect` → Connection handler Lambda
  - `$disconnect` → Disconnection handler Lambda
  - `$default` → Message router Lambda
  - Custom routes for specific actions

**Connection Management:**
- Each connection gets a unique `connectionId`
- Connections stored in DynamoDB with TTL (2 hours)
- Heartbeat pings every 30 seconds to keep connection alive

### 2. Lambda Functions

#### Connection Handler (`$connect`)
```javascript
// Input: connection request with query params (auth token, player ID)
// Output: accept/reject connection
{
  headers: {
    Authorization: "Bearer <token>"
  },
  queryStringParameters: {
    playerId: "uuid-v4"
  }
}
```

**Responsibilities:**
- Validate auth token
- Store connection in Connections table
- Associate connection with player ID
- Return 200 (accept) or 403 (reject)

#### Disconnection Handler (`$disconnect`)
```javascript
// Triggered automatically when connection closes
```

**Responsibilities:**
- Remove connection from Connections table
- Update lobby/game state (mark player as disconnected)
- Notify other players in same lobby/game
- Start reconnection timeout (60 seconds)

#### Message Router (`$default`)
```javascript
// Input: WebSocket message with action and payload
{
  action: "lobby/create" | "lobby/join" | "game/play" | ...,
  payload: { ... }
}
```

**Responsibilities:**
- Route messages to appropriate action handlers
- Validate message format
- Handle errors gracefully

#### Action Handlers
- `lobby/create` - Create new lobby
- `lobby/join` - Join existing lobby
- `lobby/leave` - Leave lobby
- `lobby/start` - Start game from lobby
- `game/play` - Play cards
- `game/pass` - Pass turn
- `ping` - Heartbeat keepalive

### 3. DynamoDB Tables

#### Connections Table
```javascript
{
  connectionId: "string (PK)",
  playerId: "string (GSI)",
  connectedAt: "number",
  ttl: "number (2 hours)",
  lastPing: "number"
}
```

#### Lobbies Table
```javascript
{
  lobbyId: "string (PK, uuid-v4)",
  ownerId: "string",
  status: "waiting | starting | in_progress | completed",
  seats: [
    { position: 0, playerId: "uuid", playerName: "...", ready: false },
    { position: 1, playerId: null, playerName: null, ready: false },
    { position: 2, playerId: null, playerName: null, ready: false },
    { position: 3, playerId: null, playerName: null, ready: false }
  ],
  createdAt: "number",
  updatedAt: "number",
  ttl: "number (24 hours)"
}
```

#### Games Table
```javascript
{
  gameId: "string (PK, same as lobbyId)",
  lobbyId: "string",
  status: "in_progress | completed",
  players: ["playerId1", "playerId2", "playerId3", "playerId4"],
  gameState: {
    // Serialized game state (hands, current player, last play, etc.)
    currentPlayer: 0,
    hands: [[...cards], [...cards], [...cards], [...cards]],
    lastPlay: { playerId: 0, cards: [...], combo: "..." },
    passedPlayers: [false, false, false, false],
    winOrder: [],
    // ... (same structure as current GameState class)
  },
  moveHistory: [
    { playerId: 0, action: "play", cards: [...], timestamp: "..." },
    { playerId: 1, action: "pass", timestamp: "..." }
  ],
  createdAt: "number",
  updatedAt: "number",
  ttl: "number (7 days)"
}
```

## WebSocket Message Formats

### Client → Server Messages

#### Create Lobby
```javascript
{
  action: "lobby/create",
  payload: {
    playerName: "Player 1"
  }
}
```

#### Join Lobby
```javascript
{
  action: "lobby/join",
  payload: {
    lobbyId: "uuid-v4",
    playerName: "Player 2",
    seatPosition: 1  // optional, null = any available seat
  }
}
```

#### Leave Lobby
```javascript
{
  action: "lobby/leave",
  payload: {
    lobbyId: "uuid-v4"
  }
}
```

#### Start Game
```javascript
{
  action: "lobby/start",
  payload: {
    lobbyId: "uuid-v4"
  }
}
```

#### Play Cards
```javascript
{
  action: "game/play",
  payload: {
    gameId: "uuid-v4",
    cards: [
      { rank: 3, suit: 0, value: 0 },
      { rank: 3, suit: 1, value: 1 }
    ]
  }
}
```

#### Pass Turn
```javascript
{
  action: "game/pass",
  payload: {
    gameId: "uuid-v4"
  }
}
```

#### Heartbeat
```javascript
{
  action: "ping",
  payload: {
    timestamp: 1234567890
  }
}
```

### Server → Client Messages

#### Lobby Created
```javascript
{
  type: "lobby/created",
  payload: {
    lobbyId: "uuid-v4",
    lobby: { /* lobby object */ }
  }
}
```

#### Lobby Updated
```javascript
{
  type: "lobby/updated",
  payload: {
    lobbyId: "uuid-v4",
    lobby: { /* lobby object */ }
  }
}
```

#### Game Started
```javascript
{
  type: "game/started",
  payload: {
    gameId: "uuid-v4",
    yourPosition: 0,
    yourHand: [{ rank: 3, suit: 0, value: 0 }, ...],
    currentPlayer: 2,
    players: ["Player 1", "Player 2", "Player 3", "Player 4"]
  }
}
```

#### Game State Update
```javascript
{
  type: "game/updated",
  payload: {
    gameId: "uuid-v4",
    currentPlayer: 1,
    lastPlay: {
      playerId: 0,
      cards: [{ rank: 3, suit: 0, value: 0 }],
      combo: "single"
    },
    passedPlayers: [false, true, false, false],
    // Only send opponent hand counts, not actual cards
    handCounts: [12, 11, 13, 10]
  }
}
```

#### Player Moved
```javascript
{
  type: "game/move",
  payload: {
    gameId: "uuid-v4",
    playerId: 0,
    action: "play" | "pass",
    cards: [{ rank: 3, suit: 0, value: 0 }, ...], // only if action = play
    yourHand: [{ rank: 3, suit: 1, value: 1 }, ...] // only for the player who moved
  }
}
```

#### Game Over
```javascript
{
  type: "game/over",
  payload: {
    gameId: "uuid-v4",
    winOrder: [0, 2, 1, 3]
  }
}
```

#### Error
```javascript
{
  type: "error",
  payload: {
    code: "INVALID_MOVE" | "NOT_YOUR_TURN" | "LOBBY_FULL" | ...,
    message: "Human-readable error message"
  }
}
```

#### Pong
```javascript
{
  type: "pong",
  payload: {
    timestamp: 1234567890
  }
}
```

## Game State Synchronization Protocol

### Principles
1. **Server is source of truth** - Client sends intents, server validates and broadcasts results
2. **Optimistic UI updates** - Client can update UI immediately, rollback on server rejection
3. **Delta updates** - Only send changed state, not full game state every time
4. **Ordered delivery** - WebSocket guarantees message ordering per connection
5. **Version/sequence numbers** - Detect and recover from missed messages

### Synchronization Flow

```
Player 1 (Client)          Server                  Other Players
      │                      │                            │
      │──Play Cards──────────►│                            │
      │   (optimistic UI)     │                            │
      │                       │──Validate Move             │
      │                       │                            │
      │                       │──Update Game State         │
      │                       │                            │
      │◄─Move Confirmed───────│                            │
      │   (with updated hand) │                            │
      │                       │                            │
      │                       │────Game Updated───────────►│
      │                       │   (last play, hand counts) │
      │                       │                            │
      │                       │◄──Next Player Move─────────│
      │                       │                            │
      │◄──Game Updated────────│                            │
      │                       │                            │
```

### Conflict Resolution
- **Concurrent moves:** Server processes in order received, second move rejected with `NOT_YOUR_TURN`
- **Stale state:** Client includes sequence number with moves, server rejects if out of sync
- **Recovery:** Client can request full state with `game/sync` action

## Lobby Lifecycle

### States
1. **waiting** - Players joining, not all seats filled
2. **starting** - All seats filled, countdown before game starts (5 seconds)
3. **in_progress** - Game is active
4. **completed** - Game finished

### State Transitions

```
    ┌──────────┐
    │  waiting │◄───────────┐
    └────┬─────┘            │
         │                  │
         │ (4 players)      │ (player leaves)
         ▼                  │
    ┌──────────┐            │
    │ starting │────────────┘
    └────┬─────┘
         │
         │ (countdown ends)
         ▼
    ┌──────────────┐
    │ in_progress  │
    └────┬─────────┘
         │
         │ (game over)
         ▼
    ┌──────────┐
    │ completed│
    └──────────┘
```

### Actions by State

**waiting:**
- ✅ Join lobby
- ✅ Leave lobby
- ❌ Start game (need 4 players)

**starting:**
- ❌ Join lobby (full)
- ✅ Leave lobby (cancels countdown)
- ⏳ Waiting for countdown

**in_progress:**
- ❌ Join lobby
- ⚠️ Leave lobby (disconnect handling)
- 🎮 Play game

**completed:**
- ❌ All actions disabled
- 🗑️ Cleanup after TTL

## Error Handling & Reconnection

### Client-Side Error Handling

#### Connection Errors
```javascript
// Network failure, server down, etc.
{
  type: "connection_error",
  retry: true,
  retryAfter: 5000  // ms
}
```

**Strategy:** Exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)

#### Message Errors
```javascript
// Invalid move, not your turn, etc.
{
  type: "error",
  payload: {
    code: "INVALID_MOVE",
    message: "Cannot beat last play"
  }
}
```

**Strategy:** Display error to user, rollback optimistic UI

### Server-Side Error Handling

#### Validation Errors
- Return error message to client
- Don't update game state
- Log for debugging

#### Internal Errors
- Return generic error to client
- Log full error with context
- Alert on repeated failures

### Reconnection Strategy

#### Client Behavior
1. Detect disconnect (no pong response after 3 pings)
2. Show "Reconnecting..." UI
3. Attempt reconnection with exponential backoff
4. On reconnect, send `game/sync` to get current state
5. Resume gameplay

#### Server Behavior
1. On disconnect, keep game state for 60 seconds
2. Mark player as "disconnected" in lobby/game
3. Notify other players: "Player X disconnected"
4. If player reconnects within 60s:
   - Restore connection
   - Send current game state
   - Notify others: "Player X reconnected"
5. If timeout expires:
   - In lobby: Remove player, free seat
   - In game: Replace with bot OR forfeit (TBD)

### Reconnection Window
- **Lobby:** 60 seconds → then remove from lobby
- **Game:** 60 seconds → then replace with bot or forfeit

## Player Authentication & Identity

### MVP: Anonymous Players
- Client generates UUID v4 on first launch
- Stored in browser localStorage
- Sent with connection request
- Optional display name (default: "Player {N}")

### Future: Social Login
- Google Sign-In
- Apple Sign-In
- Email/password (Firebase Auth or Cognito)

### Session Management

#### Token Generation
```javascript
// For MVP: Simple JWT with player ID
{
  playerId: "uuid-v4",
  playerName: "Player 1",
  iat: 1234567890,
  exp: 1234567890 + 86400  // 24 hours
}
```

#### Token Validation
- Lambda authorizer on `$connect`
- Verify signature (secret stored in Secrets Manager)
- Check expiration
- Return policy document (allow/deny)

### Security Considerations
1. **Rate limiting:** Max 100 messages/minute per connection
2. **Message size limits:** Max 32 KB per message
3. **Abuse prevention:** IP-based throttling on connection attempts
4. **Data validation:** Strict schema validation on all inputs
5. **Secrets:** Auth secrets in AWS Secrets Manager, rotated monthly

## Performance & Scalability

### Expected Load (MVP)
- 100 concurrent games = 400 concurrent players
- ~10 messages/minute per player = 4000 messages/minute
- Well within Lambda and API Gateway limits

### Scaling Strategy
- API Gateway: 10,000 concurrent connections (adjustable)
- Lambda: Concurrent executions auto-scale
- DynamoDB: On-demand pricing, auto-scales
- No single point of failure (serverless)

### Cost Estimation (MVP)
- API Gateway: $1/million messages + $0.25/million minutes
- Lambda: $0.20/million requests + $0.0000166667/GB-second
- DynamoDB: $1.25/million writes, $0.25/million reads
- **Total:** ~$50/month for 1000 games/day

## Deployment & Infrastructure

### Infrastructure as Code
Use **AWS CDK** (TypeScript) for infrastructure definition

**Stacks:**
1. **NetworkStack** - VPC, subnets (if needed for future)
2. **DatabaseStack** - DynamoDB tables with indexes
3. **ApiStack** - API Gateway WebSocket API
4. **LambdaStack** - Lambda functions, IAM roles
5. **MonitoringStack** - CloudWatch dashboards, alarms

### Environments
- **dev** - Development testing
- **staging** - Pre-production testing
- **prod** - Production

### CI/CD Pipeline
1. GitHub Actions on push to `main`
2. Run tests (unit + integration)
3. Build Lambda packages
4. Deploy to `dev` environment
5. Run E2E tests
6. Manual approval gate
7. Deploy to `prod` environment

### Monitoring & Observability
- **CloudWatch Logs:** All Lambda function logs
- **CloudWatch Metrics:** Custom metrics for game events
- **X-Ray:** Distributed tracing for debugging
- **Alarms:** Error rate, latency, concurrent connections

## Testing Strategy

### Unit Tests
- Lambda function handlers
- Game state validation logic
- Message parsing/serialization

### Integration Tests
- WebSocket connection flow
- Lobby creation/join/leave
- Game play flow (simulated 4 players)

### E2E Tests
- Godot client → API Gateway → Lambda → DynamoDB
- Full game from lobby creation to game over
- Reconnection scenarios

### Load Testing
- Artillery.io or similar
- Simulate 100+ concurrent games
- Measure latency, error rates

## Migration Path

### Phase 1: Local Multiplayer (Current)
- Single device, 1 human + 3 bots
- No networking

### Phase 2: Online Multiplayer (This Design)
- AWS backend, 4 human players
- Remove bot dependency for multiplayer mode

### Phase 3: Hybrid Mode
- Support both local (bots) and online (humans) in same game
- Bot fills empty seats in lobbies

### Phase 4: Advanced Features
- Tournament mode (separate epic)
- RL-trained bots (separate epic)
- Spectator mode
- Replay system

## Open Questions & Decisions

### 1. Bot Replacement on Disconnect
**Question:** When a player disconnects mid-game, replace with bot or forfeit?

**Options:**
- A) Replace with bot → game continues smoothly
- B) Forfeit → simpler, but ruins game for others
- C) Pause and wait → annoying for other players

**Recommendation:** Option A (replace with bot after 60s timeout)

### 2. Lobby Visibility
**Question:** Should lobbies be publicly discoverable or invite-only?

**Options:**
- A) Public lobby list → easier to find games
- B) Invite-only → more private, need invite links
- C) Both → public + private lobbies

**Recommendation:** Option C for flexibility

### 3. Game State Storage
**Question:** Store full game history or just current state?

**Options:**
- A) Full history → replay, debugging, but more storage
- B) Current state only → cheaper, but can't replay
- C) Hybrid (recent history) → balance

**Recommendation:** Option C (keep last 100 moves for debugging, purge after game ends)

### 4. Anti-Cheat
**Question:** How to prevent cheating (seeing opponent hands, etc.)?

**Measures:**
- Server-side validation (never trust client)
- Only send player's own hand, not opponents
- Rate limiting to prevent flooding
- Future: Detect suspicious patterns (ML-based)

### 5. Cross-Platform Play
**Question:** Support desktop + mobile in same game?

**Answer:** Yes, WebSocket works everywhere. Just need responsive UI.

## Next Steps

1. ✅ Complete this architecture document
2. ⬜ Review and get approval
3. ⬜ Set up AWS infrastructure (CDK)
4. ⬜ Implement Lambda functions
5. ⬜ Build Godot WebSocket client
6. ⬜ Integration testing
7. ⬜ Deploy to staging
8. ⬜ User acceptance testing
9. ⬜ Deploy to production

## References

- AWS API Gateway WebSocket: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html
- Godot WebSocket: https://docs.godotengine.org/en/stable/classes/class_websocketpeer.html
- AWS CDK: https://docs.aws.amazon.com/cdk/v2/guide/home.html
- DynamoDB Best Practices: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html
