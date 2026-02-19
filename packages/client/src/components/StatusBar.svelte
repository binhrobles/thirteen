<script lang="ts">
  import { game } from "../lib/stores/game.svelte.js";
</script>

<div class="status-bar">
  {game.statusMessage}
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
