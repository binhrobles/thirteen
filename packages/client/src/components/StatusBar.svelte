<script lang="ts">
  import { getGameContext } from "../lib/stores/game-context.svelte.js";

  const ctx = getGameContext();

  // Only show status bar when it's the player's turn or there's an error,
  // and we have a message to display
  const shouldShow = $derived(
    (ctx.helpers.isYourTurn() || ctx.state.isStatusError) &&
    ctx.state.statusMessage.trim() !== ""
  );
</script>

{#if shouldShow}
  <div class="status-bar">
    {ctx.state.statusMessage}
  </div>
{/if}

<style>
  .status-bar {
    position: absolute;
    bottom: 20vh;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.5vh 3vw;
    text-align: center;
    font-family: monospace;
    font-size: 2.5vh;
    color: #fff;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 0.5em;
    pointer-events: none;
    z-index: 10;
  }
</style>
