# Tiến Lên Multiplayer Backend

AWS Serverless backend for online multiplayer using WebSocket API + Lambda + DynamoDB.

## Architecture

```
Client (Godot)
    ↓ WebSocket (WSS)
API Gateway
    ↓ Lambda Invocations
┌─────────────┬──────────────┬──────────────┐
│  $connect   │ $disconnect  │   $default   │
│   Handler   │   Handler    │ (Router)     │
└─────────────┴──────────────┴──────────────┘
    ↓                            ↓
┌────────────────┐      ┌───────────────┐
│ Connections    │      │  Tourney      │
│ DynamoDB Table │      │ DynamoDB Table│
└────────────────┘      └───────────────┘
```

## Prerequisites

- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Python 3.11+

## Project Structure

```
backend/
├── template.yaml              # SAM CloudFormation template
├── functions/
│   ├── connect/
│   │   ├── app.py            # $connect handler
│   │   └── requirements.txt
│   ├── disconnect/
│   │   ├── app.py            # $disconnect handler
│   │   └── requirements.txt
│   └── default/
│       ├── app.py            # $default (message router)
│       └── requirements.txt
└── README.md
```

## Local Development

### Build

```bash
sam build
```

### Local Testing (API Gateway emulation)

```bash
# Start local API Gateway
sam local start-api

# Or start local WebSocket API
sam local start-lambda
```

### Run Unit Tests

```bash
# TODO: Add pytest tests
python -m pytest tests/
```

## Deployment

### Deploy to Dev

```bash
sam build
sam deploy --guided
```

Follow the prompts:
- Stack name: `thirteen-backend-dev`
- AWS Region: `us-east-1` (or your preferred region)
- Parameter Stage: `dev`
- Confirm changes before deploy: `Y`
- Allow SAM CLI IAM role creation: `Y`
- Save arguments to samconfig.toml: `Y`

### Deploy to Staging/Prod

```bash
sam build
sam deploy --config-env staging --parameter-overrides Stage=staging

sam build
sam deploy --config-env prod --parameter-overrides Stage=prod
```

### Get WebSocket URL

```bash
aws cloudformation describe-stacks \
  --stack-name thirteen-backend-dev \
  --query 'Stacks[0].Outputs[?OutputKey==`WebSocketURL`].OutputValue' \
  --output text
```

## WebSocket API Reference

### Connection

**URL Format:**
```
wss://{API_ID}.execute-api.{REGION}.amazonaws.com/{STAGE}?playerId={UUID}&playerName={NAME}
```

**Query Parameters:**
- `playerId` (required): Unique player identifier (UUID)
- `playerName` (optional): Display name (defaults to "Player")

**Response:** HTTP 200 on success, 403 if playerId missing

---

### Message Format

All messages follow this structure:

**Client → Server:**
```json
{
  "action": "string",
  "payload": {}
}
```

**Server → Client:**
```json
{
  "type": "string",
  "payload": {}
}
```

---

### Commands

#### 1. `ping` - Heartbeat

Keep connection alive and update last activity timestamp.

**Request:**
```json
{
  "action": "ping",
  "payload": {
    "timestamp": 1234567890
  }
}
```

**Response:**
```json
{
  "type": "pong",
  "payload": {
    "timestamp": 1234567890
  }
}
```

---

#### 2. `tourney/claim_seat` - Join Tournament

Claim a seat in the tournament lobby.

**Request:**
```json
{
  "action": "tourney/claim_seat",
  "payload": {
    "seatPosition": 0  // Optional: 0-3, omit for first available
  }
}
```

**Success Response (Broadcast to all players):**
```json
{
  "type": "tourney/updated",
  "payload": {
    "status": "waiting",
    "seats": [
      {
        "position": 0,
        "playerName": "Alice",
        "score": 0,
        "gamesWon": 0,
        "ready": false
      },
      // ... 3 more seats
    ],
    "targetScore": 21,
    "currentGameNumber": 0,
    "readyCount": 0
  }
}
```

**Error Response:**
```json
{
  "type": "error",
  "payload": {
    "code": "SEAT_TAKEN" | "TOURNEY_FULL" | "TOURNEY_IN_PROGRESS",
    "message": "Human-readable error message"
  }
}
```

---

#### 3. `tourney/leave` - Leave Tournament

Leave the tournament (only allowed before game starts).

**Request:**
```json
{
  "action": "tourney/leave",
  "payload": {}
}
```

**Success Response (Broadcast to all players):**
```json
{
  "type": "tourney/updated",
  "payload": {
    // Same structure as claim_seat response
  }
}
```

**Error Response:**
```json
{
  "type": "error",
  "payload": {
    "code": "NOT_IN_TOURNEY" | "TOURNEY_IN_PROGRESS",
    "message": "Human-readable error message"
  }
}
```

---

#### 4. `tourney/ready` - Mark Ready

Signal readiness to start the game. When all 4 players are ready, game starts automatically.

**Request:**
```json
{
  "action": "tourney/ready",
  "payload": {}
}
```

**Success Response (Broadcast to all players):**
```json
{
  "type": "tourney/updated",
  "payload": {
    "status": "starting",
    "seats": [/* ... with ready: true */],
    "readyCount": 4
  }
}
```

**If all players ready → Game Start (Sent to each player individually):**
```json
{
  "type": "game/started",
  "payload": {
    "yourPosition": 0,
    "yourHand": [
      {"rank": 3, "suit": 0, "value": 0},
      {"rank": 5, "suit": 2, "value": 22},
      // ... 11 more cards (13 total)
    ],
    "currentPlayer": 2,  // Position of player with 3♠
    "players": ["Alice", "Bob", "Carol", "Dave"]
  }
}
```

**Error Response:**
```json
{
  "type": "error",
  "payload": {
    "code": "NOT_IN_TOURNEY" | "INVALID_STATE",
    "message": "Human-readable error message"
  }
}
```

---

#### 5. `game/play` - Play Cards

Play a valid combo of cards.

**Request:**
```json
{
  "action": "game/play",
  "payload": {
    "cards": [
      {"rank": 5, "suit": 2, "value": 22},
      {"rank": 5, "suit": 3, "value": 23}
    ]
  }
}
```

**Success Response (Broadcast to all players):**
```json
{
  "type": "game/updated",
  "payload": {
    "currentPlayer": 1,
    "lastPlay": {
      "combo": "PAIR",
      "cards": [
        {"rank": 5, "suit": 2, "value": 22},
        {"rank": 5, "suit": 3, "value": 23}
      ],
      "suited": false
    },
    "passedPlayers": [false, false, false, false],
    "handCounts": [11, 13, 13, 13],
    "yourHand": [/* Updated hand for this player */]
  }
}
```

**If game ends → Game Over (Broadcast to all players):**
```json
{
  "type": "game/over",
  "payload": {
    "winOrder": [2, 0, 1, 3],  // Positions in finish order
    "pointsAwarded": [4, 2, 1, 0],
    "leaderboard": [
      {
        "position": 2,
        "playerName": "Carol",
        "totalScore": 12,
        "lastGamePoints": 4,
        "gamesWon": 2
      },
      // ... 3 more entries
    ],
    "tourneyComplete": false,
    "winner": null  // Set if tourneyComplete is true
  }
}
```

**Error Response:**
```json
{
  "type": "error",
  "payload": {
    "code": "NOT_YOUR_TURN" | "ALREADY_PASSED" | "INVALID_COMBO" | "CANT_BEAT_LAST_PLAY",
    "message": "Human-readable error message"
  }
}
```

---

#### 6. `game/pass` - Pass Turn

Pass on the current round. Cannot pass if you have "power" (all others passed).

**Request:**
```json
{
  "action": "game/pass",
  "payload": {}
}
```

**Success Response (Broadcast to all players):**
```json
{
  "type": "game/updated",
  "payload": {
    "currentPlayer": 1,
    "lastPlay": {/* Previous play */},
    "passedPlayers": [true, false, false, false],
    "handCounts": [11, 13, 13, 13],
    "yourHand": [/* Unchanged hand for this player */]
  }
}
```

**Error Response:**
```json
{
  "type": "error",
  "payload": {
    "code": "CANT_PASS" | "NOT_YOUR_TURN",
    "message": "Cannot pass with power"
  }
}
```

---

### Card Representation

```json
{
  "rank": 3-15,  // 3-10, J=11, Q=12, K=13, A=14, 2=15
  "suit": 0-3,   // 0=Spades, 1=Clubs, 2=Diamonds, 3=Hearts
  "value": 0-51  // rank * 4 + suit (natural ordering)
}
```

**Examples:**
- `3♠` = `{"rank": 3, "suit": 0, "value": 0}` (lowest)
- `2♥` = `{"rank": 15, "suit": 3, "value": 63}` (highest)
- `A♦` = `{"rank": 14, "suit": 2, "value": 58}`

---

### Combo Types

- `SINGLE` - One card
- `PAIR` - Two cards of same rank
- `TRIPLE` - Three cards of same rank
- `QUAD` - Four cards of same rank (can "chop" single 2)
- `RUN` - 3+ consecutive cards (no 2s)
- `BOMB` - 3+ consecutive pairs (can "chop" 2s based on length)

---

## Testing WebSocket Connection

### Using `wscat`

```bash
npm install -g wscat

# Connect to WebSocket
wscat -c "wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev?playerId=test-player-123&playerName=TestPlayer"

# Send ping
{"action": "ping", "payload": {"timestamp": 1234567890}}

# Claim seat
{"action": "tourney/claim_seat", "payload": {"seatPosition": 0}}

# Ready up
{"action": "tourney/ready", "payload": {}}

# Play cards
{"action": "game/play", "payload": {"cards": [{"rank": 3, "suit": 0, "value": 0}]}}

# Pass turn
{"action": "game/pass", "payload": {}}
```

### Using Python

```python
import asyncio
import websockets
import json

async def test_connection():
    uri = "wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev?playerId=test-123&playerName=Alice"

    async with websockets.connect(uri) as websocket:
        # Send ping
        await websocket.send(json.dumps({
            "action": "ping",
            "payload": {"timestamp": 1234567890}
        }))

        # Receive pong
        response = await websocket.recv()
        print(f"Received: {response}")

asyncio.run(test_connection())
```

## DynamoDB Tables

### Connections Table

| Field         | Type   | Description                    |
|---------------|--------|--------------------------------|
| connectionId  | String | Primary key, WebSocket conn ID |
| playerId      | String | Player UUID (GSI)              |
| playerName    | String | Display name                   |
| connectedAt   | Number | Unix timestamp                 |
| lastPing      | Number | Unix timestamp                 |
| ttl           | Number | TTL for auto-deletion (2 hours)|

### Tourney Table

| Field         | Type   | Description                      |
|---------------|--------|----------------------------------|
| tourneyId     | String | Primary key (always "global")   |
| status        | String | waiting/starting/in_progress/... |
| targetScore   | Number | Tournament winning score (21)    |
| seats         | List   | Array of 4 seat objects          |
| currentGame   | Map    | Active game state                |
| gameHistory   | List   | Past game results                |

## Environment Variables

Set automatically by SAM template:

- `CONNECTIONS_TABLE` - DynamoDB Connections table name
- `TOURNEY_TABLE` - DynamoDB Tourney table name
- `WEBSOCKET_API_ENDPOINT` - WebSocket API endpoint URL

## Monitoring

### CloudWatch Logs

```bash
# View logs for a specific function
sam logs --stack-name thirteen-backend-dev --name ConnectFunction --tail

# Or use AWS CLI
aws logs tail /aws/lambda/thirteen-connect-dev --follow
```

### CloudWatch Metrics

- Lambda invocations, errors, duration
- API Gateway connections, messages, errors
- DynamoDB read/write capacity

## Cleanup

```bash
sam delete --stack-name thirteen-backend-dev
```

## Implementation Status

1. ✅ Set up infrastructure
2. ✅ Implement tournament seat claiming logic
3. ✅ Implement game state synchronization
4. ✅ Implement ready-up system
5. ✅ Implement game play handlers (play, pass)
6. ✅ Implement game scoring and tournament progression
7. ⬜ Add player authentication (JWT tokens)
8. ⬜ Implement disconnect/reconnect handling
9. ⬜ Add bot player support for testing
10. ⬜ Add unit and integration tests

## Troubleshooting

### Lambda cold starts

Use provisioned concurrency for production:

```yaml
ProvisionedConcurrencyConfig:
  ProvisionedConcurrentExecutions: 2
```

### WebSocket connection limits

Default: 10,000 concurrent connections per account per region. Request limit increase if needed.

### DynamoDB throttling

Switch to provisioned capacity if PAY_PER_REQUEST is too expensive or throttles.
