<script lang="ts">
  import { getGameContext } from "../lib/stores/game-context.svelte.js";

  const ctx = getGameContext();
</script>

<div class="status-bar">
  {ctx.state.statusMessage}
</div>

<style>
  .status-bar {
    padding: 1vh 4vw;
    text-align: center;
    font-family: monospace;
    font-size: 2.5vh;
    color: #fff;
    background: #111;
    min-height: 1.2em;
  }
</style>
