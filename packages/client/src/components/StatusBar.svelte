<script lang="ts">
  import { game } from "../lib/stores/game.svelte.js";
</script>

<div class="status-bar">
  {game.statusMessage}
</div>

<style>
  .status-bar {
    padding: 8px 16px;
    text-align: center;
    font-family: monospace;
    font-size: 0.9rem;
    color: #fff;
    background: #111;
    min-height: 1.2em;
  }
</style>
