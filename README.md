# Thirteen Vibes

A mobile-first [Tiến Lên (Thirteen)](https://en.wikipedia.org/wiki/Ti%E1%BA%BFn_l%C3%AAn) card game.

## Status

**Play now:** [GitHub Pages](https://binhrobles.github.io/thirteen-vibes/) (auto-deploys from main)

Early development. See `bd ready` for current work items.

## Tech Stack

- **Client:** Svelte 5 + PixiJS 8 + TypeScript
- **Server:** Node.js 20 + AWS Lambda + API Gateway WebSocket + DynamoDB
- **Deploy:** GitHub Actions → GitHub Pages (client) + SAM (backend)

## The Game

4-player Vietnamese climbing card game. Cards rank 3 (low) to 2 (high), suits Spades < Clubs < Diamonds < Hearts. Play singles, pairs, triples, runs, quads, and bombs to shed your hand first.

## Development

```bash
# Install dependencies
yarn install

# Run game-logic tests
yarn workspace @thirteen/game-logic test

# Start client dev server
yarn workspace @thirteen/client dev

# Build client
yarn workspace @thirteen/client build
```

## Issue Tracking

```bash
bd ready        # See available work
bd show <id>    # View issue details
bd sync         # Sync with git
```

## Monorepo Structure

```
packages/
  game-logic/   # TypeScript game rules (Card, Play, GameState, etc.)
  client/       # Svelte + PixiJS web client
  server/       # Node.js Lambda handlers
backend/        # SAM template for AWS infrastructure
assets/         # Shared assets (card sprites)
```

## Assets & Attribution

**Card Sprites:**
[Jorel's Card Pack by Jorel](https://games-by-jorel.itch.io/jorels-card-pack) (96x128px pixel art)

**Settings Icon:**
[Settings Cog Line Icon](https://www.svgrepo.com/svg/376667/settings-cog-line) from SVG Repo
