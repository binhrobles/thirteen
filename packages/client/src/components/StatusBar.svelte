<script lang="ts">
  import { getGameContext } from "../lib/stores/game-context.svelte.js";

  const ctx = getGameContext();
</script>

<div class="status-bar">
  {ctx.state.statusMessage}
</div>

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
