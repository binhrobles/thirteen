<script lang="ts">
  import { game, closeRoundHistory, HUMAN_PLAYER } from "../lib/stores/game.svelte.js";
  import type { PlayLogEntry } from "@thirteen/game-logic";
  import { getCardTexturePath } from "../lib/pixi/card-sprite.js";

  const PLAYER_NAMES = ["You", "Player 2", "Player 3", "Player 4"];

  function getCurrentRoundPlays(): PlayLogEntry[] {
    if (!game.gameState) return [];
    const playLog = game.gameState.playLog;
    const roundPlays: PlayLogEntry[] = [];

    // Find the last round_reset marker
    let lastResetIdx = -1;
    for (let i = playLog.length - 1; i >= 0; i--) {
      if (playLog[i] === "round_reset") {
        lastResetIdx = i;
        break;
      }
    }

    // Get all plays after the last reset (or all plays if no reset found)
    const startIdx = lastResetIdx >= 0 ? lastResetIdx + 1 : 0;
    for (let i = startIdx; i < playLog.length; i++) {
      const entry = playLog[i];
      if (entry !== "round_reset") {
        roundPlays.push(entry);
      }
    }

    return roundPlays;
  }

  function handleBackgroundClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      closeRoundHistory();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      closeRoundHistory();
    }
  }

  // Reactive derivation of current round plays
  let currentRoundPlays = $derived.by(() => {
    // Access stateVersion to re-derive when game state changes
    game.stateVersion;
    return getCurrentRoundPlays();
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if game.showRoundHistory}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="overlay" onclick={handleBackgroundClick}>
    <div class="drawer">
      <h2>Round History</h2>
      <div class="history-list">
        {#if currentRoundPlays.length === 0}
          <p class="empty-message">No plays yet this round</p>
        {:else}
          {#each [...currentRoundPlays].reverse() as entry}
            {#if entry !== "round_reset"}
              <div class="play-entry">
                <span class="player-name">{PLAYER_NAMES[entry.player]}</span>
                {#if entry.play === "pass"}
                  <span class="pass-label">PASS</span>
                {:else}
                  <div class="cards-row">
                    {#each entry.play.cards as card}
                      <img
                        src={getCardTexturePath(card)}
                        alt={card.toString()}
                        class="card-image"
                      />
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 200;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .drawer {
    background: #1f1f26;
    border-radius: 20px 20px 0 0;
    padding: 20px;
    max-height: 60vh;
    overflow-y: auto;
  }

  h2 {
    text-align: center;
    color: #e5e5e5;
    font-size: 1.5rem;
    margin: 0 0 16px 0;
    font-family: monospace;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-message {
    text-align: center;
    color: #999;
    font-size: 1rem;
    font-family: monospace;
  }

  .play-entry {
    background: #2d2d38;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .player-name {
    color: #fff;
    font-size: 1.1rem;
    font-weight: bold;
    font-family: monospace;
  }

  .pass-label {
    color: #ff6666;
    font-size: 1rem;
    font-family: monospace;
    font-weight: bold;
  }

  .cards-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .card-image {
    height: 13vh;
    border-radius: 4px;
  }
</style>
