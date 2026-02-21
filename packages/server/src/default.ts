import {
  Card,
  GameState,
  TourneyStatus,
  executeBotTurns,
  type Tourney,
} from "@thirteen/game-logic";
import {
  getConnection,
  getOrCreateTourney,
  saveTourney,
  updateConnectionPing,
} from "./lib/dynamo.js";
import type { WebSocketEvent, LambdaResult } from "./lib/types.js";
import {
  broadcastGameOver,
  broadcastGameStarted,
  broadcastGameUpdate,
  broadcastTourneyUpdate,
  initApiClient,
  sendError,
  sendToConnection,
} from "./lib/websocket.js";

export async function handler(event: WebSocketEvent): Promise<LambdaResult> {
  const connectionId = event.requestContext.connectionId;
  const { domainName, stage } = event.requestContext;
  initApiClient(domainName, stage);

  try {
    const body = JSON.parse(event.body ?? "{}");
    const action: string | undefined = body.action;
    const payload: Record<string, unknown> = body.payload ?? {};

    console.log(`Received action: ${action} from ${connectionId}`);

    const connection = await getConnection(connectionId);
    if (!connection) {
      await sendError(connectionId, "UNAUTHORIZED", "Connection not found");
      return { statusCode: 200 };
    }

    const { playerId, playerName } = connection;

    switch (action) {
      case "ping":
        return handlePing(connectionId, payload);
      case "tourney/info":
        return handleTourneyInfo(connectionId);
      case "tourney/reconnect":
        return handleReconnect(connectionId, playerId, payload);
      case "tourney/claim_seat":
        return handleClaimSeat(connectionId, playerId, playerName, payload);
      case "tourney/leave":
        return handleLeaveTourney(connectionId, playerId);
      case "tourney/ready":
        return handleReady(connectionId, playerId);
      case "tourney/add_bot":
        return handleAddBot(connectionId, payload);
      case "tourney/kick_bot":
        return handleKickBot(connectionId, payload);
      case "game/play":
        return handlePlayCards(connectionId, playerId, payload);
      case "game/pass":
        return handlePass(connectionId, playerId);
      case "debug/quick_start":
        return handleDebugQuickStart(connectionId, playerId, playerName, payload);
      case "debug/reset":
        return handleDebugReset(connectionId);
      default:
        await sendError(connectionId, "UNKNOWN_ACTION", `Unknown action: ${action}`);
        return { statusCode: 200 };
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      await sendError(connectionId, "INVALID_JSON", "Invalid JSON in message body");
    } else {
      console.error("Error handling message:", err);
      await sendError(connectionId, "INTERNAL_ERROR", "Internal server error");
    }
    return { statusCode: 200 };
  }
}

// ── Action handlers ──

async function handlePing(
  connectionId: string,
  payload: Record<string, unknown>,
): Promise<LambdaResult> {
  const timestamp = (payload.timestamp as number) ?? 0;
  await updateConnectionPing(connectionId, timestamp);
  await sendToConnection(connectionId, {
    type: "pong",
    payload: { timestamp },
  });
  return { statusCode: 200 };
}

async function handleTourneyInfo(connectionId: string): Promise<LambdaResult> {
  const tourney = await getOrCreateTourney();
  if (tourney.cleanupDisconnectedPlayers(5)) {
    await saveTourney(tourney);
  }
  await sendToConnection(connectionId, {
    type: "tourney/updated",
    payload: tourney.toClientState() as Record<string, unknown>,
  });
  return { statusCode: 200 };
}

async function handleReconnect(
  connectionId: string,
  playerId: string,
  payload: Record<string, unknown>,
): Promise<LambdaResult> {
  const seatPosition = payload.seatPosition as number | undefined;

  // Validate seat position
  if (seatPosition === undefined || seatPosition < 0 || seatPosition >= 4) {
    await sendError(connectionId, "INVALID_SEAT", "Invalid seat position");
    return { statusCode: 200 };
  }

  const tourney = await getOrCreateTourney();
  const seat = tourney.seats[seatPosition];

  // Check if seat is empty (game was reset)
  if (seat.isEmpty()) {
    await sendError(connectionId, "SEAT_NOT_FOUND", "Seat is empty (game may have been reset)");
    return { statusCode: 200 };
  }

  // Security check: verify player ID matches
  if (seat.playerId !== playerId) {
    await sendError(connectionId, "SEAT_TAKEN", "Seat is occupied by another player");
    return { statusCode: 200 };
  }

  // Update connection ID and clear disconnect timestamp
  seat.connectionId = connectionId;
  seat.disconnectedAt = undefined;

  await saveTourney(tourney);

  console.log(`Player ${playerId} reconnected to seat ${seatPosition} (status: ${tourney.status})`);

  // Send appropriate response based on tourney state
  if (tourney.status === TourneyStatus.IN_PROGRESS && tourney.currentGame) {
    // Send full game state for active game
    const game = GameState.fromSnapshot(
      tourney.currentGame as unknown as ReturnType<GameState["toSnapshot"]>,
    );

    // Send game/started with initial state
    const playerNames = tourney.seats.map((s) => s.playerName ?? "Empty");
    const yourHand = game.hands[seatPosition].map((c) => ({
      rank: c.rank,
      suit: c.suit,
      value: c.value,
    }));

    // Send game/started with CURRENT state (not initial state)
    // This is important for reconnection - we need accurate counts/passed status
    await sendToConnection(connectionId, {
      type: "game/started",
      payload: {
        yourPosition: seatPosition,
        yourHand,
        currentPlayer: game.currentPlayer,
        players: playerNames,
        // Include current state so UI doesn't flash with wrong values
        passedPlayers: game.passedPlayers,
        handCounts: game.hands.map((h) => h.length),
      },
    });

    // Send game/updated with current state
    await sendToConnection(connectionId, {
      type: "game/updated",
      payload: {
        currentPlayer: game.currentPlayer,
        lastPlay: game.lastPlay
          ? {
              combo: game.lastPlay.combo,
              cards: game.lastPlay.cards.map((c) => ({
                rank: c.rank,
                suit: c.suit,
                value: c.value,
              })),
              suited: game.lastPlay.suited,
            }
          : null,
        passedPlayers: game.passedPlayers,
        handCounts: game.hands.map((h) => h.length),
        yourHand,
      },
    });
  } else if (
    tourney.status === TourneyStatus.BETWEEN_GAMES ||
    tourney.status === TourneyStatus.COMPLETED
  ) {
    // Send tourney update with scores
    await sendToConnection(connectionId, {
      type: "tourney/updated",
      payload: tourney.toClientState() as Record<string, unknown>,
    });

    // If just completed, also send game over
    if (tourney.status === TourneyStatus.COMPLETED && tourney.gameHistory.length > 0) {
      const lastGame = tourney.gameHistory[tourney.gameHistory.length - 1] as {
        winOrder: number[];
        pointsAwarded: number[];
      };
      const leaderboard = tourney.getLeaderboard();
      const winner = leaderboard[0].position;

      await sendToConnection(connectionId, {
        type: "game/over",
        payload: {
          winOrder: lastGame.winOrder,
          pointsAwarded: lastGame.pointsAwarded,
          leaderboard: leaderboard.map((entry) => ({
            name: entry.playerName ?? "Unknown",
            score: entry.totalScore,
          })),
          tourneyComplete: true,
          winner,
        },
      });
    }
  } else {
    // WAITING or STARTING - just send tourney update
    await sendToConnection(connectionId, {
      type: "tourney/updated",
      payload: tourney.toClientState() as Record<string, unknown>,
    });
  }

  // Broadcast updated tourney state to all players (shows reconnection)
  await broadcastTourneyUpdate(tourney);

  return { statusCode: 200 };
}

async function handleClaimSeat(
  connectionId: string,
  playerId: string,
  playerName: string,
  payload: Record<string, unknown>,
): Promise<LambdaResult> {
  const tourney = await getOrCreateTourney();
  tourney.cleanupDisconnectedPlayers(5);

  const seatPosition = payload.seatPosition as number | undefined;
  const [success, errorCode] = tourney.claimSeat(
    playerId,
    playerName,
    connectionId,
    seatPosition,
  );

  if (!success) {
    await sendError(connectionId, errorCode, `Failed to claim seat: ${errorCode}`);
    return { statusCode: 200 };
  }

  // Clear disconnect timestamp if reconnecting
  const seat = tourney.getSeatByPlayer(playerId);
  if (seat) seat.disconnectedAt = undefined;

  await saveTourney(tourney);
  await broadcastTourneyUpdate(tourney);
  return { statusCode: 200 };
}

async function handleLeaveTourney(
  connectionId: string,
  playerId: string,
): Promise<LambdaResult> {
  const tourney = await getOrCreateTourney();
  const [success, errorCode] = tourney.leaveTourney(playerId);

  if (!success) {
    await sendError(connectionId, errorCode, `Failed to leave: ${errorCode}`);
    return { statusCode: 200 };
  }

  await saveTourney(tourney);
  await broadcastTourneyUpdate(tourney);
  return { statusCode: 200 };
}

async function handleReady(
  connectionId: string,
  playerId: string,
): Promise<LambdaResult> {
  const tourney = await getOrCreateTourney();
  const [success, errorCode] = tourney.setReady(playerId, true);

  if (!success) {
    await sendError(connectionId, errorCode, `Failed to ready up: ${errorCode}`);
    return { statusCode: 200 };
  }

  await saveTourney(tourney);
  await broadcastTourneyUpdate(tourney);

  // If all ready, start the game
  if (tourney.status === TourneyStatus.IN_PROGRESS && !tourney.currentGame) {
    const game = tourney.startGame();
    await broadcastGameStarted(tourney, game);

    // Run bot turns if starting player is a bot
    const seatData = tourney.seats.map((s) => s.toDict());
    const botMoves = executeBotTurns(seatData, game);
    for (const _move of botMoves) {
      await broadcastGameUpdate(tourney, game);
    }

    tourney.currentGame = game.toSnapshot() as unknown as Record<string, unknown>;
    await saveTourney(tourney);
  }

  return { statusCode: 200 };
}

async function handleAddBot(
  connectionId: string,
  payload: Record<string, unknown>,
): Promise<LambdaResult> {
  const seatPosition = payload.seatPosition as number | undefined;
  if (seatPosition === undefined) {
    await sendError(connectionId, "MISSING_SEAT_POSITION", "seatPosition is required");
    return { statusCode: 200 };
  }

  const tourney = await getOrCreateTourney();
  const botProfile = payload.botProfile as string | undefined;
  const [success, errorCode] = tourney.addBot(seatPosition, botProfile);

  if (!success) {
    await sendError(connectionId, errorCode, `Failed to add bot: ${errorCode}`);
    return { statusCode: 200 };
  }

  await saveTourney(tourney);
  await broadcastTourneyUpdate(tourney);
  return { statusCode: 200 };
}

async function handleKickBot(
  connectionId: string,
  payload: Record<string, unknown>,
): Promise<LambdaResult> {
  const seatPosition = payload.seatPosition as number | undefined;
  if (seatPosition === undefined) {
    await sendError(connectionId, "MISSING_SEAT_POSITION", "seatPosition is required");
    return { statusCode: 200 };
  }

  const tourney = await getOrCreateTourney();
  const [success, errorCode] = tourney.kickBot(seatPosition);

  if (!success) {
    await sendError(connectionId, errorCode, `Failed to kick bot: ${errorCode}`);
    return { statusCode: 200 };
  }

  await saveTourney(tourney);
  await broadcastTourneyUpdate(tourney);
  return { statusCode: 200 };
}

async function handlePlayCards(
  connectionId: string,
  playerId: string,
  payload: Record<string, unknown>,
): Promise<LambdaResult> {
  const tourney = await getOrCreateTourney();

  if (tourney.status !== TourneyStatus.IN_PROGRESS || !tourney.currentGame) {
    await sendError(connectionId, "NO_ACTIVE_GAME", "No active game");
    return { statusCode: 200 };
  }

  const seat = tourney.getSeatByPlayer(playerId);
  if (!seat) {
    await sendError(connectionId, "NOT_IN_TOURNEY", "Not in tournament");
    return { statusCode: 200 };
  }

  const cardsData = (payload.cards ?? []) as Array<{ rank: number; suit: number; value: number }>;
  const cards = cardsData.map((c) => Card.fromValue(c.value));

  const game = GameState.fromSnapshot(
    tourney.currentGame as unknown as ReturnType<GameState["toSnapshot"]>,
  );

  const result = game.canPlay(seat.position, cards);
  if (!result.valid) {
    await sendError(connectionId, result.error, `Invalid play: ${result.error}`);
    return { statusCode: 200 };
  }

  game.playCards(seat.position, cards);
  await broadcastGameUpdate(tourney, game);

  // Run bot turns
  const seatData = tourney.seats.map((s) => s.toDict());
  const botMoves = executeBotTurns(seatData, game);
  for (const _move of botMoves) {
    await broadcastGameUpdate(tourney, game);
  }

  await finishMove(tourney, game);
  return { statusCode: 200 };
}

async function handlePass(
  connectionId: string,
  playerId: string,
): Promise<LambdaResult> {
  const tourney = await getOrCreateTourney();

  if (tourney.status !== TourneyStatus.IN_PROGRESS || !tourney.currentGame) {
    await sendError(connectionId, "NO_ACTIVE_GAME", "No active game");
    return { statusCode: 200 };
  }

  const seat = tourney.getSeatByPlayer(playerId);
  if (!seat) {
    await sendError(connectionId, "NOT_IN_TOURNEY", "Not in tournament");
    return { statusCode: 200 };
  }

  const game = GameState.fromSnapshot(
    tourney.currentGame as unknown as ReturnType<GameState["toSnapshot"]>,
  );

  if (!game.passTurn(seat.position)) {
    await sendError(connectionId, "CANT_PASS", "Cannot pass");
    return { statusCode: 200 };
  }

  await broadcastGameUpdate(tourney, game);

  // Run bot turns
  const seatData = tourney.seats.map((s) => s.toDict());
  const botMoves = executeBotTurns(seatData, game);
  for (const _move of botMoves) {
    await broadcastGameUpdate(tourney, game);
  }

  await finishMove(tourney, game);
  return { statusCode: 200 };
}

async function handleDebugReset(connectionId: string): Promise<LambdaResult> {
  const tourney = new (await import("@thirteen/game-logic")).Tourney();
  await saveTourney(tourney);
  await broadcastTourneyUpdate(tourney);
  console.log("[DEBUG] Tourney reset to empty WAITING state");
  await sendToConnection(connectionId, {
    type: "debug/reset",
    payload: { message: "Tourney reset" },
  });
  return { statusCode: 200 };
}

async function handleDebugQuickStart(
  connectionId: string,
  playerId: string,
  playerName: string,
  payload: Record<string, unknown>,
): Promise<LambdaResult> {
  // Fresh tourney
  const { Tourney: TourneyClass } = await import("@thirteen/game-logic");
  const tourney = new TourneyClass();
  await saveTourney(tourney);

  const seatPosition = (payload.seatPosition as number) ?? 0;
  const [success, errorCode] = tourney.claimSeat(
    playerId,
    playerName,
    connectionId,
    seatPosition,
  );
  if (!success) {
    await sendError(connectionId, errorCode, `Failed to claim seat: ${errorCode}`);
    return { statusCode: 200 };
  }

  // Fill with bots
  for (let i = 0; i < 4; i++) {
    if (tourney.seats[i].isEmpty()) tourney.addBot(i);
  }

  tourney.setReady(playerId, true);

  const game = tourney.startGame();

  await broadcastTourneyUpdate(tourney);
  await broadcastGameStarted(tourney, game);

  // Run bot turns if starting player is a bot
  const seatData = tourney.seats.map((s) => s.toDict());
  const botMoves = executeBotTurns(seatData, game);
  for (const _move of botMoves) {
    await broadcastGameUpdate(tourney, game);
  }

  tourney.currentGame = game.toSnapshot() as unknown as Record<string, unknown>;
  await saveTourney(tourney);

  console.log(
    `[DEBUG] Quick start: ${playerName} in seat ${seatPosition} with 3 bots, ${botMoves.length} bot moves`,
  );
  return { statusCode: 200 };
}

// ── Helpers ──

async function finishMove(tourney: Tourney, game: GameState): Promise<void> {
  tourney.currentGame = game.toSnapshot() as unknown as Record<string, unknown>;

  if (game.isGameOver()) {
    const [, tourneyComplete] = tourney.completeGame(game.winOrder);
    await saveTourney(tourney);
    await broadcastGameOver(tourney, game.winOrder, tourneyComplete);
    // Send updated tourney state with new scores and reset ready status
    await broadcastTourneyUpdate(tourney);
  } else {
    await saveTourney(tourney);
  }
}
