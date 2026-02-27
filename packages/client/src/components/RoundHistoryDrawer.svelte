<script lang="ts">
  import { getGameContext } from "../lib/stores/game-context.svelte.js";
  import type { PlayLogEntry } from "@thirteen/game-logic";
  import { getCardTexturePath } from "../lib/pixi/card-sprite.js";

  const ctx = getGameContext();

  function getCurrentRoundPlays(): PlayLogEntry[] {
    const playLog = ctx.state.playLog;
    if (!playLog || playLog.length === 0) return [];

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
      ctx.actions.closeRoundHistory();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      ctx.actions.closeRoundHistory();
    }
  }

  // Reactive derivation of current round plays
  let currentRoundPlays = $derived.by(() => {
    return getCurrentRoundPlays();
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if ctx.state.showRoundHistory}
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
              {@const playerName = ctx.helpers.getPlayerName(entry.player)}
              <div class="play-entry">
                <div class="player-row">
                  <img
                    class="player-avatar"
                    src={`https://api.dicebear.com/9.x/croodles/svg?seed=${encodeURIComponent(playerName)}`}
                    alt={playerName}
                  />
                  <span class="player-name">{playerName}</span>
                </div>
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
    background: var(--color-overlay);
    z-index: 200;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .drawer {
    background: var(--color-bg-panel);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    padding: var(--space-lg);
    max-height: 60vh;
    overflow-y: auto;
    box-shadow: var(--shadow-lg), var(--shadow-inset-panel);
  }

  h2 {
    text-align: center;
    color: var(--color-text-primary);
    font-size: var(--text-xl);
    margin: 0 0 var(--space-lg) 0;
  }

  .history-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .empty-message {
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--text-base);
    font-family: var(--font-mono);
  }

  .play-entry {
    background: var(--color-bg-panel-raised);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .player-row {
    display: flex;
    align-items: center;
    gap: 2vw;
  }

  .player-avatar {
    width: 5vh;
    height: 5vh;
    border-radius: var(--radius-round);
    background: rgba(255, 255, 255, 0.1);
  }

  .player-name {
    color: var(--color-text-primary);
    font-size: var(--text-base);
    font-weight: bold;
  }

  .pass-label {
    color: var(--color-destructive-hover);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    font-weight: bold;
  }

  .cards-row {
    display: flex;
    gap: 1vw;
    flex-wrap: wrap;
  }

  .card-image {
    height: 13vh;
    border-radius: var(--radius-sm);
  }
</style>
