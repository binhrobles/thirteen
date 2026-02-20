<script lang="ts">
  import { navigate } from "../lib/stores/router.svelte.js";
  import { startLocalGame } from "../lib/stores/game.svelte.js";

  function handleLocalPlay() {
    startLocalGame();
    navigate("local-game");
  }

  function handleOnlinePlay() {
    navigate("online-lobby");
  }
</script>

<div class="menu">
  <h1>Tiến Lên</h1>
  <p class="subtitle">Thirteen</p>

  <div class="menu-buttons">
    <button class="btn btn-primary" onclick={handleLocalPlay}>
      Play vs Bots
    </button>
    <button class="btn btn-secondary" onclick={handleOnlinePlay}>
      Play Online
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
    font-size: 6vh;
    margin: 0;
  }

  .subtitle {
    font-size: 3vh;
    color: #aaa;
    margin: 0.5vh 0 6vh;
  }

  .menu-buttons {
    display: flex;
    flex-direction: column;
    gap: 2vh;
  }

  .btn {
    padding: 2vh 10vw;
    border: none;
    border-radius: 1vh;
    font-size: 3vh;
    font-family: monospace;
    font-weight: bold;
    cursor: pointer;
    min-width: 50vw;
  }

  .btn-primary {
    background: #2ecc40;
    color: #111;
  }

  .btn-primary:hover {
    background: #3dd84e;
  }

  .btn-secondary {
    background: #555;
    color: white;
  }

  .btn-secondary:hover {
    background: #666;
  }
</style>
