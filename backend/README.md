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

## Testing WebSocket Connection

### Using `wscat`

```bash
npm install -g wscat

# Connect to WebSocket
wscat -c "wss://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/dev?playerId=test-player-123&playerName=TestPlayer"

# Send ping
{"action": "ping", "payload": {"timestamp": 1234567890}}

# Claim seat
{"action": "tourney/claim_seat", "payload": {"playerName": "Alice", "seatPosition": 0}}
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

## Next Steps

1. ✅ Set up infrastructure (this task)
2. ⬜ Implement tournament seat claiming logic
3. ⬜ Implement game state synchronization
4. ⬜ Add player authentication (JWT tokens)
5. ⬜ Implement ready-up system
6. ⬜ Implement game play handlers

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
