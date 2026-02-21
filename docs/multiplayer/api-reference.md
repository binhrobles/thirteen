# WebSocket API Reference

**Read this when implementing new actions or message handlers.**

## Client → Server Messages

### Claim Seat
```javascript
{
  action: "tourney/claim_seat",
  payload: {
    playerName: "Player 1",
    seatPosition: 0  // 0-3, or null for first available
  }
}
```

### Leave Tournament
```javascript
{
  action: "tourney/leave",
  payload: {}
}
```

### Ready Up
```javascript
{
  action: "tourney/ready",
  payload: {}
}
```

### Play Cards
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

### Pass Turn
```javascript
{
  action: "game/pass",
  payload: {}
}
```

### Heartbeat
```javascript
{
  action: "ping",
  payload: {
    timestamp: 1234567890
  }
}
```

## Server → Client Messages

### Tournament Updated
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

### Game Started
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

### Game State Update
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

### Player Moved
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

### Game Over (with Leaderboard)
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

### Error
```javascript
{
  type: "error",
  payload: {
    code: "INVALID_MOVE" | "NOT_YOUR_TURN" | "SEAT_TAKEN" | "TOURNEY_FULL" | "TOURNEY_IN_PROGRESS" | ...,
    message: "Human-readable error message"
  }
}
```

### Pong
```javascript
{
  type: "pong",
  payload: {
    timestamp: 1234567890
  }
}
```
