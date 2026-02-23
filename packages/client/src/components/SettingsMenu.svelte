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
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    transition: background 0.2s;
  }

  .settings-icon:hover {
    background: rgba(0, 0, 0, 0.7);
  }

  .settings-icon :global(svg) {
    width: 60%;
    height: 60%;
  }

  .settings-icon :global(svg path),
  .settings-icon :global(svg circle) {
    stroke: #fff;
  }

  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .menu {
    background: #222;
    border-radius: 2vh;
    padding: 4vh 5vw;
    min-width: 60vw;
    max-width: 80vw;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .menu-title {
    margin: 0 0 3vh 0;
    font-size: 4vh;
    color: #fff;
    text-align: center;
  }

  .menu-btn {
    width: 100%;
    padding: 2.5vh 0;
    margin: 1.5vh 0;
    border: none;
    border-radius: 1vh;
    font-size: 3vh;
    font-family: 'Playfair Display', serif;
    font-weight: bold;
    cursor: pointer;
    transition: opacity 0.2s;
  }

  .menu-btn:hover {
    opacity: 0.9;
  }

  .redeal-btn {
    background: rgba(128, 128, 128, 0.7);
    color: #fff;
  }

  .redeal-btn:hover {
    background: rgba(128, 128, 128, 0.85);
  }

  .leave-btn {
    background: rgba(204, 51, 51, 0.7);
    color: #fff;
  }

  .leave-btn:hover {
    background: rgba(204, 51, 51, 0.85);
  }
</style>
