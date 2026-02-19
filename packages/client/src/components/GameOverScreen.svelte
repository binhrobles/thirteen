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
    padding: 24px 32px;
    border-radius: 12px;
    text-align: center;
    color: white;
    font-family: monospace;
    min-width: 250px;
  }

  h2 {
    margin: 0 0 16px;
    font-size: 1.5rem;
  }

  .results {
    list-style: none;
    padding: 0;
    margin: 0 0 20px;
  }

  .results li {
    padding: 6px 0;
    font-size: 1.1rem;
  }

  .results li.highlight {
    color: #ffcc00;
    font-weight: bold;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .btn {
    padding: 10px 24px;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
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
