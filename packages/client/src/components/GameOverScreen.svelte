<script lang="ts">
  import { getGameContext } from "../lib/stores/game-context.svelte.js";
  import { navigate } from "../lib/stores/router.svelte.js";

  const ctx = getGameContext();

  const POSITION_LABELS = ["1st", "2nd", "3rd", "4th"];

  function handleMenu() {
    navigate("menu");
  }

  // Derive sorted leaderboard for online mode
  const leaderboard = $derived.by(() => {
    if (!ctx.state.tournament?.seats) return [];

    // Map win order position to points awarded
    const pointsMap = new Map<number, number>();
    ctx.state.winOrder.forEach((pos, i) => {
      pointsMap.set(pos, ctx.state.tournament!.pointsAwarded[i]);
    });

    return [...ctx.state.tournament.seats]
      .map(seat => ({
        ...seat,
        lastGamePoints: pointsMap.get(seat.position) ?? 0,
      }))
      .sort((a, b) => b.score - a.score);
  });

  // Check if current player is ready (for online mode)
  const isReady = $derived(
    ctx.state.tournament?.seats.find(s => s.position === ctx.state.yourPosition)?.isReady ?? false
  );

  // Count ready players
  const readyCount = $derived(
    ctx.state.tournament?.seats.filter(s => s.isReady).length ?? 0
  );
</script>

{#if ctx.state.isGameOver && ctx.state.winOrder.length > 0}
  <div class="game-over-overlay">
    <div class="game-over-card">
      {#if ctx.state.tournament?.tourneyComplete}
        <!-- Tournament Complete Banner -->
        <div class="winner-banner">
          <h2>Tournament Complete!</h2>
          <div class="winner-avatar">
            <img
              src={`https://api.dicebear.com/9.x/croodles/svg?seed=${encodeURIComponent(ctx.helpers.getPlayerName(ctx.state.tournament.tourneyWinner ?? 0))}`}
              alt="Winner"
            />
          </div>
          <p class="winner-name">{ctx.helpers.getPlayerName(ctx.state.tournament.tourneyWinner ?? 0)} Wins!</p>
        </div>
      {:else}
        <h2>Game Over</h2>
      {/if}

      {#if ctx.state.mode === "online" && ctx.state.tournament}
        <!-- Online Mode: Full Leaderboard -->
        <div class="leaderboard">
          <div class="leaderboard-header">
            <span class="col-rank">#</span>
            <span class="col-player">Player</span>
            <span class="col-points">+Pts</span>
            <span class="col-total">Total</span>
            <span class="col-ready"></span>
          </div>
          {#each leaderboard as entry, i}
            {@const isYou = entry.position === ctx.state.yourPosition}
            <div class="leaderboard-row" class:highlight={isYou}>
              <span class="col-rank">{i + 1}</span>
              <div class="col-player">
                <img
                  class="avatar"
                  src={`https://api.dicebear.com/9.x/croodles/svg?seed=${encodeURIComponent(entry.playerName || 'Bot')}`}
                  alt={entry.playerName || 'Player'}
                />
                <span class="player-name">{entry.playerName || 'Bot'}{isYou ? ' (You)' : ''}</span>
              </div>
              <span class="col-points" class:positive={entry.lastGamePoints > 0}>
                {entry.lastGamePoints > 0 ? `+${entry.lastGamePoints}` : '0'}
              </span>
              <span class="col-total">{entry.score}</span>
              <span class="col-ready">
                {#if entry.isReady}
                  <span class="ready-check">✓</span>
                {/if}
              </span>
            </div>
          {/each}
        </div>

        {#if !ctx.state.tournament.tourneyComplete}
          <div class="ready-status">
            {readyCount}/4 players ready
          </div>
        {/if}
      {:else}
        <!-- Local Mode: Simple Results -->
        <ol class="results">
          {#each ctx.state.winOrder as playerId, i}
            {@const isYou = playerId === ctx.state.yourPosition}
            <li class:highlight={isYou}>
              <span class="position">{POSITION_LABELS[i]}:</span>
              <span class="name">{ctx.helpers.getPlayerName(playerId)}</span>
            </li>
          {/each}
        </ol>
      {/if}

      <div class="actions">
        {#if ctx.state.mode === "online"}
          {#if ctx.state.tournament?.tourneyComplete}
            <button class="btn btn-primary" onclick={ctx.actions.startNewGame}>
              Back to Lobby
            </button>
          {:else if !isReady}
            <button class="btn btn-primary" onclick={ctx.actions.readyUp}>
              Ready Up
            </button>
          {:else}
            <p class="waiting">Waiting for others...</p>
          {/if}
        {:else}
          <button class="btn btn-primary" onclick={ctx.actions.startNewGame}>
            Play Again
          </button>
        {/if}
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
    padding: 3vh 4vw;
    border-radius: 1.5vh;
    text-align: center;
    color: white;
    font-family: monospace;
    min-width: 85vw;
    max-width: 95vw;
  }

  h2 {
    margin: 0 0 2vh;
    font-size: 4vh;
  }

  /* Winner Banner */
  .winner-banner {
    margin-bottom: 2vh;
  }

  .winner-banner h2 {
    color: #ffdc00;
    margin-bottom: 1vh;
  }

  .winner-avatar {
    width: 15vh;
    height: 15vh;
    margin: 0 auto 1vh;
    border-radius: 50%;
    background: rgba(255, 220, 0, 0.2);
    border: 3px solid #ffdc00;
    overflow: hidden;
  }

  .winner-avatar img {
    width: 100%;
    height: 100%;
  }

  .winner-name {
    font-size: 3vh;
    color: #ffdc00;
    font-weight: bold;
    margin: 0;
  }

  /* Leaderboard */
  .leaderboard {
    margin-bottom: 2vh;
  }

  .leaderboard-header {
    display: grid;
    grid-template-columns: 3ch 1fr 5ch 5ch 3ch;
    gap: 1vw;
    padding: 1vh 0;
    border-bottom: 1px solid #444;
    font-size: 1.8vh;
    color: #888;
    text-align: center;
  }

  .leaderboard-header .col-player {
    text-align: left;
    padding-left: 1vw;
  }

  .leaderboard-row {
    display: grid;
    grid-template-columns: 3ch 1fr 5ch 5ch 3ch;
    gap: 1vw;
    padding: 1.2vh 0;
    font-size: 2.2vh;
    align-items: center;
    border-bottom: 1px solid #333;
  }

  .leaderboard-row.highlight {
    background: rgba(255, 204, 0, 0.15);
    border-radius: 0.5vh;
  }

  .col-rank {
    text-align: center;
    color: #888;
  }

  .leaderboard-row.highlight .col-rank {
    color: #ffcc00;
  }

  .col-player {
    display: flex;
    align-items: center;
    gap: 1.5vw;
    text-align: left;
  }

  .avatar {
    width: 5vh;
    height: 5vh;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  .player-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .leaderboard-row.highlight .player-name {
    color: #ffcc00;
    font-weight: bold;
  }

  .col-points {
    text-align: center;
    color: #888;
  }

  .col-points.positive {
    color: #2ecc40;
    font-weight: bold;
  }

  .col-total {
    text-align: center;
    font-weight: bold;
  }

  .col-ready {
    text-align: center;
  }

  .ready-check {
    color: #2ecc40;
    font-weight: bold;
  }

  .ready-status {
    font-size: 2vh;
    color: #aaa;
    margin-bottom: 2vh;
  }

  /* Simple Results (Local Mode) */
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

  /* Actions */
  .actions {
    display: flex;
    gap: 3vw;
    justify-content: center;
    align-items: center;
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

  .btn-primary {
    background: #2ecc40;
    color: #111;
  }

  .btn-secondary {
    background: #555;
    color: #fff;
  }

  .btn-secondary:hover {
    background: #777;
  }

  .waiting {
    color: #ff851b;
    font-size: 2.5vh;
    margin: 0;
  }
</style>
