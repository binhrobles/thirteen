<script lang="ts">
  import { getGameContext } from "../lib/stores/game-context.svelte.js";
  import { navigate } from "../lib/stores/router.svelte.js";

  const ctx = getGameContext();

  const POSITION_LABELS = ["1st", "2nd", "3rd", "4th"];

  function handleMenu() {
    navigate("menu");
  }
</script>

{#if ctx.state.isGameOver && ctx.state.winOrder.length > 0}
  <div class="game-over-overlay">
    <div class="game-over-card">
      <h2>Game Over</h2>
      <ol class="results">
        {#each ctx.state.winOrder as playerId, i}
          {@const isYou = playerId === ctx.state.yourPosition}
          <li class:highlight={isYou}>
            <span class="position">{POSITION_LABELS[i]}:</span>
            <span class="name">{ctx.helpers.getPlayerName(playerId)}</span>
            {#if ctx.state.tournament}
              <span class="points">+{ctx.state.tournament.pointsAwarded[i]} pts</span>
            {/if}
          </li>
        {/each}
      </ol>

      {#if ctx.state.tournament?.tourneyComplete}
        <div class="tourney-winner">
          Tournament Winner: {ctx.helpers.getPlayerName(ctx.state.tournament.tourneyWinner ?? 0)}
        </div>
      {/if}

      <div class="actions">
        <button class="btn" onclick={ctx.actions.startNewGame}>
          {#if ctx.state.mode === "online"}
            {ctx.state.tournament?.tourneyComplete ? "Back to Lobby" : "Next Game"}
          {:else}
            Play Again
          {/if}
        </button>
        <button class="btn btn-secondary" onclick={handleMenu}>Menu</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .game-over-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .game-over-card {
    background: #222;
    padding: 3vh 6vw;
    border-radius: 1.5vh;
    text-align: center;
    color: white;
    font-family: monospace;
    min-width: 60vw;
  }

  h2 {
    margin: 0 0 2vh;
    font-size: 4vh;
  }

  .results {
    list-style: none;
    padding: 0;
    margin: 0 0 3vh;
  }

  .results li {
    display: flex;
    justify-content: space-between;
    gap: 2vw;
    padding: 0.8vh 0;
    font-size: 2.8vh;
  }

  .results li.highlight {
    color: #ffcc00;
    font-weight: bold;
  }

  .position {
    color: #aaa;
    min-width: 4ch;
  }

  .results li.highlight .position {
    color: #ffcc00;
  }

  .name {
    flex: 1;
    text-align: left;
  }

  .points {
    color: #2ecc40;
  }

  .tourney-winner {
    font-size: 3vh;
    color: #ffdc00;
    margin: 2vh 0;
  }

  .actions {
    display: flex;
    gap: 3vw;
    justify-content: center;
  }

  .btn {
    padding: 1.5vh 6vw;
    border: none;
    border-radius: 1vh;
    font-size: 2.8vh;
    font-family: monospace;
    font-weight: bold;
    cursor: pointer;
    background: #2ecc40;
    color: #111;
  }

  .btn:hover {
    background: #3dd84e;
  }

  .btn-secondary {
    background: #555;
    color: #fff;
  }

  .btn-secondary:hover {
    background: #777;
  }
</style>
