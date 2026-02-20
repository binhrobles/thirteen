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
    padding: 1vh 2vw;
    background: rgba(0, 0, 0, 0.2);
  }

  .opponent {
    background: rgba(0, 0, 0, 0.3);
    padding: 1vh 2vw;
    border-radius: 1vh;
    display: flex;
    align-items: center;
    gap: 1.5vw;
  }

  .opponent-avatar {
    width: 6vh;
    height: 6vh;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
  }

  .opponent-info {
    text-align: left;
    font-family: monospace;
    color: white;
  }

  .opponent.current {
    border: 2px solid #ff851b;
  }

  .opponent.passed {
    opacity: 0.5;
  }

  .opponent-name {
    font-size: 2vh;
    font-weight: bold;
  }

  .opponent-cards {
    font-size: 1.8vh;
    color: #aaa;
  }

  .opponent-status {
    font-size: 1.6vh;
    color: #ff851b;
  }
</style>
