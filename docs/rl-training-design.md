# RL Training Infrastructure Design

Design for training intelligent bots using reinforcement learning and imitation learning for Tiến Lên.

## 1. State Representation (Observation Space)

A fixed-size tensor encoding the game state from the perspective of the acting player. All indices are relative to the acting player (player 0 = self).

### Feature Vector Layout

| Feature | Size | Encoding | Notes |
|---------|------|----------|-------|
| Own hand | 52 | Binary (0/1 per card) | Cards currently held |
| Cards played (total) | 52 | Binary (0/1 per card) | All cards seen on the table so far |
| Cards played by each opponent | 52 × 3 = 156 | Binary per opponent | Which cards each opponent has played |
| Opponent hand sizes | 3 | Normalized (0-1, divided by 13) | How many cards each opponent holds |
| Last play cards | 52 | Binary (0/1 per card) | Cards in the current trick to beat |
| Last play combo type | 8 | One-hot (7 combos + null/power) | SINGLE, PAIR, TRIPLE, QUAD, RUN, BOMB, INVALID, POWER |
| Last play suited | 1 | Binary | Whether last play was a suited run |
| Last played by (relative) | 4 | One-hot (self + 3 opponents) | Who made the last play |
| Players passed this round | 4 | Binary per player | Who has passed |
| Players still in game | 4 | Binary per player | Who hasn't won yet |
| Win order filled | 4 | Binary per position | Which finish positions are taken |
| **Total** | **~337** | | |

### Card Encoding

Cards use their existing `value` (0-51) as indices into 52-element binary vectors:
- `value = rank * 4 + suit`
- 3♠ = 0 (lowest), 2♥ = 51 (highest)

### Relative Player Indexing

All opponent features are rotated so the acting player is always index 0. This lets the model learn position-independent strategies:
- Slot 0: self (acting player)
- Slot 1: next player (left, plays after us)
- Slot 2: across
- Slot 3: previous player (right, plays before us)

## 2. Action Space

### Approach: Valid Action Masking

Rather than encoding card subsets directly, enumerate all valid plays at each decision point and let the model pick from them.

**At each turn:**
1. Call `evaluate(hand, lastPlay)` to get all valid plays
2. Add "pass" as an additional action (when `lastPlay !== null`)
3. Model outputs a score for each valid action
4. Apply softmax over valid actions only (masked policy)

### Action Representation for the Model

Each candidate action is encoded as a fixed-size feature vector:

| Feature | Size | Encoding |
|---------|------|----------|
| Cards in play | 52 | Binary (which cards are played) |
| Combo type | 7 | One-hot |
| Combo size | 1 | Normalized (num cards / 13) |
| Highest card value | 1 | Normalized (value / 51) |
| Is suited | 1 | Binary |
| Is pass | 1 | Binary |
| **Total** | **63** | |

**Architecture choice:** The model scores each (state, action) pair. State is encoded once, each candidate action is encoded, and a small network scores each pair. This handles the variable action count naturally.

### Typical Action Counts

- Opening (power): 20-60 valid plays
- Responding to single: 5-15 valid plays
- Responding to pair/run: 2-10 valid plays
- Late game: 1-5 valid plays

## 3. Reward Design

### Variant A: Position Rewards (Primary — PPO)

Sparse reward at game end based on finish position:

| Position | Reward |
|----------|--------|
| 1st | +4 |
| 2nd | +2 |
| 3rd | +1 |
| 4th | 0 |

Matches the tournament scoring system. Zero-sum when normalized.

### Variant B: Simple Win/Lose (Vanilla RL)

| Outcome | Reward |
|---------|--------|
| Win (1st) | +1 |
| Not win | 0 |

### Reward Shaping (Optional, for faster convergence)

Small intermediate signals, added to the terminal reward:

| Signal | Reward | Rationale |
|--------|--------|-----------|
| Play cards (per card) | +0.01 | Encourages shedding cards |
| Win a trick (gain power) | +0.02 | Encourages board control |
| Pass | 0 | Neutral |
| Opponent wins before you | -0.01 | Urgency signal |

Keep shaping rewards small (< 5% of terminal reward) to avoid distorting the learned policy.

## 4. Model Architecture

### Network Design

```
State encoder (shared):
  Linear(337, 256) → ReLU → Linear(256, 128) → ReLU
  Output: state_embedding (128-dim)

Action encoder:
  Linear(63, 64) → ReLU
  Output: action_embedding (64-dim)

Scorer:
  Concat(state_embedding, action_embedding) → Linear(192, 64) → ReLU → Linear(64, 1)
  Output: score (scalar per action)

Value head (for PPO):
  Linear(128, 64) → ReLU → Linear(64, 1)
  Output: V(s) state value estimate
```

**Parameter count:** ~120K — small enough for fast ONNX inference in Lambda and client.

### Why This Architecture

- **State-action scoring** handles variable action counts without padding
- **Shared state encoder** amortizes computation across actions
- **Separate value head** for advantage estimation in PPO
- **Small model** keeps inference under 5ms for real-time play

## 5. Training Variants

### 5A. Imitation Learning (Behavioral Cloning)

**Purpose:** Pipeline validation and benchmark, **not** a warm-start for PPO.

**Data source:** Games played by the greedy bot (and later, human tournament logs).

**Training:**
1. Collect (state, action_chosen) pairs from game logs
2. Encode state and all valid actions at each decision point
3. Train with cross-entropy loss: maximize log-probability of the chosen action

**Why not warm-start PPO with the imitation model?** Initializing PPO from greedy-cloned weights risks getting stuck in the greedy bot's style. PPO might over-index on greedy patterns (always play lowest card) and never discover better strategies like holding 2s for control or strategic passing. The model is small (~120K params) and the game is simple enough that PPO should converge from random initialization. If PPO struggles to learn basic play after extended training, warm-starting remains a fallback.

**Role of the imitation model:**
1. Validates the full pipeline end-to-end (encoders → training → ONNX export → inference)
2. Becomes a benchmark opponent in the self-play pool (Section 5D)
3. Provides a known-quality baseline for Elo comparisons

### 5B. PPO with Position Rewards

**Algorithm:** Proximal Policy Optimization (PPO-Clip)

**Training loop:**
1. Self-play: 4 copies of current policy play a game
2. Collect trajectories: (state, action, reward, next_state) for each player
3. Compute advantages using GAE (λ=0.95, γ=0.99)
4. Update policy with clipped surrogate objective (ε=0.2)
5. Update value function with MSE loss
6. Repeat for N epochs per batch

**Hyperparameters (starting point):**
- Learning rate: 3e-4 (Adam)
- Batch size: 2048 moves (across ~150 games)
- PPO epochs: 4
- Clip ratio: 0.2
- Entropy coefficient: 0.01 (encourage exploration)

### 5C. Vanilla RL (REINFORCE)

Simpler baseline for comparison:
1. Self-play games to completion
2. Apply win/lose reward to all actions in episode
3. Policy gradient update with baseline subtraction
4. No value function needed

### 5D. Self-Play Data Generation

**Infrastructure:**
1. Pool of N policy checkpoints (initially: random + greedy bots)
2. Each game: sample 4 players from the pool (with replacement)
3. Newest checkpoint gets 50% of seats (prioritize improving it)
4. Store all games for replay analysis
5. Periodically add new checkpoints to the pool as training progresses

**Seed opponents:**
- **Deterministic greedy bot** — the existing `choosePlay()`, always plays lowest valid card. Used as the fixed benchmark for Elo measurement (deterministic = reproducible results).
- **Epsilon-greedy bot** — same strategy but with probability ε (e.g., 0.1) plays a random valid move instead. Prevents PPO from overfitting to one predictable pattern early in training.
- **Random bot** — picks uniformly from valid plays. Provides maximum diversity.

**Why not add strategic heuristics (e.g., 2-preservation) to the greedy bot?** Discovering strategies like holding 2s for board control is exactly what RL training should learn on its own. Hand-coding heuristics biases the training toward strategies we *think* are good. The bot might find approaches we wouldn't think of. Keep seed opponents simple; let RL provide the intelligence.

**Elo tracking:** Rate each checkpoint against the deterministic greedy bot to track improvement over time.

## 6. Training Framework

### Recommendation: PyTorch

| Factor | PyTorch | TensorFlow |
|--------|---------|------------|
| RL ecosystem | Stable Baselines3, CleanRL, TorchRL | TF-Agents (less maintained) |
| ONNX export | `torch.onnx.export()` — mature | `tf2onnx` — works but extra step |
| Debug experience | Eager mode, standard Python | Eager mode available but less natural |
| Community | Dominant in RL research | Declining for RL |

**Dependencies:**
- `torch` — core framework
- `onnx`, `onnxruntime` — export and validation
- No need for Stable Baselines3 initially — custom PPO is ~200 lines for this action space

## 7. ONNX Deployment

### Export Pipeline

```
PyTorch model
  → torch.onnx.export(model, dummy_input, "bot.onnx")
  → onnxruntime validation
  → Upload to S3 (Lambda) / bundle in client
```

### Inference Wrapper

```typescript
// packages/game-logic/src/bot/rl-bot.ts (future)
class RLBot implements BotStrategy {
  private session: ort.InferenceSession;

  async choosePlay(hand: Card[], lastPlay: Play | null, state: GameStateSnapshot): Promise<Card[]> {
    const stateFeatures = encodeState(state, playerIndex);
    const validPlays = getAllPlays(evaluate(hand, lastPlay));
    const actionFeatures = validPlays.map(encodeAction);

    // Score each (state, action) pair
    const scores = await this.scoreActions(stateFeatures, actionFeatures);

    // Pick highest-scoring action
    const bestIdx = argmax(scores);
    return bestIdx === validPlays.length ? [] : validPlays[bestIdx]; // [] = pass
  }
}
```

### Deployment Targets

| Target | Runtime | Model Size | Latency Target |
|--------|---------|------------|----------------|
| Lambda (server bots) | `onnxruntime-node` | ~500KB | < 50ms |
| Web client (local bots) | `onnxruntime-web` (WASM) | ~500KB | < 20ms |

## 8. Data Collection / Game Logger

### Training Data Format (JSONL)

Each line is one complete game:

```jsonl
{
  "game_id": "uuid",
  "timestamp": "2026-03-01T...",
  "players": ["greedy", "greedy", "greedy", "greedy"],
  "winner": 2,
  "win_order": [2, 0, 3, 1],
  "moves": [
    {
      "state": { <GameStateSnapshot> },
      "player": 0,
      "action": "play",
      "cards": [{"rank": 0, "suit": 0, "value": 0}],
      "valid_actions": [[{"rank": 0, "suit": 0, "value": 0}], ...],
      "valid_action_count": 23
    },
    {
      "state": { <GameStateSnapshot> },
      "player": 3,
      "action": "pass",
      "cards": [],
      "valid_actions": [...],
      "valid_action_count": 5
    }
  ]
}
```

### Logger Implementation

A wrapper around `GameState` that records snapshots before each decision:

```typescript
// packages/game-logic/src/training/game-logger.ts (future)
class GameLogger {
  private moves: LoggedMove[] = [];

  logDecision(state: GameStateSnapshot, player: number, action: Card[], validPlays: Card[][]) {
    this.moves.push({
      state: structuredClone(state),
      player,
      action: action.length > 0 ? "play" : "pass",
      cards: action.map(c => c.toData()),
      valid_actions: validPlays.map(p => p.map(c => c.toData())),
      valid_action_count: validPlays.length + 1, // +1 for pass
    });
  }

  toJSON(): GameLog { ... }
}
```

### Data Generation Script

```bash
# Generate 100K games of greedy-vs-greedy for imitation learning baseline
yarn workspace @thirteen/game-logic run generate-training-data --games=100000 --players=greedy,greedy,greedy,greedy --output=data/greedy-100k.jsonl
```

## 9. Training Package Structure

New package in the monorepo:

```
packages/training/
├── package.json
├── src/
│   ├── features/
│   │   ├── state-encoder.ts      # Encode GameStateSnapshot → float[]
│   │   └── action-encoder.ts     # Encode Card[] → float[]
│   ├── data/
│   │   ├── game-logger.ts        # Record training data during play
│   │   └── generate.ts           # CLI: mass game simulation
│   └── export/
│       └── validate-onnx.ts      # Verify exported model matches PyTorch
├── python/
│   ├── requirements.txt          # torch, onnx, onnxruntime
│   ├── model.py                  # Network architecture
│   ├── train_imitation.py        # Behavioral cloning
│   ├── train_ppo.py              # PPO self-play
│   ├── train_reinforce.py        # Vanilla RL
│   ├── export_onnx.py            # PyTorch → ONNX
│   └── evaluate.py               # Elo rating / benchmarks
└── data/                         # .gitignored, training data lives here
```

The TypeScript side handles data generation and ONNX validation. The Python side handles training and export. They share the feature encoding spec (documented in this file, implemented in both languages).

## 10. Implementation Order

1. **State & action encoders** (`packages/training/src/features/`) — TypeScript, tested against known game states
2. **Game logger** (`packages/training/src/data/game-logger.ts`) — wraps GameState, outputs JSONL
3. **Data generation script** — simulate 100K greedy-vs-greedy games
4. **Python model + imitation training** — train on greedy data, export ONNX
5. **ONNX integration** — `RLBot` class using onnxruntime, verify it plays valid moves
6. **PPO self-play training** — train with position rewards
7. **Evaluation harness** — pit models against greedy bot and each other, track Elo
8. **Deploy to Lambda** — serve RL bot in multiplayer games
