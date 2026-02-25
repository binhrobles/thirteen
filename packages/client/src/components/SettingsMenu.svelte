<script lang="ts">
  import { getGameContext } from "../lib/stores/game-context.svelte.js";
  import { navigate } from "../lib/stores/router.svelte.js";
  import {
    leaveTourney,
    disconnectFromServer,
  } from "../lib/stores/online.svelte.js";
  import SettingsIcon from "@assets/settings-cog-line-icon.svg?raw";

  const ctx = getGameContext();

  let isOpen = $state(false);

  function toggleMenu() {
    isOpen = !isOpen;
  }

  function closeMenu() {
    isOpen = false;
  }

  function handleLeaveGame() {
    if (ctx.state.mode === "online") {
      leaveTourney();
      disconnectFromServer();
    }
    navigate("menu");
    closeMenu();
  }

  function handleRedeal() {
    ctx.actions.startNewGame();
    closeMenu();
  }

  function handleOverlayClick(e: MouseEvent) {
    // Close menu if clicking the overlay (not the menu itself)
    if (e.target === e.currentTarget) {
      closeMenu();
    }
  }
</script>

<!-- Settings icon button -->
<button class="settings-icon" onclick={toggleMenu} aria-label="Settings">
  {@html SettingsIcon}
</button>

<!-- Menu overlay -->
{#if isOpen}
  <div class="overlay" onclick={handleOverlayClick}>
    <div class="menu">
      <h2 class="menu-title">Settings</h2>

      {#if ctx.state.mode === "local"}
        <button class="menu-btn redeal-btn" onclick={handleRedeal}>
          Redeal
        </button>
      {/if}

      <button class="menu-btn leave-btn" onclick={handleLeaveGame}>
        Leave Game
      </button>
    </div>
  </div>
{/if}

<style>
  .settings-icon {
    position: absolute;
    top: 11vh;
    right: 3vw;
    width: 5vh;
    height: 5vh;
    border: none;
    background: var(--color-bg-bar);
    color: var(--color-text-primary);
    border-radius: var(--radius-round);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    transition: background var(--transition-base);
  }

  .settings-icon:hover {
    background: var(--color-bg-panel);
  }

  .settings-icon :global(svg) {
    width: 60%;
    height: 60%;
  }

  .settings-icon :global(svg path),
  .settings-icon :global(svg circle) {
    stroke: var(--color-text-primary);
  }

  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--color-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .menu {
    background: var(--color-bg-panel);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-xl);
    padding: var(--space-2xl) 5vw;
    min-width: 60vw;
    max-width: 80vw;
    box-shadow: var(--shadow-lg), var(--shadow-inset-panel);
  }

  .menu-title {
    margin: 0 0 var(--space-xl) 0;
    font-size: var(--text-xl);
    color: var(--color-text-primary);
    text-align: center;
  }

  .menu-btn {
    width: 100%;
    padding: var(--space-xl) 0;
    margin: var(--space-md) 0;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--text-lg);
    font-family: var(--font-display);
    font-weight: bold;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .redeal-btn {
    background: var(--color-secondary);
    color: var(--color-text-primary);
  }

  .redeal-btn:hover {
    background: var(--color-secondary-hover);
  }

  .leave-btn {
    background: var(--color-destructive);
    color: var(--color-text-primary);
  }

  .leave-btn:hover {
    background: var(--color-destructive-hover);
  }
</style>
