# Error Handling & Reconnection

**Read this when debugging connection issues or implementing reconnection logic.**

## Client-Side Error Handling

### Connection Errors
```javascript
// Network failure, server down, etc.
{
  type: "connection_error",
  retry: true,
  retryAfter: 5000  // ms
}
```

**Strategy:** Exponential backoff (1s, 2s, 4s, 8s, 16s, max 30s)

### Message Errors
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

## Server-Side Error Handling

### Validation Errors
- Return error message to client
- Don't update game state
- Log for debugging

### Internal Errors
- Return generic error to client
- Log full error with context
- Alert on repeated failures

## Reconnection Strategy

### Client Behavior
1. Detect disconnect (no pong response after 3 pings)
2. Show "Reconnecting..." UI
3. Attempt reconnection with exponential backoff
4. On reconnect, send `game/sync` to get current state
5. Resume gameplay

### Server Behavior
1. On disconnect, keep tournament state for 60 seconds
2. Mark player as "disconnected" in tourney
3. Notify other players: "Player X disconnected"
4. If player reconnects within 60s:
   - Restore connection
   - Send current tourney/game state
   - Notify others: "Player X reconnected"
5. If timeout expires:
   - **Waiting/Starting (before first game):** Free seat, cancel countdown if starting
   - **In Progress/Between Games (tournament started):** Replace with bot for remainder of tournament

## Reconnection Windows

- **Waiting/Starting:** 60 seconds → free seat
- **In Progress/Between Games:** 60 seconds → replace with bot (keeps accumulating 0 points)

## Conflict Resolution

- **Concurrent moves:** Server processes in order received, second move rejected with `NOT_YOUR_TURN`
- **Stale state:** Client includes sequence number with moves, server rejects if out of sync
- **Recovery:** Client can request full state with `game/sync` action
