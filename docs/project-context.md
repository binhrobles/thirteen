# Project Context

## What We're Building

A multiplayer Vietnamese card game (Tiến Lên / Thirteen) playable on mobile browsers. Players can enjoy:
- **Local play:** 1 human vs 3 greedy bots
- **Online multiplayer:** Real-time gameplay via WebSocket

**Reference codebase:** https://github.com/binhrobles/thirteen-2020 (boardgame.io/JS implementation)

## Current Features

- **Local play:** 1 human vs 3 greedy bots
- **Online multiplayer:** AWS Lambda + WebSocket API Gateway, seat-based lobbying
- **Tournament mode:** 4/2/1/0 point scoring, play to 21

## Future Work

- **RL-trained bots:** Reinforcement learning model, deployed as Lambda or similar
- **Tournament leaderboard UI:** Between-game standings display

## Tech Stack

### Client
- **Svelte 5** - Reactive framework
- **PixiJS 8** - WebGL rendering
- **TypeScript** - Type safety
- **Vite** - Build tool

### Server
- **Node.js 20** - Runtime
- **AWS Lambda** - Serverless compute
- **API Gateway WebSocket** - Real-time connections
- **DynamoDB** - Game state persistence

### Deployment
- **Client:** GitHub Actions → GitHub Pages
- **Backend:** SAM (Serverless Application Model)
