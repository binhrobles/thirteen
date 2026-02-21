# Operations & Deployment

**Read this when deploying, monitoring, or testing the backend.**

## Infrastructure as Code

Use **AWS SAM** for infrastructure definition (see `backend/template.yaml`).

### Environments
- **dev** - Development testing
- **staging** - Pre-production testing
- **prod** - Production

## CI/CD Pipeline

1. GitHub Actions on push to `main`
2. Run tests (unit + integration)
3. Build Lambda packages
4. Deploy to `dev` environment
5. Run E2E tests
6. Manual approval gate
7. Deploy to `prod` environment

## Monitoring & Observability

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

## Security

1. **Rate limiting:** Max 100 messages/minute per connection
2. **Message size limits:** Max 32 KB per message
3. **Abuse prevention:** IP-based throttling on connection attempts
4. **Data validation:** Strict schema validation on all inputs
5. **Secrets:** Auth secrets in AWS Secrets Manager, rotated monthly

## Player Authentication (MVP)

- Client generates UUID v4 on first launch
- Stored in browser localStorage
- Sent with connection request
- Optional display name (default: "Player {N}")

**Future:** Google Sign-In, Apple Sign-In, email/password
