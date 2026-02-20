# Multiplayer Architecture Design

**Status:** Draft
**Created:** 2026-02-16
**Owner:** Architecture Team

## Overview

This document describes the architecture for online multiplayer in Tiến Lên (Thirteen), enabling 4-player tournament-style gameplay over the internet using AWS serverless infrastructure.

**Tournament Model:**
- Players join a tournament (4 seats)
- Play multiple games with the same group
- Earn points based on finishing position (4/2/1/0 for 1st/2nd/3rd/4th)
- Between games: show leaderboard, all players must click "Ready" to continue
- Tournament continues until someone reaches 21 points (fixed)
- Tournament ends: show final leaderboard, manual reset only
- MVP: Single global tournament; Future: Multiple tournaments (lobby selection)

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
- Mark player as disconnected in tourney
- Notify other players in the tourney
- Start reconnection timeout (60 seconds)
- If before first game: free seat; if during tournament: replace with bot

#### Message Router (`$default`)
```javascript
// Input: WebSocket message with action and payload
{
  action: "tourney/claim_seat" | "tourney/leave" | "game/play" | ...,
  payload: { ... }
}
```

**Responsibilities:**
- Route messages to appropriate action handlers
- Validate message format
- Handle errors gracefully

#### Action Handlers
- `tourney/claim_seat` - Claim an available seat (0-3)
- `tourney/leave` - Leave the tournament
- `tourney/ready` - Mark player as ready for next game
- `tourney/reset` - Reset tournament (admin/manual action)
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

#### Tourney Table (Singleton)
```javascript
{
  tourneyId: "string (PK, always 'global')",
  status: "waiting | between_games | in_progress | completed",
  targetScore: 21,  // Tournament ends when someone reaches this
  seats: [
    {
      position: 0,
      playerId: "uuid | null",
      playerName: "...",
      connectionId: "...",
      score: 0,  // Tournament total
      gamesWon: 0,
      lastGamePoints: 0,  // Points from most recent game
      ready: false  // Ready for next game
    },
    { position: 1, playerId: null, playerName: null, connectionId: null, score: 0, gamesWon: 0, lastGamePoints: 0, ready: false },
    { position: 2, playerId: null, playerName: null, connectionId: null, score: 0, gamesWon: 0, lastGamePoints: 0, ready: false },
    { position: 3, playerId: null, playerName: null, connectionId: null, score: 0, gamesWon: 0, lastGamePoints: 0, ready: false }
  ],
  currentGame: {
    // Only populated when status = "in_progress"
    gameNumber: 1,
    currentPlayer: 0,
    hands: [[...cards], [...cards], [...cards], [...cards]],
    lastPlay: { playerId: 0, cards: [...], combo: "..." },
    passedPlayers: [false, false, false, false],
    winOrder: [],  // Filled as players finish: [playerId, playerId, ...]
    // ... (same structure as current GameState class)
  },
  gameHistory: [
    {
      gameNumber: 1,
      winOrder: [0, 2, 1, 3],  // Position indices in order of finishing
      pointsAwarded: [4, 2, 1, 0],  // Points for 1st, 2nd, 3rd, 4th
      timestamp: "..."
    }
  ],
  createdAt: "number",
  updatedAt: "number"
}
```

**Notes:**
- Single global tourney (tourneyId = "global")
- No TTL - persists indefinitely
- Seats **do not clear** between games - same 4 players continue
- Scoring: 4 points (1st), 2 points (2nd), 1 point (3rd), 0 points (4th/last)
- Tournament ends when any player reaches targetScore (default: 21)
- Status "between_games" = showing leaderboard, waiting for next game
- Future: multiple tourneys with unique IDs

## WebSocket Message Formats

### Client → Server Messages

#### Claim Seat
```javascript
{
  action: "tourney/claim_seat",
  payload: {
    playerName: "Player 1",
    seatPosition: 0  // 0-3, or null for first available
  }
}
```

#### Leave Tournament
```javascript
{
  action: "tourney/leave",
  payload: {}
}
```

#### Ready Up
```javascript
{
  action: "tourney/ready",
  payload: {}
}
```

#### Play Cards
```javascript
{
  action: "game/play",
  payload: {
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
  payload: {}
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

#### Tournament Updated
```javascript
{
  type: "tourney/updated",
  payload: {
    status: "waiting" | "starting" | "in_progress" | "between_games" | "completed",
    seats: [
      { position: 0, playerName: "Player 1", score: 10, gamesWon: 2, ready: false },
      { position: 1, playerName: null, score: 0, gamesWon: 0, ready: false },
      { position: 2, playerName: "Player 3", score: 8, gamesWon: 1, ready: true },
      { position: 3, playerName: "Player 4", score: 5, gamesWon: 0, ready: false }
    ],
    yourPosition: 0,  // Your claimed seat, or null if not seated
    targetScore: 21,
    currentGameNumber: 3,
    readyCount: 1  // How many players are ready (for between_games state)
  }
}
```

#### Game Started
```javascript
{
  type: "game/started",
  payload: {
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
    playerId: 0,
    action: "play" | "pass",
    cards: [{ rank: 3, suit: 0, value: 0 }, ...], // only if action = play
    yourHand: [{ rank: 3, suit: 1, value: 1 }, ...] // only for the player who moved
  }
}
```

#### Game Over (with Leaderboard)
```javascript
{
  type: "game/over",
  payload: {
    winOrder: [0, 2, 1, 3],  // Position indices in finishing order
    pointsAwarded: [4, 2, 1, 0],  // Points awarded to each position
    leaderboard: [
      { position: 0, playerName: "Player 1", totalScore: 10, lastGamePoints: 4, gamesWon: 2 },
      { position: 2, playerName: "Player 3", totalScore: 8, lastGamePoints: 2, gamesWon: 1 },
      { position: 1, playerName: "Player 2", totalScore: 5, lastGamePoints: 1, gamesWon: 0 },
      { position: 3, playerName: "Player 4", totalScore: 3, lastGamePoints: 0, gamesWon: 0 }
    ],
    tourneyComplete: false,  // true if someone reached targetScore
    winner: null  // position index of tourney winner if tourneyComplete = true
  }
}
```

#### Error
```javascript
{
  type: "error",
  payload: {
    code: "INVALID_MOVE" | "NOT_YOUR_TURN" | "SEAT_TAKEN" | "TOURNEY_FULL" | "TOURNEY_IN_PROGRESS" | ...,
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

## Tournament Lifecycle

### States
1. **waiting** - Players claiming seats, not all seats filled
2. **starting** - All 4 seats claimed, waiting for all players to ready up for first game
3. **in_progress** - Game is active
4. **between_games** - Game finished, showing leaderboard, waiting for all players to ready up
5. **completed** - Tournament finished (someone reached 21 points), manual reset required

### State Transitions

```
    ┌──────────┐
    │  waiting │◄───────────────┐
    └────┬─────┘                │ (player leaves before tourney starts)
         │                      │
         │ (4 seats filled)     │
         ▼                      │
    ┌──────────┐                │
    │ starting │────────────────┘
    └────┬─────┘
         │
         │ (all 4 ready)
         ▼
    ┌──────────────┐
    │ in_progress  │◄─────────────┐
    └────┬─────────┘              │
         │                        │
         │ (game over)            │
         ▼                        │
    ┌────────────────┐            │
    │ between_games  │            │
    │ (show scores)  │            │
    └────┬───────────┘            │
         │                        │
         │ (all 4 ready)          │
         │ if no winner           │
         ├────────────────────────┘
         │
         │ (someone reached 21)
         ▼
    ┌──────────┐
    │ completed│ (manual reset required)
    └──────────┘
```

### Actions by State

**waiting:**
- ✅ Claim seat (if available)
- ✅ Leave tourney (frees seat, resets scores)
- ⏳ Waiting for 4 players

**starting:**
- ❌ Claim seat (all full)
- ✅ Leave tourney (frees seat, resets scores to 0, back to waiting if <4 players)
- ✅ Ready up (mark ready for first game)
- ⏳ Waiting for all 4 players to ready up

**in_progress:**
- ❌ Claim seat (tourney in progress)
- ❌ Ready up (not applicable during game)
- ⚠️ Leave tourney (disconnect handling, replaced by bot after timeout)
- 🎮 Play game

**between_games:**
- ❌ Claim seat (tourney in progress)
- ✅ Ready up (mark ready for next game)
- ⚠️ Leave tourney (forfeit tournament, replaced by bot)
- 📊 Show leaderboard with points from last game
- ⏳ Waiting for all 4 players to ready up

**completed:**
- ❌ Claim seat (tourney ended)
- ❌ Ready up (tourney ended)
- 🏆 Show final leaderboard with tournament winner
- 🔄 Manual reset required (admin action or all players leave)

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
1. On disconnect, keep tournament state for 60 seconds
2. Mark player as "disconnected" in tourney
3. Notify other players: "Player X disconnected"
4. If player reconnects within 60s:
   - Restore connection
   - Send current tourney/game state
   - Notify others: "Player X reconnected"
5. If timeout expires:
   - In waiting/starting (before first game): Free seat, cancel countdown if starting
   - In progress/between_games (tournament started): Replace with bot for remainder of tournament

### Reconnection Window
- **Waiting/Starting:** 60 seconds → then free seat
- **In Progress/Between Games:** 60 seconds → then replace with bot (keeps accumulating 0 points)

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
- Seat claiming/leaving in tournament
- Multi-game tournament flow (simulated 4 players)
- Scoring and leaderboard updates

### E2E Tests
- Web client → API Gateway → Lambda → DynamoDB
- Full tournament from seat claiming to tournament winner
- Between-game transitions and leaderboard display
- Reconnection scenarios (before/during/between games)

### Load Testing
- Artillery.io or similar
- Simulate 100+ concurrent games
- Measure latency, error rates

## Migration Path

### Phase 1: Local Single Game (Current)
- Single device, 1 human + 3 bots
- No networking, no tournament scoring

### Phase 2: Online Tournament (This Design)
- AWS backend, 4 human players
- Single global tournament
- Multi-game scoring (4/2/1/0 points)
- Play to 21 points
- Bot replacement on disconnect

### Phase 3: Multiple Tournaments (Future)
- Multiple concurrent tournaments (lobby selection)
- Private tournaments (invite-only)
- Public tournaments (open join)
- Spectator mode

### Phase 4: Advanced Features (Future Epics)
- Ranked matchmaking
- RL-trained bots
- Replay system
- Tournament history and statistics

## Open Questions & Decisions

### 1. Bot Replacement on Disconnect ✅
**Question:** When a player disconnects mid-game, replace with bot or forfeit?

**Decision:** Replace with bot after 60s timeout → game continues smoothly

### 2. Tournament System ✅
**Question:** Single tournament vs multiple tournaments?

**Decision (MVP):** Single global tournament with 4 seats. Future: multiple tournaments (lobby selection)

### 3. Scoring System ✅
**Question:** What scoring system to use?

**Decision:** 4/2/1/0 points for 1st/2nd/3rd/4th place, play to 21 points

### 4. Between-Game Flow ✅
**Question:** Auto-start next game or require manual ready?

**Decision:** All players must click "Ready" to start next game. Prevents rushed starts.

### 5. Tournament Completion ✅
**Question:** Auto-reset tournament or manual?

**Decision:** Manual reset only. Final leaderboard stays visible until reset.

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
5. ✅ Build WebSocket client
6. ⬜ Integration testing
7. ⬜ Deploy to staging
8. ⬜ User acceptance testing
9. ⬜ Deploy to production

## References

- AWS API Gateway WebSocket: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html
- AWS SAM: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html
- DynamoDB Best Practices: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html
