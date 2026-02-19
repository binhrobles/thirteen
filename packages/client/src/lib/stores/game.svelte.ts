import {
  GameState,
  deal,
  choosePlay,
  type GameEvent,
} from "@thirteen/game-logic";

/** The human player's seat (always 0 in local play) */
export const HUMAN_PLAYER = 0;

class GameStore {
  selectedCards = $state<Set<number>>(new Set());
  gameState = $state<GameState | null>(null);
  winOrder = $state<number[] | null>(null);
  statusMessage = $state<string>("");
  botThinking = $state<boolean>(false);
}

export const game = new GameStore();

export function toggleCard(cardValue: number): void {
  const next = new Set(game.selectedCards);
  if (next.has(cardValue)) next.delete(cardValue);
  else next.add(cardValue);
  game.selectedCards = next;
}

export function clearSelection(): void {
  game.selectedCards = new Set();
}

export function startLocalGame(): void {
  game.winOrder = null;
  clearSelection();

  const hands = deal();
  const gs = new GameState(hands);

  gs.on((event: GameEvent) => {
    if (event.type === "game_over") {
      game.winOrder = event.winOrder;
      game.statusMessage = "Game over!";
    }
  });

  game.gameState = gs;
  game.statusMessage = `Player ${gs.currentPlayer + 1}'s turn`;

  if (gs.currentPlayer !== HUMAN_PLAYER) {
    runBotTurns();
  }
}

export function playSelectedCards(): boolean {
  if (!game.gameState) return false;
  const hand = game.gameState.getHand(HUMAN_PLAYER);
  const cards = hand.filter((c) => game.selectedCards.has(c.value));
  if (cards.length === 0) return false;

  const result = game.gameState.playCards(HUMAN_PLAYER, cards);
  if (!result.valid) {
    game.statusMessage = result.error;
    return false;
  }

  clearSelection();
  // Trigger reactivity by reassigning
  game.gameState = game.gameState;

  if (
    !game.gameState.isGameOver() &&
    game.gameState.currentPlayer !== HUMAN_PLAYER
  ) {
    runBotTurns();
  }

  return true;
}

export function passTurn(): boolean {
  if (!game.gameState) return false;
  const passed = game.gameState.passTurn(HUMAN_PLAYER);
  if (!passed) {
    game.statusMessage = "You can't pass right now";
    return false;
  }

  clearSelection();
  game.gameState = game.gameState;

  if (
    !game.gameState.isGameOver() &&
    game.gameState.currentPlayer !== HUMAN_PLAYER
  ) {
    runBotTurns();
  }

  return true;
}

async function runBotTurns(): Promise<void> {
  if (!game.gameState) return;
  game.botThinking = true;

  while (
    !game.gameState.isGameOver() &&
    game.gameState.currentPlayer !== HUMAN_PLAYER
  ) {
    const player = game.gameState.currentPlayer;
    game.statusMessage = `Player ${player + 1} is thinking...`;

    await new Promise((r) => setTimeout(r, 800));

    const hand = game.gameState.getHand(player);
    const cards = choosePlay(hand, game.gameState.lastPlay);

    if (cards.length > 0) {
      game.gameState.playCards(player, cards);
    } else {
      game.gameState.passTurn(player);
    }

    // Trigger reactivity
    game.gameState = game.gameState;
  }

  game.botThinking = false;

  if (game.gameState && !game.gameState.isGameOver()) {
    game.statusMessage = "Your turn";
  }
}
