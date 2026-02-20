<script lang="ts">
  import { getGameContext } from "../lib/stores/game-context.svelte.js";

  const ctx = getGameContext();

  let canPlay = $derived(
    ctx.helpers.isYourTurn() && !ctx.state.isThinking
  );

  let canPass = $derived(
    ctx.helpers.canPass() && !ctx.state.isThinking
  );

  let hasSelection = $derived(ctx.state.selectedCards.size > 0);
</script>

<div class="action-buttons">
  <button
    class="btn btn-pass"
    disabled={!canPass}
    onclick={ctx.actions.pass}
  >
    Pass
  </button>
  <button
    class="btn btn-play"
    disabled={!canPlay || !hasSelection}
    onclick={ctx.actions.playCards}
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
