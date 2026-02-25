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
          <h2>Tourney Complete</h2>
          <div class="winner-avatar">
            <img
              src={`https://api.dicebear.com/9.x/croodles/svg?seed=${encodeURIComponent(ctx.helpers.getPlayerName(ctx.state.tournament.tourneyWinner ?? 0))}`}
              alt="Winner"
            />
          </div>
          <p class="winner-name">{ctx.helpers.getPlayerName(ctx.state.tournament.tourneyWinner ?? 0)} Won!</p>
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
    background: var(--color-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .game-over-card {
    background: var(--color-bg-panel);
    border: 1px solid var(--color-border-subtle);
    padding: var(--space-xl) 4vw;
    border-radius: var(--radius-lg);
    text-align: center;
    color: var(--color-text-primary);
    min-width: 85vw;
    max-width: 95vw;
    box-shadow: var(--shadow-lg), var(--shadow-inset-panel);
  }

  h2 {
    margin: 0 0 var(--space-lg);
    font-size: var(--text-xl);
  }

  /* Winner Banner */
  .winner-banner {
    margin-bottom: var(--space-lg);
  }

  .winner-banner h2 {
    color: var(--color-gold);
    margin-bottom: var(--space-sm);
  }

  .winner-avatar {
    width: 15vh;
    height: 15vh;
    margin: 0 auto var(--space-sm);
    border-radius: var(--radius-round);
    background: var(--color-gold-bg);
    border: 3px solid var(--color-gold);
    box-shadow: var(--shadow-glow-gold);
    overflow: hidden;
  }

  .winner-avatar img {
    width: 100%;
    height: 100%;
  }

  .winner-name {
    font-size: var(--text-lg);
    color: var(--color-gold-bright);
    font-weight: bold;
    margin: 0;
  }

  /* Leaderboard */
  .leaderboard {
    margin-bottom: var(--space-lg);
  }

  .leaderboard-header {
    display: grid;
    grid-template-columns: 3ch 1fr 4ch 8ch 3ch;
    gap: 1vw;
    padding: var(--space-sm) 0;
    border-bottom: 1px solid var(--color-bg-panel-raised);
    font-size: var(--text-sm);
    font-family: var(--font-mono);
    color: var(--color-text-tertiary);
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
    font-size: var(--text-base);
    align-items: center;
    border-bottom: 1px solid var(--color-bg-panel-raised);
  }

  .leaderboard-row.highlight {
    background: var(--color-gold-bg);
    border: 1px solid var(--color-border-medium);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-glow-gold);
  }

  .col-rank {
    text-align: center;
    color: var(--color-text-tertiary);
    font-family: var(--font-mono);
  }

  .leaderboard-row.highlight .col-rank {
    color: var(--color-gold);
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
    border-radius: var(--radius-round);
    background: rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  .player-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .leaderboard-row.highlight .player-name {
    color: var(--color-gold-bright);
    font-weight: bold;
  }

  .col-points {
    text-align: center;
    color: var(--color-text-tertiary);
    font-family: var(--font-mono);
  }

  .col-points.positive {
    color: var(--color-primary);
    font-weight: bold;
  }

  .col-total {
    text-align: center;
    font-family: var(--font-mono);
    font-weight: bold;
  }

  .col-ready {
    text-align: center;
  }

  .ready-check {
    color: var(--color-primary);
    font-weight: bold;
  }

  .ready-status {
    font-size: var(--text-lg);
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-lg);
  }

  /* Simple Results (Local Mode) */
  .results {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-xl);
  }

  .results li {
    display: flex;
    justify-content: space-between;
    gap: 2vw;
    padding: 0.8vh 0;
    font-size: 2.8vh;
  }

  .results li.highlight {
    color: var(--color-gold-bright);
    font-weight: bold;
  }

  .position {
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    min-width: 4ch;
  }

  .results li.highlight .position {
    color: var(--color-gold);
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
    padding: var(--space-md) 6vw;
    border: none;
    border-radius: var(--radius-md);
    font-size: 2.8vh;
    font-family: var(--font-display);
    font-weight: bold;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-primary {
    background: var(--color-primary);
    color: var(--color-text-primary);
  }

  .btn-primary:hover {
    background: var(--color-primary-hover);
  }

  .btn-secondary {
    background: var(--color-secondary);
    color: var(--color-text-primary);
  }

  .btn-secondary:hover {
    background: var(--color-secondary-hover);
  }

  .waiting {
    color: var(--color-warning);
    font-size: var(--text-md);
    font-family: var(--font-mono);
    margin: 0;
  }
</style>
