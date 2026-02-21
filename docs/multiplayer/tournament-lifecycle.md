# Tournament Lifecycle

**Read this when implementing lobby, ready-up, or state transition logic.**

## States

1. **waiting** - Players claiming seats, not all seats filled
2. **starting** - All 4 seats claimed, waiting for all players to ready up for first game
3. **in_progress** - Game is active
4. **between_games** - Game finished, showing leaderboard, waiting for all players to ready up
5. **completed** - Tournament finished (someone reached 21 points), manual reset required

## State Transitions

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

## Actions by State

### waiting
- ✅ Claim seat (if available)
- ✅ Leave tourney (frees seat, resets scores)
- ⏳ Waiting for 4 players

### starting
- ❌ Claim seat (all full)
- ✅ Leave tourney (frees seat, resets scores to 0, back to waiting if <4 players)
- ✅ Ready up (mark ready for first game)
- ⏳ Waiting for all 4 players to ready up

### in_progress
- ❌ Claim seat (tourney in progress)
- ❌ Ready up (not applicable during game)
- ⚠️ Leave tourney (disconnect handling, replaced by bot after timeout)
- 🎮 Play game

### between_games
- ❌ Claim seat (tourney in progress)
- ✅ Ready up (mark ready for next game)
- ⚠️ Leave tourney (forfeit tournament, replaced by bot)
- 📊 Show leaderboard with points from last game
- ⏳ Waiting for all 4 players to ready up

### completed
- ❌ Claim seat (tourney ended)
- ❌ Ready up (tourney ended)
- 🏆 Show final leaderboard with tournament winner
- 🔄 Manual reset required (admin action or all players leave)
