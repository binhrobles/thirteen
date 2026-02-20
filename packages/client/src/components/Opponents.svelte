<script lang="ts">
  import { game, HUMAN_PLAYER } from "../lib/stores/game.svelte.js";

  // Default bot names for local play
  const BOT_NAMES = ["Bot Alice", "Bot Bob", "Bot Carol"];

  function getPlayerName(position: number): string {
    if (position === HUMAN_PLAYER) return "You";
    // Map position to bot index (skip human player)
    const botIndex = position > HUMAN_PLAYER ? position - 1 : position;
    return BOT_NAMES[botIndex] ?? `Bot ${position}`;
  }

  // Derive opponent data from game state, reading stateVersion to trigger updates
  const opponents = $derived.by(() => {
    // Read stateVersion to ensure reactivity when GameState mutates
    game.stateVersion;
    const gs = game.gameState;
    if (!gs) return [];

    return [0, 1, 2, 3]
      .filter(pos => pos !== HUMAN_PLAYER)
      .map(pos => ({
        position: pos,
        name: getPlayerName(pos),
        cardCount: gs.getHand(pos).length,
        passed: !gs.playersInRound[pos],
        current: gs.currentPlayer === pos,
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
