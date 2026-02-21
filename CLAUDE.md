# Agent Instructions

**Tiến Lên (Thirteen)** — a mobile-first card game built with Svelte + PixiJS (web client) and Node.js (AWS Lambda backend).

## Package Manager

This is a **yarn** monorepo:
- `packages/game-logic` - TypeScript game rules
- `packages/client` - Svelte + PixiJS web client
- `packages/server` - Node.js Lambda handlers
- `backend/` - SAM template for AWS infrastructure

## Quick Reference

```bash
# Development
yarn install                              # Install dependencies
yarn workspace @thirteen/game-logic test  # Run game logic tests
yarn workspace @thirteen/client dev       # Start dev server (localhost:5173)
yarn workspace @thirteen/client build     # Build for production
```

## Issue Tracking

Use **bd** (beads) for issue tracking **only when explicitly asked** to file and work off beads. Do not create beads for one-off requests.

Run `bd prime` for session close protocol and full workflow guide.

## Detailed Documentation

- **[Game Rules](docs/game-rules.md)** - Tiến Lên card game rules (read before modifying game logic)
- **[UX Guidelines](docs/ux-guidelines.md)** - Mobile-first design principles (read before modifying client UI)
- **[Project Context](docs/project-context.md)** - Features, roadmap, tech stack details
- **[Multiplayer Architecture](docs/multiplayer-architecture.md)** - WebSocket API, Lambda handlers, DynamoDB schema (read before modifying server)
