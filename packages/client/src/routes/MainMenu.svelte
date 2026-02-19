<script lang="ts">
  import { navigate } from "../lib/stores/router.svelte.js";
  import { startLocalGame } from "../lib/stores/game.svelte.js";

  function handlePlay() {
    startLocalGame();
    navigate("local-game");
  }
</script>

<div class="menu">
  <h1>Tiến Lên</h1>
  <p class="subtitle">Thirteen</p>

  <div class="menu-buttons">
    <button class="btn btn-primary" onclick={handlePlay}>
      Play vs Bots
    </button>
  </div>
</div>

<style>
  .menu {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: white;
    font-family: monospace;
    background: #1a5c2a;
  }

  h1 {
    font-size: 2.5rem;
    margin: 0;
  }

  .subtitle {
    font-size: 1.2rem;
    color: #aaa;
    margin: 4px 0 40px;
  }

  .menu-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .btn {
    padding: 14px 40px;
    border: none;
    border-radius: 8px;
    font-size: 1.1rem;
    font-family: monospace;
    font-weight: bold;
    cursor: pointer;
    min-width: 200px;
  }

  .btn-primary {
    background: #2ecc40;
    color: #111;
  }

  .btn-primary:hover {
    background: #3dd84e;
  }
</style>
