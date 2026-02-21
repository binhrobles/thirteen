# DynamoDB Schema

**Read this when querying or updating game state.**

## Connections Table

Tracks active WebSocket connections.

```javascript
{
  connectionId: "string (PK)",
  playerId: "string (GSI)",
  connectedAt: "number",
  ttl: "number (2 hours)",
  lastPing: "number"
}
```

## Tourney Table (Singleton)

Single global tournament state. `tourneyId` is always `"global"`.

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

## Key Points

- **Single global tourney:** `tourneyId = "global"` (MVP limitation)
- **No TTL:** Persists indefinitely until manual reset
- **Seats persist:** Same 4 players continue between games
- **Scoring:** 4/2/1/0 points for 1st/2nd/3rd/4th
- **Tournament ends:** When any player reaches `targetScore` (21)
- **Future:** Multiple tournaments with unique IDs
