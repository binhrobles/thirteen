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
  /** Bumped on every game state mutation to trigger Svelte reactivity (class instances aren't deep-proxied) */
  stateVersion = $state(0);
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

  console.log("[game] === NEW GAME ===");
  for (let i = 0; i < hands.length; i++) {
    const label = i === HUMAN_PLAYER ? "You" : `Bot ${i}`;
    console.log(`[game] ${label}'s hand:`, hands[i].map(String).join(" "));
  }
  console.log(`[game] Starting player: ${gs.currentPlayer === HUMAN_PLAYER ? "You" : `Bot ${gs.currentPlayer}`}`);

  gs.on((event: GameEvent) => {
    switch (event.type) {
      case "turn_changed":
        console.log(`[game] Turn -> ${event.player === HUMAN_PLAYER ? "You" : `Bot ${event.player}`}`);
        break;
      case "round_reset":
        console.log(`[game] === ROUND RESET === Player ${event.player === HUMAN_PLAYER ? "You" : `Bot ${event.player}`} has power`);
        break;
      case "player_won":
        console.log(`[game] Player ${event.player === HUMAN_PLAYER ? "You" : `Bot ${event.player}`} finished in position ${event.position}`);
        break;
      case "game_over":
        console.log("[game] === GAME OVER ===", event.winOrder.map((p) => p === HUMAN_PLAYER ? "You" : `Bot ${p}`).join(" > "));
        break;
    }

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
    console.log(`[game] You tried to play ${cards.map(String).join(" ")} -> INVALID: ${result.error}`);
    game.statusMessage = result.error;
    return false;
  }

  console.log(`[game] You played: ${result.play!.toString()} (${cards.length} cards left: ${game.gameState.getHand(HUMAN_PLAYER).map(String).join(" ")})`);

  clearSelection();
  game.stateVersion++;

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
    console.log("[game] You tried to pass -> DENIED (you have power)");
    game.statusMessage = "You can't pass right now";
    return false;
  }

  console.log("[game] You passed");

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
      const result = game.gameState.playCards(player, cards);
      console.log(`[game] Bot ${player} played: ${result.play!.toString()} (${game.gameState.getHand(player).length} cards left)`);
    } else {
      game.gameState.passTurn(player);
      console.log(`[game] Bot ${player} passed`);
    }

    game.stateVersion++;
  }

  game.botThinking = false;

  if (game.gameState && !game.gameState.isGameOver()) {
    game.statusMessage = "Your turn";
  }
}
