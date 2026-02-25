<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { navigate } from "../lib/stores/router.svelte.js";
  import {
    online,
    initOnline,
    connectToServer,
    disconnectFromServer,
    setPlayerName,
    claimSeat,
    leaveTourney,
    readyUp,
    addBot,
    kickBot,
    debugQuickStart,
    debugReset,
    type SeatClientState,
  } from "../lib/stores/online.svelte.js";
  import { ConnectionState } from "../lib/ws/index.js";
  import { WS_URL } from "../lib/config.js";

  let nameInput = $state("Player");

  onMount(() => {
    initOnline();
  });

  onDestroy(() => {
    // Don't disconnect on destroy - user might be navigating to game
  });

  function handleConnect() {
    setPlayerName(nameInput);
    connectToServer(WS_URL);
  }

  function handleBack() {
    disconnectFromServer();
    navigate("menu");
  }

  function handleQuickStart() {
    debugQuickStart(0);
  }

  function getSeatDisplay(seat: SeatClientState | undefined) {
    if (!seat) return { name: "Empty", status: "", canClaim: false, canKick: false, isYou: false, isDisconnected: false };

    const isYou = seat.playerId === online.playerId;

    if (!seat.playerId && !seat.isBot) {
      return { name: "Empty", status: "", canClaim: true, canKick: false, isYou: false, isDisconnected: false };
    }

    if (seat.isBot) {
      return { name: seat.playerName ?? "Bot", status: seat.isReady ? "Ready" : "", canClaim: false, canKick: true, isYou: false, isDisconnected: false };
    }

    let status = "";
    if (seat.isDisconnected) {
      status = "Disconnected";
    } else if (seat.isReady) {
      status = "Ready";
    } else {
      status = "Not Ready";
    }

    return {
      name: isYou ? `${seat.playerName} (You)` : seat.playerName ?? "Player",
      status,
      canClaim: false,
      canKick: false,
      isYou,
      isDisconnected: seat.isDisconnected,
    };
  }

  // Reactive derivations - these re-evaluate when online.tourney changes
  const isInTourney = $derived(
    online.tourney?.seats.some(s => s.playerId === online.playerId) ?? false
  );

  const isReady = $derived(
    online.tourney?.seats.find(s => s.playerId === online.playerId)?.isReady ?? false
  );

  // Navigate to game when it starts
  $effect(() => {
    if (online.inGame) {
      navigate("online-game");
    }
  });
</script>

<div class="lobby">
  <header>
    <button class="btn btn-back" onclick={handleBack}>&larr; Back</button>
    <h1>Online Lobby</h1>
  </header>

  {#if online.connectionState === ConnectionState.DISCONNECTED || online.connectionState === ConnectionState.ERROR}
    <!-- Connection Form -->
    <div class="connect-form">
      <img
        class="avatar"
        src={`https://api.dicebear.com/9.x/croodles/svg?seed=${encodeURIComponent(nameInput || 'Player')}`}
        alt="Your avatar"
      />

      <div class="form-group">
        <label for="name">Your Name</label>
        <input
          id="name"
          type="text"
          bind:value={nameInput}
          placeholder="Enter your name"
          maxlength="12"
        />
      </div>

      <button class="btn btn-primary" onclick={handleConnect}>
        Connect
      </button>

      {#if online.errorMessage}
        <p class="error">{online.errorMessage}</p>
      {/if}
    </div>

  {:else if online.connectionState === ConnectionState.CONNECTING || online.connectionState === ConnectionState.RECONNECTING}
    <!-- Connecting -->
    <div class="status-panel">
      <p class="connecting">{online.connectionState === ConnectionState.RECONNECTING ? "Reconnecting..." : "Connecting..."}</p>
    </div>

  {:else if online.connectionState === ConnectionState.CONNECTED}
    <!-- Connected - Show Lobby -->
    <div class="lobby-content">
      <div class="connection-status">
        <span class="status-dot connected"></span>
        Connected as <strong>{online.playerName}</strong>
      </div>

      {#if online.tourney}
        <div class="seats">
          {#each online.tourney.seats as seat, i}
            {@const display = getSeatDisplay(seat)}
            <div class="seat" class:occupied={seat.playerId || seat.isBot} class:you={display.isYou} class:disconnected={display.isDisconnected}>
              <div class="seat-header">
                {#if seat.playerId || seat.isBot}
                  <img
                    class="seat-avatar"
                    src={`https://api.dicebear.com/9.x/croodles/svg?seed=${encodeURIComponent(seat.playerName || 'Bot')}`}
                    alt={seat.playerName || 'Player'}
                  />
                {:else}
                  <div class="seat-avatar-placeholder"></div>
                {/if}
                <div class="seat-info">
                  <div class="seat-name">{display.name}</div>
                  {#if display.status}
                    <div class="seat-status" class:ready={seat.isReady} class:disconnected={display.isDisconnected}>{display.status}</div>
                  {/if}
                </div>
              </div>
              <div class="seat-score">Score: {seat.score}</div>

              <div class="seat-actions">
                {#if display.canClaim}
                  <button class="btn btn-small" onclick={() => claimSeat(i)}>Join</button>
                  <button class="btn btn-small" onclick={() => addBot(i)}>Add Bot</button>
                {:else if display.canKick}
                  <button class="btn btn-small" onclick={() => kickBot(i)}>Kick</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>

        <div class="lobby-actions">
          {#if isInTourney}
            {#if !isReady}
              <button class="btn btn-primary" onclick={readyUp}>Ready Up</button>
            {:else}
              <p class="waiting">Waiting for others...</p>
            {/if}
            <button class="btn btn-secondary" onclick={leaveTourney}>Leave</button>
          {:else}
            <p class="hint">Click "Join" on an empty seat to join the tournament</p>
          {/if}
        </div>

        <!-- Debug actions -->
        <div class="debug-actions">
          <button class="btn btn-small btn-admin" onclick={handleQuickStart}>Quick Start</button>
          <button class="btn btn-small btn-admin btn-danger" onclick={debugReset}>Reset Tourney</button>
        </div>
      {:else}
        <p>Loading tournament...</p>
      {/if}

      {#if online.statusMessage}
        <p class="status-message">{online.statusMessage}</p>
      {/if}

      {#if online.errorMessage}
        <p class="error">{online.errorMessage}</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .lobby {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: radial-gradient(ellipse at 50% 30%, rgba(255, 255, 255, 0.03) 0%, transparent 70%), var(--color-felt);
    color: var(--color-text-primary);
    padding: var(--space-lg);
    box-sizing: border-box;
  }

  header {
    display: flex;
    align-items: center;
    gap: 2vw;
    margin-bottom: var(--space-lg);
  }

  h1 {
    font-size: var(--text-xl);
    margin: 0;
  }

  .connect-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
    margin-top: var(--space-lg);
  }

  .avatar {
    width: 20vh;
    height: 20vh;
    border-radius: var(--radius-round);
    background: rgba(255, 255, 255, 0.1);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 80%;
    max-width: 300px;
  }

  .form-group label {
    font-size: var(--text-lg);
  }

  .form-group input[type="text"] {
    padding: var(--space-md);
    font-size: var(--text-md);
    font-family: var(--font-display);
    border: none;
    border-radius: var(--radius-sm);
    text-align: center;
  }

  .lobby-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 1vw;
    font-size: var(--text-lg);
    font-family: var(--font-mono);
  }

  .status-dot {
    width: 1.5vh;
    height: 1.5vh;
    border-radius: var(--radius-round);
  }

  .status-dot.connected {
    background: var(--color-primary);
  }

  .seats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-lg);
  }

  .seat {
    background: var(--color-bg-panel);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    box-shadow: var(--shadow-sm);
  }

  .seat.occupied {
    background: var(--color-bg-panel-raised);
  }

  .seat.you {
    border: 2px solid var(--color-primary);
  }

  .seat.disconnected {
    opacity: 0.5;
  }

  .seat.disconnected .seat-avatar {
    filter: grayscale(100%);
  }

  .seat-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }

  .seat-avatar {
    width: 8vh;
    height: 8vh;
    border-radius: var(--radius-round);
    background: rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  .seat-avatar-placeholder {
    width: 8vh;
    height: 8vh;
    border-radius: var(--radius-round);
    background: rgba(255, 255, 255, 0.05);
    border: 2px dashed var(--color-border-subtle);
    flex-shrink: 0;
  }

  .seat-info {
    display: flex;
    flex-direction: column;
    gap: 0.3vh;
    min-width: 0;
  }

  .seat-name {
    font-size: var(--text-base);
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .seat-status {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--color-warning);
  }

  .seat-status.ready {
    color: var(--color-primary);
  }

  .seat-status.disconnected {
    color: var(--color-error);
  }

  .seat-score {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
  }

  .seat-actions {
    display: flex;
    gap: var(--space-sm);
    margin-top: var(--space-xs);
  }

  .lobby-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-sm);
    margin-top: var(--space-lg);
  }

  .debug-actions {
    margin-top: auto;
    padding-top: var(--space-lg);
    border-top: 1px solid var(--color-border-subtle);
    display: flex;
    gap: 2vw;
    justify-content: center;
  }

  .btn {
    padding: var(--space-md) 4vw;
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--text-md);
    font-family: var(--font-display);
    font-weight: bold;
    cursor: pointer;
    transition: background var(--transition-base);
  }

  .btn-back {
    background: transparent;
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-medium);
    padding: var(--space-sm) 2vw;
    margin-right: 4vw;
    font-size: var(--text-lg);
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

  .btn-small {
    padding: var(--space-xs) 2vw;
    font-size: var(--text-sm);
    background: var(--color-secondary);
    color: var(--color-text-primary);
  }

  .btn-admin {
    font-family: var(--font-mono);
  }

  .btn-danger {
    background: var(--color-destructive);
    color: var(--color-text-primary);
  }

  .btn-danger:hover {
    background: var(--color-destructive-hover);
  }

  .hint {
    color: var(--color-text-secondary);
    font-size: var(--text-lg);
  }

  .waiting {
    color: var(--color-warning);
    font-size: var(--text-md);
    font-family: var(--font-mono);
  }

  .connecting {
    font-size: var(--text-lg);
    font-family: var(--font-mono);
    text-align: center;
  }

  .status-message {
    color: var(--color-text-secondary);
    font-size: var(--text-lg);
    font-family: var(--font-mono);
    text-align: center;
  }

  .error {
    color: var(--color-error);
    font-size: var(--text-lg);
    font-family: var(--font-mono);
    text-align: center;
  }

  .status-panel {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
