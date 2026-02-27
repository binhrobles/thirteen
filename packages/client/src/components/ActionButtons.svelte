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
    padding: var(--space-md) 5vw;
    justify-content: center;
    background: var(--color-bg-bar);
    border-top: 1px solid var(--color-border-subtle);
  }

  .btn {
    flex: 1;
    padding: var(--space-lg) 0;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-lg);
    font-family: var(--font-mono);
    font-weight: bold;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btn-play {
    background: var(--color-primary);
    color: var(--color-text-primary);
  }

  .btn-play:not(:disabled):hover {
    background: var(--color-primary-hover);
  }

  .btn-pass {
    background: var(--color-destructive);
    color: var(--color-text-primary);
  }

  .btn-pass:not(:disabled):hover {
    background: var(--color-destructive-hover);
  }
</style>
