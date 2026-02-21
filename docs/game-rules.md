# Tiến Lên Game Rules (House Variant)

**Read this before modifying game logic or bot behavior.**

## Basic Setup

- **4 players**, 13 cards each from standard 52-card deck
- **Card ranking:** 3 (lowest) → 2 (highest)
- **Suit ranking:** Spades < Clubs < Diamonds < Hearts
- **Card value formula:** `rank * 4 + suit` (for natural ordering; 3♠ = 0, 2♥ = 51)

## Valid Combinations

- **Single** - One card
- **Pair** - Two cards of same rank
- **Triple** - Three cards of same rank
- **Quad** - Four cards of same rank
- **Run** - 3+ consecutive cards (e.g., 3-4-5)
- **Bomb** - 3+ consecutive pairs (e.g., 3-3-4-4-5-5)

## Playing Rules

### Beating Hands
- Must play **same combo type** with higher value (compare highest card)
- **Runs have no upper bound** — can be any length, but 2s cannot appear in runs
- **Suited runs enforced** — if a suited run is played, it must be beaten by a suited run

### Chop Rules (Special Beats)
- **Quad beats single 2**
- **Bombs beat 2s by length:**
  - 3-pair bomb → beats single 2
  - 4-pair bomb → beats pair of 2s
  - 5-pair bomb → beats triple 2s

### Passing
- **Passing locks you out** of the current round until it resets
- When all other players pass, last player gets **"power"** (can play anything to start new round)

## Winning

- **First to shed all cards** wins 1st place
- **Game continues** until only 1 player remains with cards
- Final ranking: 1st, 2nd, 3rd, 4th

## Tournament Scoring

- **4/2/1/0 points** for 1st/2nd/3rd/4th place
- Play to **21 points** to win tournament
