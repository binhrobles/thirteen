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
    color: var(--color-text-primary);
    background: radial-gradient(ellipse at 50% 30%, rgba(255, 255, 255, 0.03) 0%, transparent 70%), var(--color-felt);
  }

  h1 {
    font-size: var(--text-hero);
    margin: 0;
  }

  .subtitle {
    font-size: var(--text-lg);
    color: var(--color-text-secondary);
    margin: var(--space-xs) 0 var(--space-2xl);
  }

  .menu-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .btn {
    padding: var(--space-lg) 10vw;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-lg);
    font-weight: bold;
    cursor: pointer;
    min-width: 50vw;
    transition: background var(--transition-base);
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-text-primary);
  }

  .btn-primary:hover {
    background: var(--color-primary-hover);
  }

  .btn-secondary {
    background: var(--color-secondary);
    color: var(--color-text-primary);
  }

  .btn-secondary:hover {
    background: var(--color-secondary-hover);
  }
</style>
