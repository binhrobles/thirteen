# Tournament-Aware RL Training

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Train an RL model that learns tournament-strategic play (anti-leader, risk adjustment) by extending the state encoder with tournament features and adding tournament-context training to the PPO pipeline.

**Architecture:** Extend STATE_SIZE from 725 to 740 with 15 tournament features (scores, gaps, leader, clinch proximity). Add a tournament wrapper to the game-server bridge that runs multi-game tournament sequences. Use curriculum scheduling to mix individual games (tournament features zeroed) with tournament games. Fine-tune from the existing published model.

**Tech Stack:** Python (PyTorch, PPO), TypeScript (game engine bridge), ONNX export

---

## Chunk 1: Extend State Encoder with Tournament Features

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/game-logic/src/training/constants.ts` | Modify | Bump STATE_SIZE 725 → 740, add TOURNEY_FEATURES_SIZE |
| `packages/game-logic/src/training/state-encoder.ts` | Modify | Append 15 tournament features to state vector |
| `packages/training/python/features.py` | Modify | Mirror TS changes: STATE_SIZE 725 → 740, encode tournament features |
| `packages/training/python/model.py` | Modify | Update state_encoder input from 725 → 740; add weight-expansion helper for fine-tuning |

### Tournament Feature Layout (15 floats)

```
Offset  Size  Feature                    Encoding
725     1     My tournament score        score / target_score (e.g. /21)
726     3     Opponent tournament scores  score / target_score (relative order: left, across, right)
729     3     Score gaps (me vs each)    (my_score - opp_score) / target_score
732     4     Tournament leader (one-hot) which player leads (relative indexing)
736     1     Games played ratio         game_number / expected_total_games
737     3     Clinch proximity           (target_score - opp_score) / target_score per opponent
                                         (lower = opponent closer to winning)
```

All features normalize to roughly [-1, 1] or [0, 1] range. When playing outside tournament context (individual games), all 15 floats are zero — the model learns to ignore them during individual-game training, then incorporate them during tournament training.

---

### Task 1: Update constants

**Files:**
- Modify: `packages/game-logic/src/training/constants.ts`
- Modify: `packages/training/python/features.py` (constants section only)

- [ ] **Step 1: Update TS constants**

In `packages/game-logic/src/training/constants.ts`, add the tournament feature size constant and bump STATE_SIZE:

```typescript
export const TOURNEY_FEATURES_SIZE = 15;

// State vector: 725 (game features) + 15 (tournament features) = 740
export const STATE_SIZE = 740;
```

Update the comment breakdown to include the new block.

- [ ] **Step 2: Update Python constants**

In `packages/training/python/features.py`, update the constants to match:

```python
TOURNEY_FEATURES_SIZE = 15
STATE_SIZE = 740
```

- [ ] **Step 3: Commit**

```bash
git add packages/game-logic/src/training/constants.ts packages/training/python/features.py
git commit -m "feat: bump STATE_SIZE 725→740 for tournament features"
```

---

### Task 2: Extend TypeScript state encoder

**Files:**
- Modify: `packages/game-logic/src/training/state-encoder.ts`

- [ ] **Step 1: Add tournament feature encoding**

At the end of `encodeState()` in `state-encoder.ts`, after the combo history block (offset should be 725), append tournament feature encoding. The snapshot will carry an optional `tourneyContext` field:

```typescript
// Tournament context (15) — all zeros when not in tournament
const tourney = snapshot.tourneyContext;
if (tourney) {
  const target = tourney.targetScore;

  // My tournament score (1)
  out[offset++] = tourney.scores[playerIndex] / target;

  // Opponent tournament scores (3)
  for (let rel = 1; rel <= NUM_OPPONENTS; rel++) {
    const abs = (playerIndex + rel) % NUM_PLAYERS;
    out[offset++] = tourney.scores[abs] / target;
  }

  // Score gaps: me vs each opponent (3)
  const myScore = tourney.scores[playerIndex];
  for (let rel = 1; rel <= NUM_OPPONENTS; rel++) {
    const abs = (playerIndex + rel) % NUM_PLAYERS;
    out[offset++] = (myScore - tourney.scores[abs]) / target;
  }

  // Tournament leader one-hot (4) — relative indexing
  let leaderAbs = 0;
  let leaderScore = tourney.scores[0];
  for (let p = 1; p < NUM_PLAYERS; p++) {
    if (tourney.scores[p] > leaderScore) {
      leaderAbs = p;
      leaderScore = tourney.scores[p];
    }
  }
  const leaderRel = (leaderAbs - playerIndex + NUM_PLAYERS) % NUM_PLAYERS;
  out[offset + leaderRel] = 1;
  offset += NUM_PLAYERS;

  // Games played ratio (1)
  out[offset++] = tourney.gameNumber / tourney.expectedTotalGames;

  // Clinch proximity per opponent (3)
  for (let rel = 1; rel <= NUM_OPPONENTS; rel++) {
    const abs = (playerIndex + rel) % NUM_PLAYERS;
    out[offset++] = (target - tourney.scores[abs]) / target;
  }
} else {
  offset += TOURNEY_FEATURES_SIZE;
}
```

- [ ] **Step 2: Add TourneyContext type to `packages/game-logic/src/types.ts`**

Add `TourneyContext` to `types.ts` (co-located with `GameStateSnapshot`):

```typescript
export interface TourneyContext {
  scores: number[];        // tournament score per seat [4]
  targetScore: number;     // e.g. 21
  gameNumber: number;      // current game number (1-indexed)
  expectedTotalGames: number; // estimated total games in tournament
}
```

Extend the `GameStateSnapshot` type to include `tourneyContext?: TourneyContext`.

- [ ] **Step 2b: Add offset assertion at end of `encodeState()`**

After the tournament features block, add a runtime check to catch layout drift (mirrors the Python encoder's `assert offset == STATE_SIZE`):

```typescript
if (offset !== STATE_SIZE) {
  throw new Error(`State encoder offset mismatch: ${offset} !== ${STATE_SIZE}`);
}
```

- [ ] **Step 3: Import TOURNEY_FEATURES_SIZE**

Add `TOURNEY_FEATURES_SIZE` to the import from `constants.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/game-logic/src/training/state-encoder.ts packages/game-logic/src/types.ts
git commit -m "feat: encode tournament context in TS state encoder"
```

---

### Task 3: Extend Python state encoder

**Files:**
- Modify: `packages/training/python/features.py`

- [ ] **Step 1: Add tournament encoding to `encode_state()`**

After the combo history block (offset == 725), add the mirror of the TS code:

```python
# Tournament context (15) — all zeros when not in tournament
tourney = snapshot.get("tourneyContext")
if tourney:
    target = tourney["targetScore"]
    scores = tourney["scores"]

    # My tournament score (1)
    out[offset] = scores[player_index] / target
    offset += 1

    # Opponent tournament scores (3)
    for rel in range(1, NUM_OPPONENTS + 1):
        abs_p = (player_index + rel) % NUM_PLAYERS
        out[offset] = scores[abs_p] / target
        offset += 1

    # Score gaps: me vs each opponent (3)
    my_score = scores[player_index]
    for rel in range(1, NUM_OPPONENTS + 1):
        abs_p = (player_index + rel) % NUM_PLAYERS
        out[offset] = (my_score - scores[abs_p]) / target
        offset += 1

    # Tournament leader one-hot (4) — relative indexing
    leader_abs = max(range(NUM_PLAYERS), key=lambda p: scores[p])
    leader_rel = (leader_abs - player_index + NUM_PLAYERS) % NUM_PLAYERS
    out[offset + leader_rel] = 1
    offset += NUM_PLAYERS

    # Games played ratio (1)
    out[offset] = tourney["gameNumber"] / tourney["expectedTotalGames"]
    offset += 1

    # Clinch proximity per opponent (3)
    for rel in range(1, NUM_OPPONENTS + 1):
        abs_p = (player_index + rel) % NUM_PLAYERS
        out[offset] = (target - scores[abs_p]) / target
        offset += 1
else:
    offset += TOURNEY_FEATURES_SIZE

assert offset == STATE_SIZE
```

- [ ] **Step 2: Commit**

```bash
git add packages/training/python/features.py
git commit -m "feat: encode tournament context in Python state encoder"
```

---

### Task 4: Update model for new state size + fine-tune helper

**Files:**
- Modify: `packages/training/python/model.py`

- [ ] **Step 1: Verify model auto-adapts**

`TienLenNet.__init__` uses `STATE_SIZE` from `features.py` for `self.state_encoder`, so bumping STATE_SIZE to 740 automatically changes the model's input layer. Verify this by checking the import: `from features import STATE_SIZE, ACTION_SIZE`. No code change needed here — it already works.

- [ ] **Step 2: Add weight expansion utility for fine-tuning**

Add a standalone function to `model.py` that loads a 725-feature checkpoint into a 740-feature model by zero-padding the first linear layer's weights:

```python
def load_expanded_state_dict(
    model: TienLenNet,
    checkpoint_path: str,
    old_state_size: int = 725,
    device: torch.device | None = None,
) -> None:
    """Load a checkpoint trained with a smaller STATE_SIZE.

    Zero-pads the first linear layer's weight matrix so the new features
    start with no influence — the model begins from its prior skill level.
    """
    old_state = torch.load(checkpoint_path, map_location=device, weights_only=True)
    new_state = model.state_dict()

    for key in old_state:
        if key == "state_encoder.0.weight":
            # Shape: (256, old_state_size) → (256, STATE_SIZE)
            old_w = old_state[key]
            new_w = new_state[key].clone()  # starts as random init
            new_w.zero_()
            new_w[:, :old_state_size] = old_w
            new_state[key] = new_w
        elif old_state[key].shape == new_state[key].shape:
            new_state[key] = old_state[key]
        else:
            raise ValueError(
                f"Shape mismatch for {key}: "
                f"checkpoint {old_state[key].shape} vs model {new_state[key].shape}"
            )

    model.load_state_dict(new_state)
```

- [ ] **Step 3: Commit**

```bash
git add packages/training/python/model.py
git commit -m "feat: add load_expanded_state_dict for fine-tuning from 725→740"
```

---

### Task 5: Update ONNX export and RL bot for new state size

**Files:**
- Modify: `packages/training/python/export_onnx.py` — already uses `STATE_SIZE` from features, so no change needed. Verify.
- Modify: `packages/game-logic/src/bot/rl-bot.ts` — already uses `STATE_SIZE` from constants. Verify.
- Modify: `packages/game-logic/src/training/game-server.ts` — needs to pass `tourneyContext` in snapshot when in tournament mode (done in Chunk 2).

- [ ] **Step 1: Verify export_onnx.py uses STATE_SIZE**

Confirm `export_onnx.py` imports `STATE_SIZE` from features and uses it for dummy input shape. It does — no change needed.

- [ ] **Step 2: Verify rl-bot.ts uses STATE_SIZE from constants**

Check that `rl-bot.ts` imports and uses `STATE_SIZE` from `./training/constants.js`. If it does, the ONNX input shape will match automatically after the constant bump.

- [ ] **Step 3: Commit (if any changes needed)**

---

## Chunk 2: Tournament Game Bridge

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/game-logic/src/training/game-server.ts` | Modify | Add `new_tourney` and tournament-mode step handling |
| `packages/training/python/game_bridge.py` | Modify | Add `new_tourney()` method, `TourneyTurnInfo` with tournament context |

---

### Task 6: Extend game-server.ts with tournament mode

**Files:**
- Modify: `packages/game-logic/src/training/game-server.ts`

- [ ] **Step 1: Add tournament state tracking**

Add tournament state variables alongside the existing `game` and `greedySeats`:

```typescript
let tourneyScores: number[] = [0, 0, 0, 0];
let tourneyGameNumber = 0;
let tourneyTargetScore = 21;
let tourneyMode = false;
```

- [ ] **Step 2: Inject tourneyContext into snapshot when in tournament mode**

Modify `getTurnResponse()` to attach tournament context to the snapshot when `tourneyMode` is true:

```typescript
if (tourneyMode) {
  // Estimate expected total games: target_score / avg_ppg_per_game
  // Average PPG per player = 7/4 = 1.75, so ~12 games to reach 21
  const expectedTotal = Math.ceil(tourneyTargetScore / 1.75);
  snapshot.tourneyContext = {
    scores: [...tourneyScores],
    targetScore: tourneyTargetScore,
    gameNumber: tourneyGameNumber,
    expectedTotalGames: expectedTotal,
  };
}
```

- [ ] **Step 3: Add `new_tourney` command**

Add a new command handler that resets tournament state and starts the first game:

```typescript
case "new_tourney": {
  tourneyMode = true;
  tourneyScores = [0, 0, 0, 0];
  tourneyGameNumber = 0;
  tourneyTargetScore = msg.target_score ?? 21;
  // Start first game
  const hands = deal();
  game = new GameState(hands);
  greedySeats = new Set(msg.greedy_seats ?? []);
  tourneyGameNumber = 1;
  send(advancePastGreedy());
  break;
}
```

- [ ] **Step 4: Add `next_game` command**

After a game ends, Python calls `next_game` to start the next game in the tournament. This updates scores from the previous game's win order and starts a new deal:

```typescript
case "next_game": {
  if (!tourneyMode) {
    send({ type: "error", message: "Not in tournament mode" });
    break;
  }
  // Update scores from the win order of the previous game
  const winOrder: number[] = msg.win_order;
  const points = [4, 2, 1, 0];
  for (let i = 0; i < winOrder.length; i++) {
    tourneyScores[winOrder[i]] += points[i];
  }

  // Check if tournament is over
  const maxScore = Math.max(...tourneyScores);
  if (maxScore >= tourneyTargetScore) {
    send({
      type: "tourney_over",
      scores: [...tourneyScores],
      games_played: tourneyGameNumber,
    });
    tourneyMode = false;
    break;
  }

  // Start next game
  const hands = deal();
  game = new GameState(hands);
  greedySeats = new Set(msg.greedy_seats ?? []);
  tourneyGameNumber++;
  send(advancePastGreedy());
  break;
}
```

- [ ] **Step 5: Ensure `new_game` resets tournament mode**

In the existing `new_game` handler, add `tourneyMode = false;` so individual-game training doesn't accidentally carry tournament state. Note: no need to reset `tourneyScores`/`tourneyGameNumber` since they are only read when `tourneyMode === true`.

- [ ] **Step 6: Update the command type to accept new fields**

Expand the `msg` type to include `target_score?: number`, `win_order?: number[]`.

- [ ] **Step 7: Commit**

```bash
git add packages/game-logic/src/training/game-server.ts
git commit -m "feat: add tournament mode to game-server (new_tourney, next_game)"
```

---

### Task 7: Extend Python game bridge

**Files:**
- Modify: `packages/training/python/game_bridge.py`

- [ ] **Step 1: Add TourneyOver dataclass**

```python
@dataclass
class TourneyOver:
    scores: list[int]
    games_played: int
```

- [ ] **Step 2: Add a separate `_parse_tourney_response` method**

Keep `_parse_response` unchanged (returns `TurnInfo | GameOver`) to preserve type safety for `new_game()` and `step()`. Add a new method that also handles `tourney_over`:

```python
def _parse_tourney_response(self, resp: dict) -> TurnInfo | GameOver | TourneyOver:
    if resp["type"] == "tourney_over":
        return TourneyOver(scores=resp["scores"], games_played=resp["games_played"])
    return self._parse_response(resp)
```

- [ ] **Step 3: Add `new_tourney()` method**

```python
def new_tourney(
    self,
    greedy_seats: list[int] | None = None,
    target_score: int = 21,
) -> TurnInfo | GameOver:
    cmd: dict = {"cmd": "new_tourney", "target_score": target_score}
    if greedy_seats:
        cmd["greedy_seats"] = greedy_seats
    return self._parse_response(self._send(cmd))
```

- [ ] **Step 4: Add `next_game()` method**

Uses `_parse_tourney_response` since `next_game` can return either a new turn or a tournament-over signal:

```python
def next_game(
    self,
    win_order: list[int],
    greedy_seats: list[int] | None = None,
) -> TurnInfo | GameOver | TourneyOver:
    cmd: dict = {"cmd": "next_game", "win_order": win_order}
    if greedy_seats:
        cmd["greedy_seats"] = greedy_seats
    return self._parse_tourney_response(self._send(cmd))
```

- [ ] **Step 5: Commit**

```bash
git add packages/training/python/game_bridge.py
git commit -m "feat: add tournament methods to Python game bridge"
```

---

## Chunk 3: Tournament-Aware PPO Training

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/training/python/train_ppo.py` | Modify | Add tournament data collection, tournament-aware reward shaping, curriculum scheduling |

---

### Task 8: Add tournament reward shaping

**Files:**
- Modify: `packages/training/python/train_ppo.py`

- [ ] **Step 1: Add tournament reward constants**

Add near the existing `POSITION_REWARDS`:

```python
# Tournament-aware reward adjustments
LEADER_BEATEN_BONUS = 0.5       # bonus when you finish above the tournament leader
LEADER_WON_PENALTY = -0.3       # penalty when leader wins the game (for non-leaders)
TRAILING_URGENCY_SCALE = 0.5    # scale factor for trailing player urgency
```

- [ ] **Step 2: Add tournament reward calculation function**

```python
def compute_tourney_reward(
    base_reward: float,
    finish_pos: int,
    player_seat: int,
    win_order: list[int],
    tourney_scores: list[int],
    target_score: int,
) -> float:
    """Adjust per-game position reward based on tournament standings.

    Only applies tournament adjustments when win_order is complete (at GameOver).
    For mid-game finishes (incomplete win_order), returns base_reward unchanged.
    """
    reward = base_reward

    if not tourney_scores or target_score <= 0:
        return reward

    # Skip tournament adjustments if win_order is incomplete (mid-game finish).
    # leader_pos / leader_won checks require the full win_order.
    if len(win_order) < 4:
        return reward

    # Who is the tournament leader?
    leader_seat = max(range(len(tourney_scores)), key=lambda p: tourney_scores[p])
    leader_score = tourney_scores[leader_seat]
    my_score = tourney_scores[player_seat]

    if leader_seat == player_seat:
        # I'm the leader — no anti-leader adjustments for me
        return reward

    # Bonus for finishing above the tournament leader
    leader_pos = win_order.index(leader_seat)
    if finish_pos < leader_pos:
        reward += LEADER_BEATEN_BONUS

    # Penalty if the tournament leader won this game
    if win_order[0] == leader_seat:
        reward += LEADER_WON_PENALTY

    # Urgency scaling when trailing
    score_gap = leader_score - my_score
    if score_gap > 0 and target_score > 0:
        urgency = score_gap / target_score
        reward *= 1.0 + urgency * TRAILING_URGENCY_SCALE

    return reward
```

- [ ] **Step 3: Commit**

```bash
git add packages/training/python/train_ppo.py
git commit -m "feat: add tournament reward shaping functions"
```

---

### Task 9: Extract shared game loop and add tournament trajectory collection

**Files:**
- Modify: `packages/training/python/train_ppo.py`

**Design note:** The inner game-playing loop (action selection, stepping, mid-game finish detection, power-gain shaping) is shared between individual and tournament collection. Extract it into a helper to avoid duplicating ~80 lines. The helper returns per-player trajectory buffers and the game's win_order.

- [ ] **Step 1: Extract `play_one_game` helper**

Extract the inner game loop from `collect_trajectories` into a standalone function. This is a refactor — `collect_trajectories` should call `play_one_game` and produce identical behavior:

```python
@dataclass
class GameResult:
    player_bufs: dict[int, TrajectoryBuffer]
    win_order: list[int]
    moves: int

def play_one_game(
    bridge: GameBridge,
    first_turn: TurnInfo,
    model: TienLenNet,
    device: torch.device,
    seat_types: dict[int, str],
    self_seats: set[int],
    use_shaping: bool,
    avg_model: TienLenNet | None = None,
    reservoir: ReservoirBuffer | None = None,
    reward_fn: Callable[[float, int, int, list[int]], float] | None = None,
) -> GameResult:
    """Play a single game, collecting PPO data for self-seats.

    reward_fn: optional (base_reward, position, player_seat, win_order) -> adjusted_reward.
    If None, uses base_reward directly (individual game behavior).
    """
    player_bufs = {p: TrajectoryBuffer() for p in self_seats}
    turn = first_turn
    prev_can_pass = False
    prev_hand_sizes = {p: len(turn.state["hands"][p]) for p in range(4)}
    finish_position = 0
    total_moves = 0

    while True:
        player = turn.player
        seat_type = seat_types.get(player, "self")
        state, action_features, action_mask, num_actions = encode_turn(turn, player)

        if seat_type == "self":
            action_index, log_prob, value = select_action(
                model, state, action_features, action_mask, num_actions, device
            )
            player_bufs[player].add(
                state, action_features, action_mask, action_index, log_prob, value
            )
            player_bufs[player].rewards[-1] = 0.0  # shaping added below
            if reservoir is not None:
                reservoir.add(state, action_features, action_mask, action_index)
        elif seat_type == "random":
            action_index = random.randrange(num_actions)
        elif seat_type == "average" and avg_model is not None:
            action_index = select_action_average(
                avg_model, state, action_features, action_mask, num_actions, device
            )
        else:
            action_index = random.randrange(num_actions)

        total_moves += 1
        result = bridge.step(to_bridge_action(action_index, num_actions, turn))

        if isinstance(result, GameOver):
            win_order = result.win_order
            for position, player_id in enumerate(win_order):
                if player_id in player_bufs:
                    pb = player_bufs[player_id]
                    if pb.size() > 0:
                        base = POSITION_REWARDS[position]
                        r = reward_fn(base, position, player_id, win_order) if reward_fn else base
                        if position >= finish_position:
                            pb.rewards[-1] += r
                        pb.dones[-1] = True
            return GameResult(player_bufs, win_order, total_moves)

        assert isinstance(result, TurnInfo)
        curr_hand_sizes = {p: len(result.state["hands"][p]) for p in range(4)}
        for p in range(4):
            if prev_hand_sizes[p] > 0 and curr_hand_sizes[p] == 0:
                position = finish_position
                finish_position += 1
                if p in player_bufs and player_bufs[p].size() > 0:
                    base = POSITION_REWARDS[position]
                    # Mid-game: pass incomplete win_order — reward_fn should handle gracefully
                    r = reward_fn(base, position, p, []) if reward_fn else base
                    player_bufs[p].rewards[-1] += r

        prev_hand_sizes = curr_hand_sizes

        if use_shaping and not result.can_pass and prev_can_pass:
            power_player = result.player
            if power_player in player_bufs and player_bufs[power_player].size() > 0:
                player_bufs[power_player].rewards[-1] += POWER_GAIN_REWARD

        prev_can_pass = result.can_pass
        turn = result
```

Then update `collect_trajectories` to call `play_one_game` (passing `reward_fn=None` for individual games).

- [ ] **Step 2: Add `collect_tourney_trajectories` function**

Uses `play_one_game` with a tournament reward closure:

```python
def collect_tourney_trajectories(
    bridge: GameBridge,
    model: TienLenNet,
    device: torch.device,
    target_steps: int,
    use_shaping: bool = True,
    avg_model: TienLenNet | None = None,
    opponent_dist: dict[str, float] | None = None,
    reservoir: ReservoirBuffer | None = None,
    target_score: int = 21,
) -> tuple[TrajectoryBuffer, dict]:
    """Play tournaments, collect PPO data with tournament-aware rewards."""
    from game_bridge import TourneyOver

    buf = TrajectoryBuffer()
    games_played = 0
    tourneys_played = 0
    total_moves = 0
    opponent_counts: dict[str, int] = {"self": 0, "greedy": 0, "random": 0, "average": 0}

    pure_self_play = opponent_dist is None

    while buf.size() < target_steps:
        if pure_self_play:
            seat_types: dict[int, str] = {s: "self" for s in range(4)}
            greedy_seats: list[int] = []
        else:
            assignments = sample_opponents(opponent_dist)
            seat_types = {0: "self", **assignments}
            greedy_seats = [s for s, t in seat_types.items() if t == "greedy"]

        for t in seat_types.values():
            opponent_counts[t] = opponent_counts.get(t, 0) + 1

        self_seats = {s for s, t in seat_types.items() if t == "self"}

        # Start a tournament
        result = bridge.new_tourney(
            greedy_seats=greedy_seats if greedy_seats else None,
            target_score=target_score,
        )

        # Track scores locally for reward shaping.
        # The TS server maintains its own copy for state encoding features.
        tourney_scores = [0, 0, 0, 0]

        while True:
            if isinstance(result, GameOver):
                # Edge case: all greedy seats finish immediately
                win_order = result.win_order
                games_played += 1
            else:
                # Build reward closure that captures current tourney_scores
                scores_snapshot = list(tourney_scores)  # snapshot for this game
                def tourney_reward_fn(base, pos, seat, wo,
                                     _scores=scores_snapshot, _target=target_score):
                    return compute_tourney_reward(base, pos, seat, wo, _scores, _target)

                game_result = play_one_game(
                    bridge, result, model, device, seat_types, self_seats,
                    use_shaping, avg_model, reservoir,
                    reward_fn=tourney_reward_fn,
                )
                win_order = game_result.win_order
                total_moves += game_result.moves
                for pb in game_result.player_bufs.values():
                    buf.extend(pb)
                games_played += 1

            # Update local tourney scores
            points = [4, 2, 1, 0]
            for i, seat in enumerate(win_order):
                tourney_scores[seat] += points[i]

            # Start next game or end tournament
            result = bridge.next_game(
                win_order=win_order,
                greedy_seats=greedy_seats if greedy_seats else None,
            )
            if isinstance(result, TourneyOver):
                tourneys_played += 1
                break

    stats = {
        "games": games_played,
        "tourneys": tourneys_played,
        "steps": buf.size(),
        "avg_moves": total_moves / max(games_played, 1),
        "opponent_counts": opponent_counts,
    }
    return buf, stats
```

- [ ] **Step 3: Commit**

```bash
git add packages/training/python/train_ppo.py
git commit -m "feat: extract play_one_game helper, add collect_tourney_trajectories"
```

---

### Task 10: Add curriculum scheduling and CLI flags

**Files:**
- Modify: `packages/training/python/train_ppo.py`

- [ ] **Step 1: Add curriculum scheduling function**

```python
def get_tourney_fraction(epoch: int, total_epochs: int) -> float:
    """Fraction of games that should be tournament games this epoch.

    Curriculum:
      Epochs 0-20%:    0% tournament (pure individual game training)
      Epochs 20-40%:   linear ramp 0% → 50%
      Epochs 40%+:     70% tournament, 30% individual
    """
    phase1_end = int(total_epochs * 0.2)
    phase2_end = int(total_epochs * 0.4)

    if epoch < phase1_end:
        return 0.0
    elif epoch < phase2_end:
        t = (epoch - phase1_end) / max(phase2_end - phase1_end, 1)
        return 0.5 * t
    else:
        return 0.7
```

- [ ] **Step 2: Integrate into training loop**

In the `train()` function, add a `tourney_mode` parameter. When enabled, each epoch flips a coin using `get_tourney_fraction()` to decide whether to collect trajectories via `collect_trajectories` (individual game) or `collect_tourney_trajectories` (tournament):

```python
# In the epoch loop, before collect_trajectories:
use_tourney = tourney_mode and random.random() < get_tourney_fraction(epoch, epochs)

if use_tourney:
    buf, collect_stats = collect_tourney_trajectories(
        bridge, model, device, batch_size, use_shaping,
        avg_model=avg_model,
        opponent_dist=opponent_dist,
        reservoir=reservoir,
        target_score=tourney_target_score,
    )
else:
    buf, collect_stats = collect_trajectories(
        bridge, model, device, batch_size, use_shaping,
        avg_model=avg_model,
        opponent_dist=opponent_dist,
        reservoir=reservoir,
    )
```

- [ ] **Step 3: Add CLI arguments**

```python
parser.add_argument("--tourney-mode", action="store_true",
                    help="Enable tournament-aware training with curriculum")
parser.add_argument("--tourney-target-score", type=int, default=21,
                    help="Target score for tournament games")
parser.add_argument("--expand-from", type=str, default=None,
                    help="Path to 725-feature model to expand to 740 features (for first fine-tune)")
```

- [ ] **Step 4: Add model expansion logic to `train()` init**

Near the top of `train()`, after model creation. `--expand-from` and `--resume-model` are mutually exclusive — raise an error if both provided:

```python
if expand_from and resume_model:
    raise ValueError("Cannot use both --expand-from and --resume-model. "
                     "Use --expand-from for first fine-tune from 725→740, "
                     "or --resume-model for continuing a 740-feature training run.")

if expand_from:
    from model import load_expanded_state_dict
    load_expanded_state_dict(model, expand_from, old_state_size=725, device=device)
    print(f"Expanded model from 725→{STATE_SIZE} features using {expand_from}")
elif resume_model:
    model.load_state_dict(torch.load(resume_model, map_location=device, weights_only=True))
    print(f"Resumed model from {resume_model}")
```

- [ ] **Step 5: Add tourney stats to epoch logging**

Add `tourney_frac` and `tourneys` to the epoch CSV and print output when in tourney mode.

- [ ] **Step 6: Commit**

```bash
git add packages/training/python/train_ppo.py
git commit -m "feat: add tournament curriculum scheduling and --tourney-mode flag"
```

---

## Chunk 4: Tournament Evaluation

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/training/python/evaluate.py` | Modify | Add `--vs-greedy-tourney` mode that runs full tournaments |

---

### Task 11: Add tournament evaluation

**Files:**
- Modify: `packages/training/python/evaluate.py`

- [ ] **Step 1: Add tournament evaluation function**

```python
def evaluate_tourney(model_path: str, tourneys: int = 100, target_score: int = 21):
    """Run full tournaments: 1 model seat vs 3 greedy bots.

    Reports: tournament win rate, average finish position, score distribution.
    """
    from game_bridge import GameBridge, TourneyOver

    bot = OnnxBot(model_path)
    tourney_wins = 0
    tourney_positions = []  # 1=1st, 2=2nd, etc. in final standings

    with GameBridge() as bridge:
        for t in range(tourneys):
            model_seat = random.randrange(4)
            greedy_seats = [s for s in range(4) if s != model_seat]

            result = bridge.new_tourney(greedy_seats=greedy_seats, target_score=target_score)

            while True:
                # Play one game
                while not isinstance(result, GameOver):
                    turn = result
                    state = encode_state(turn.state, turn.player)
                    action_list = [encode_action(cards) for cards in turn.valid_actions]
                    if turn.can_pass:
                        action_list.append(encode_pass_action())

                    if not action_list:
                        break

                    choice = bot.choose_action_index(state, action_list)
                    result = bridge.step(choice)

                if isinstance(result, GameOver):
                    win_order = result.win_order
                    result = bridge.next_game(win_order=win_order, greedy_seats=greedy_seats)

                if isinstance(result, TourneyOver):
                    # Determine model's final position
                    scores = result.scores
                    ranked = sorted(range(4), key=lambda p: scores[p], reverse=True)
                    model_pos = ranked.index(model_seat) + 1
                    tourney_positions.append(model_pos)
                    if model_pos == 1:
                        tourney_wins += 1
                    break

            if (t + 1) % 10 == 0:
                wr = tourney_wins / (t + 1)
                print(f"\r  {t+1}/{tourneys} tourneys, win rate: {wr:.1%}", end="", file=sys.stderr)

    n = len(tourney_positions)
    print(f"\n\nTournament Results ({tourneys} tournaments, target={target_score}):")
    print(f"  Win rate: {tourney_wins}/{n} ({tourney_wins/n:.1%})")
    pos_counts = [sum(1 for p in tourney_positions if p == rank) for rank in range(1, 5)]
    print(f"  1st: {pos_counts[0]:4d} ({pos_counts[0]/n:.1%})  "
          f"2nd: {pos_counts[1]:4d} ({pos_counts[1]/n:.1%})  "
          f"3rd: {pos_counts[2]:4d} ({pos_counts[2]/n:.1%})  "
          f"4th: {pos_counts[3]:4d} ({pos_counts[3]/n:.1%})")
```

- [ ] **Step 2: Add CLI flag**

```python
parser.add_argument("--vs-greedy-tourney", action="store_true",
                    help="Evaluate model in full tournaments vs greedy bots")
parser.add_argument("--tourneys", type=int, default=100,
                    help="Number of tournaments to play")
parser.add_argument("--target-score", type=int, default=21,
                    help="Tournament target score")
```

- [ ] **Step 3: Wire into main**

```python
elif args.vs_greedy_tourney:
    evaluate_tourney(args.model, args.tourneys, args.target_score)
```

- [ ] **Step 4: Commit**

```bash
git add packages/training/python/evaluate.py
git commit -m "feat: add tournament evaluation mode"
```

---

## Chunk 5: Integration Test and First Training Run

### Task 12: End-to-end smoke test

- [ ] **Step 1: Run a quick individual-game training to verify state size change doesn't break anything**

```bash
cd packages/training/python
uv run train_ppo.py --epochs 5 --batch-size 256 --eval-interval 5 --eval-games 10 --output-dir ../data
```

Expected: completes without errors, state vectors are 740 floats.

- [ ] **Step 2: Run a quick tournament training with model expansion**

```bash
cd packages/training/python
uv run train_ppo.py \
  --epochs 10 --batch-size 256 \
  --tourney-mode --tourney-target-score 21 \
  --expand-from ../data/<latest-725-model>.pt \
  --eval-interval 5 --eval-games 10 \
  --output-dir ../data
```

Expected: first 2 epochs use individual games (curriculum), later epochs mix in tournaments.

- [ ] **Step 3: Run tournament evaluation**

```bash
cd packages/training/python
uv run evaluate.py --model ../data/<model>.onnx --vs-greedy-tourney --tourneys 50
```

Expected: reports tournament win rate and position distribution.

- [ ] **Step 4: Commit any fixes from smoke testing**

---

## Summary: Expected Training Workflow

### Fine-tuning from existing model (first time):
```bash
uv run train_ppo.py \
  --epochs 1000 --batch-size 2048 \
  --tourney-mode --tourney-target-score 21 \
  --expand-from ../data/published-model.pt \
  --output-dir ../data
```

### From-scratch training (future):
```bash
uv run train_ppo.py \
  --epochs 1000 --batch-size 2048 \
  --tourney-mode --tourney-target-score 21 \
  --output-dir ../data
```

Curriculum automatically handles the phasing:
- Epochs 0-200: 100% individual games (learns fundamentals, tourney features = 0)
- Epochs 200-400: ramp to 50% tournament games
- Epochs 400+: 70% tournament, 30% individual (maintains game skill)
