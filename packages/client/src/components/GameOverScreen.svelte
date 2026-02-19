<script lang="ts">
  import { game, startLocalGame } from "../lib/stores/game.svelte.js";
  import { navigate } from "../lib/stores/router.svelte.js";

  const POSITION_LABELS = ["1st", "2nd", "3rd", "4th"];
</script>

{#if game.winOrder}
  <div class="game-over-overlay">
    <div class="game-over-card">
      <h2>Game Over</h2>
      <ol class="results">
        {#each game.winOrder as playerId, i}
          <li class:highlight={playerId === 0}>
            {POSITION_LABELS[i]}: Player {playerId + 1}
            {playerId === 0 ? "(You)" : ""}
          </li>
        {/each}
      </ol>
      <div class="actions">
        <button class="btn" onclick={startLocalGame}>Play Again</button>
        <button class="btn btn-secondary" onclick={() => navigate("menu")}>Menu</button>
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
    padding: 0.8vh 0;
    font-size: 2.8vh;
  }

  .results li.highlight {
    color: #ffcc00;
    font-weight: bold;
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
