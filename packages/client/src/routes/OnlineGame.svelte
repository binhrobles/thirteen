<script lang="ts">
  import { navigate } from "../lib/stores/router.svelte.js";
  import {
    online,
    toggleCard,
    clearSelection,
    playSelectedCards,
    passTurn,
    isYourTurn,
    hasPower,
    canPass,
  } from "../lib/stores/online.svelte.js";
  import { Combo } from "@thirteen/game-logic";

  function handleBack() {
    navigate("online-lobby");
  }

  function handlePlayAgain() {
    // Return to lobby for next game
    online.inGame = false;
    online.gameOver = false;
    navigate("online-lobby");
  }

  function getComboName(combo: number): string {
    return Combo[combo] ?? "Unknown";
  }

  function getPlayerName(position: number): string {
    if (position === online.yourPosition) return "You";
    return online.tourney?.seats[position]?.playerName ?? `Player ${position + 1}`;
  }
</script>

<div class="online-game">
  <!-- Header -->
  <div class="header">
    <button class="btn btn-back" onclick={handleBack}>&larr;</button>
    <div class="status">{online.statusMessage}</div>
  </div>

  <!-- Opponents -->
  <div class="opponents">
    {#each [0, 1, 2, 3] as pos}
      {#if pos !== online.yourPosition}
        <div
          class="opponent"
          class:current={online.currentPlayer === pos}
          class:passed={online.passedPlayers[pos]}
        >
          <div class="opponent-name">{getPlayerName(pos)}</div>
          <div class="opponent-cards">{online.handCounts[pos]} cards</div>
          {#if online.passedPlayers[pos]}
            <div class="opponent-status">Passed</div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <!-- Play Area -->
  <div class="play-area">
    {#if online.lastPlay}
      <div class="last-play">
        <div class="last-play-label">{getComboName(online.lastPlay.combo)}</div>
        <div class="last-play-cards">
          {#each online.lastPlay.cards as card}
            <div class="card-display">{card.toString()}</div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="power-indicator">
        {isYourTurn() ? "You have power - play anything!" : "Waiting for play..."}
      </div>
    {/if}
  </div>

  <!-- Your Hand -->
  <div class="your-hand">
    {#each online.yourHand as card}
      <button
        class="hand-card"
        class:selected={online.selectedCards.has(card.value)}
        onclick={() => toggleCard(card.value)}
        disabled={!isYourTurn()}
      >
        {card.toString()}
      </button>
    {/each}
  </div>

  <!-- Action Buttons -->
  <div class="actions">
    {#if isYourTurn()}
      <button
        class="btn btn-primary"
        onclick={playSelectedCards}
        disabled={online.selectedCards.size === 0}
      >
        Play
      </button>
      <button
        class="btn btn-secondary"
        onclick={passTurn}
        disabled={!canPass()}
      >
        Pass
      </button>
    {:else}
      <div class="waiting-text">Waiting for {getPlayerName(online.currentPlayer)}...</div>
    {/if}
  </div>

  <!-- Game Over Overlay -->
  {#if online.gameOver}
    <div class="game-over-overlay">
      <div class="game-over-panel">
        <h2>Game Over!</h2>
        <div class="results">
          {#each online.winOrder as pos, i}
            <div class="result-row">
              <span class="position">#{i + 1}</span>
              <span class="name">{getPlayerName(pos)}</span>
              <span class="points">+{online.pointsAwarded[i]} pts</span>
            </div>
          {/each}
        </div>

        {#if online.tourneyComplete}
          <div class="tourney-winner">
            Tournament Winner: {getPlayerName(online.tourneyWinner ?? 0)}
          </div>
        {/if}

        <button class="btn btn-primary" onclick={handlePlayAgain}>
          {online.tourneyComplete ? "Back to Lobby" : "Next Game"}
        </button>
      </div>
    </div>
  {/if}

  <!-- Error Toast -->
  {#if online.errorMessage}
    <div class="error-toast">{online.errorMessage}</div>
  {/if}
</div>

<style>
  .online-game {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1a5c2a;
    color: white;
    font-family: monospace;
    position: relative;
  }

  .header {
    display: flex;
    align-items: center;
    padding: 1vh 2vw;
    gap: 2vw;
  }

  .status {
    font-size: 2.5vh;
  }

  .opponents {
    display: flex;
    justify-content: space-around;
    padding: 1vh 2vw;
  }

  .opponent {
    background: rgba(0, 0, 0, 0.3);
    padding: 1vh 3vw;
    border-radius: 1vh;
    text-align: center;
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

  .play-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .last-play {
    text-align: center;
  }

  .last-play-label {
    font-size: 2vh;
    color: #aaa;
    margin-bottom: 1vh;
  }

  .last-play-cards {
    display: flex;
    gap: 1vw;
    justify-content: center;
  }

  .card-display {
    background: white;
    color: #111;
    padding: 2vh 2vw;
    border-radius: 0.5vh;
    font-size: 3vh;
    font-weight: bold;
  }

  .power-indicator {
    font-size: 2.5vh;
    color: #2ecc40;
  }

  .your-hand {
    display: flex;
    gap: 1vw;
    padding: 2vh;
    overflow-x: auto;
    justify-content: center;
    flex-wrap: wrap;
  }

  .hand-card {
    background: white;
    color: #111;
    border: 2px solid transparent;
    padding: 1.5vh 2vw;
    border-radius: 0.5vh;
    font-size: 2.5vh;
    font-family: monospace;
    font-weight: bold;
    cursor: pointer;
    transition: transform 0.1s, border-color 0.1s;
  }

  .hand-card:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .hand-card.selected {
    border-color: #2ecc40;
    transform: translateY(-1vh);
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: 4vw;
    padding: 2vh;
  }

  .waiting-text {
    font-size: 2.5vh;
    color: #aaa;
  }

  .btn {
    padding: 1.5vh 6vw;
    border: none;
    border-radius: 0.5vh;
    font-size: 2.5vh;
    font-family: monospace;
    font-weight: bold;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-back {
    background: transparent;
    color: white;
    border: 1px solid white;
    padding: 1vh 2vw;
    font-size: 2vh;
  }

  .btn-primary {
    background: #2ecc40;
    color: #111;
  }

  .btn-secondary {
    background: #555;
    color: white;
  }

  .game-over-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .game-over-panel {
    background: #2a2a2a;
    padding: 4vh 6vw;
    border-radius: 2vh;
    text-align: center;
  }

  .game-over-panel h2 {
    font-size: 4vh;
    margin: 0 0 2vh;
  }

  .results {
    margin: 2vh 0;
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    gap: 4vw;
    padding: 1vh 0;
    font-size: 2.5vh;
  }

  .position {
    color: #aaa;
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

  .error-toast {
    position: absolute;
    bottom: 10vh;
    left: 50%;
    transform: translateX(-50%);
    background: #ff4136;
    color: white;
    padding: 1.5vh 4vw;
    border-radius: 1vh;
    font-size: 2vh;
  }
</style>
