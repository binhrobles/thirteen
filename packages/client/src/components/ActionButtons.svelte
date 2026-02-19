<script lang="ts">
  import {
    game,
    playSelectedCards,
    passTurn,
    HUMAN_PLAYER,
  } from "../lib/stores/game.svelte.js";

  let canPlay = $derived(
    game.gameState !== null &&
    !game.gameState.isGameOver() &&
    game.gameState.currentPlayer === HUMAN_PLAYER &&
    !game.botThinking
  );

  let canPass = $derived(
    canPlay && game.gameState !== null && !game.gameState.hasPower()
  );

  let hasSelection = $derived(game.selectedCards.size > 0);
</script>

<div class="action-buttons">
  <button
    class="btn btn-pass"
    disabled={!canPass}
    onclick={passTurn}
  >
    Pass
  </button>
  <button
    class="btn btn-play"
    disabled={!canPlay || !hasSelection}
    onclick={playSelectedCards}
  >
    Play
  </button>
</div>

<style>
  .action-buttons {
    display: flex;
    gap: 12px;
    padding: 10px 20px;
    justify-content: center;
    background: #111;
  }

  .btn {
    padding: 12px 32px;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-family: monospace;
    font-weight: bold;
    cursor: pointer;
    min-width: 100px;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btn-play {
    background: #2ecc40;
    color: #111;
  }

  .btn-play:not(:disabled):hover {
    background: #3dd84e;
  }

  .btn-pass {
    background: #555;
    color: #fff;
  }

  .btn-pass:not(:disabled):hover {
    background: #777;
  }
</style>
