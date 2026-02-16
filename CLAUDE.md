# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Project Overview

**Tiến Lên (Thirteen)** -- a mobile-first card game built with Godot 4 (web export).

### What We're Building

A multiplayer Vietnamese card game (Tiến Lên / Thirteen) playable on mobile browsers. The MVP is single-game, 1 human vs 3 bots, with placeholder art.

**Reference codebase:** https://github.com/binhrobles/thirteen (boardgame.io/JS implementation of the same game)

### Game Rules (House Variant)

- **4 players**, 13 cards each from standard 52-card deck
- **Card ranking:** 3 (lowest) → 2 (highest). Suits: Spades < Clubs < Diamonds < Hearts
- **Card value:** `rank * 4 + suit` (for natural ordering; 3♠ = 0, 2♥ = 51)
- **Valid combos:** Single, Pair, Triple, Quad, Run (3+ consecutive), Bomb (3+ consecutive pairs)
- **Beating:** Must play same combo type with higher value (compare highest card)
- **Runs go indefinitely** -- no upper bound on length, but 2s cannot appear in runs
- **Suited runs enforced** -- if a suited run is played, it must be beaten by a suited run
- **No opening with bombs** -- can't lead a round with a bomb
- **Chop rules:** Quad beats single 2. Bombs beat 2s by length (3-pair → single 2, 4-pair → pair of 2s, 5-pair → triple 2s)
- **Passing:** locks you out of the round until it resets. When all others pass, last player gets "power" (can play anything)
- **Winning:** first to shed all cards is 1st, game continues until 1 player remains

### Future Phases (not yet tracked in beads)

- **Online multiplayer:** AWS Lambda + WebSocket API Gateway, seat-based lobbying
- **Tournament mode:** 4/2/1/0 point scoring, play to 21
- **RL-trained bots:** reinforcement learning model, deployed as Lambda or similar

### Tech Stack

- **Engine:** Godot 4, GDScript
- **Target:** Web (HTML5 export), mobile-first portrait orientation
- **Backend (future):** AWS serverless (Lambda + API Gateway WebSocket)

### UX Principles

- One-hand, vertical mobile experience
- Player hand at bottom (horizontal scroll or drawer for 13 cards)
- Last played hand prominent in center; tap for round history
- Cards must shrink to fit large hands (10+ cards in a run)

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed):
   - For Godot: Use `mcp__godot__run_project` to compile and check for errors
   - Tests, linters, builds
   - Fix any errors before proceeding
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

