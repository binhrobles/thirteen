# Building Thirteen Vibes

## Prerequisites

- Node.js 20+
- yarn (`npm install -g yarn`)
- AWS CLI + SAM CLI (for backend deployment)

## Client (Svelte + PixiJS)

```bash
# Install dependencies
yarn install

# Development server (localhost:5173)
yarn workspace @thirteen/client dev

# Build for production
yarn workspace @thirteen/client build

# Preview production build
yarn workspace @thirteen/client preview
```

Built files go to `packages/client/dist/`.

## Game Logic

```bash
# Run tests
yarn workspace @thirteen/game-logic test

# Build (transpile TypeScript)
yarn workspace @thirteen/game-logic build
```

## Server (AWS Lambda)

```bash
# Build Lambda handlers
yarn workspace @thirteen/server build

# Local testing with SAM
cd backend
sam build
sam local start-api

# Deploy to AWS
sam deploy --guided  # First time
sam deploy           # Subsequent deploys
```

## CI/CD

GitHub Actions automatically:
1. Builds and deploys client to GitHub Pages on push to main
2. Deploys backend via SAM on push to main

See `.github/workflows/` for workflow definitions.

## Testing Locally

### Client
```bash
yarn workspace @thirteen/client dev
# Open http://localhost:5173 in browser
```

### Backend (with SAM)
```bash
cd backend
sam build && sam local start-api
# Use wscat to test WebSocket: wscat -c ws://localhost:3001
```

## Mobile Testing

- Use Chrome DevTools Device Emulator for quick testing
- For real device testing:
  - Find your local IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
  - Start dev server: `yarn workspace @thirteen/client dev --host`
  - Navigate to `http://<your-ip>:5173` on mobile browser
