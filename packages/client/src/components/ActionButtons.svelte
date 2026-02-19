<script lang="ts">
  import {
    game,
    playSelectedCards,
    passTurn,
    HUMAN_PLAYER,
  } from "../lib/stores/game.svelte.js";

  let canPlay = $derived(
    // stateVersion forces re-evaluation when GameState is mutated (class instances aren't deep-proxied)
    game.stateVersion >= 0 &&
    game.gameState !== null &&
    !game.gameState.isGameOver() &&
    game.gameState.currentPlayer === HUMAN_PLAYER &&
    !game.botThinking
  );

  let canPass = $derived(
    canPlay && game.gameState !== null && !game.gameState.hasPower()
  );

  let hasSelection = $derived(game.selectedCards.size > 0);

  $effect(() => {
    const gs = game.gameState;
    console.log("[buttons]", {
      canPlay,
      canPass,
      hasSelection,
      currentPlayer: gs?.currentPlayer,
      isHumanTurn: gs?.currentPlayer === HUMAN_PLAYER,
      botThinking: game.botThinking,
      isGameOver: gs?.isGameOver(),
      hasPower: gs?.hasPower(),
    });
  });
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
    gap: 2.5vw;
    padding: 1.5vh 5vw;
    justify-content: center;
    background: #111;
  }

  .btn {
    flex: 1;
    padding: 2vh 0;
    border: none;
    border-radius: 1vh;
    font-size: 3vh;
    font-family: monospace;
    font-weight: bold;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btn-play {
    background: rgba(46, 204, 64, 0.7);
    color: #111;
  }

  .btn-play:not(:disabled):hover {
    background: rgba(61, 216, 78, 0.8);
  }

  .btn-pass {
    background: rgba(204, 51, 51, 0.7);
    color: #fff;
  }

  .btn-pass:not(:disabled):hover {
    background: rgba(204, 51, 51, 0.85);
  }
</style>
