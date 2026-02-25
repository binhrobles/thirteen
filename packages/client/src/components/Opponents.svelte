<script lang="ts">
  import { getGameContext } from "../lib/stores/game-context.svelte.js";

  const ctx = getGameContext();

  // Derive opponent data from unified state
  const opponents = $derived.by(() => {
    const yourPos = ctx.state.yourPosition;
    return [0, 1, 2, 3]
      .filter((pos) => pos !== yourPos)
      .map((pos) => ({
        position: pos,
        name: ctx.helpers.getPlayerName(pos),
        cardCount: ctx.state.handCounts[pos],
        passed: ctx.state.passedPlayers[pos],
        current: ctx.state.currentPlayer === pos,
      }));
  });
</script>

<div class="opponents">
  {#each opponents as opp}
    <div
      class="opponent"
      class:current={opp.current}
      class:passed={opp.passed}
    >
      <img
        class="opponent-avatar"
        src={`https://api.dicebear.com/9.x/croodles/svg?seed=${encodeURIComponent(opp.name)}`}
        alt={opp.name}
      />
      <div class="opponent-info">
        <div class="opponent-name">{opp.name}</div>
        <div class="opponent-cards">{opp.cardCount} cards</div>
        {#if opp.passed}
          <div class="opponent-status">Passed</div>
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .opponents {
    display: flex;
    justify-content: space-around;
    padding: var(--space-sm) 2vw;
    background: var(--color-bg-bar);
    border-top: 1px solid var(--color-border-subtle);
  }

  .opponent {
    background: rgba(0, 0, 0, 0.3);
    padding: var(--space-sm) 2vw;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    gap: 1.5vw;
  }

  .opponent-avatar {
    width: 6vh;
    height: 6vh;
    border-radius: var(--radius-round);
    background: rgba(255, 255, 255, 0.1);
  }

  .opponent-info {
    text-align: left;
    color: var(--color-text-primary);
  }

  .opponent.current {
    border: 2px solid var(--color-warning);
  }

  .opponent.passed {
    opacity: 0.5;
  }

  .opponent-name {
    font-size: var(--text-lg);
    font-weight: bold;
  }

  .opponent-cards {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
  }

  .opponent-status {
    font-size: var(--text-xs);
    color: var(--color-warning);
    font-family: var(--font-mono);
  }
</style>
