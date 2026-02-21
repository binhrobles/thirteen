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

  const WS_URL = "wss://6u47cryn67.execute-api.us-east-1.amazonaws.com/prod";

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

  function handleDisconnect() {
    disconnectFromServer();
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
        <button class="btn btn-small" onclick={handleDisconnect}>Disconnect</button>
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
          <button class="btn btn-small" onclick={handleQuickStart}>Quick Start</button>
          <button class="btn btn-small btn-danger" onclick={debugReset}>Reset Tourney</button>
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
    background: #1a5c2a;
    color: white;
    font-family: monospace;
    padding: 2vh;
    box-sizing: border-box;
  }

  header {
    display: flex;
    align-items: center;
    gap: 2vw;
    margin-bottom: 2vh;
  }

  h1 {
    font-size: 4vh;
    margin: 0;
  }

  .connect-form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2vh;
    margin-top: 2vh;
  }

  .avatar {
    width: 20vh;
    height: 20vh;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5vh;
    width: 80%;
    max-width: 300px;
  }

  .form-group label {
    font-size: 2vh;
  }

  .form-group input[type="text"] {
    padding: 1.5vh;
    font-size: 2.5vh;
    font-family: monospace;
    border: none;
    border-radius: 0.5vh;
    text-align: center;
  }

  .lobby-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2vh;
  }

  .connection-status {
    display: flex;
    align-items: center;
    gap: 1vw;
    font-size: 2vh;
  }

  .status-dot {
    width: 1.5vh;
    height: 1.5vh;
    border-radius: 50%;
  }

  .status-dot.connected {
    background: #2ecc40;
  }

  .seats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2vh;
  }

  .seat {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 1vh;
    padding: 1.5vh;
    display: flex;
    flex-direction: column;
    gap: 0.5vh;
  }

  .seat.occupied {
    background: rgba(0, 0, 0, 0.4);
  }

  .seat.you {
    border: 2px solid #2ecc40;
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
    gap: 1.5vh;
  }

  .seat-avatar {
    width: 8vh;
    height: 8vh;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
  }

  .seat-avatar-placeholder {
    width: 8vh;
    height: 8vh;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    border: 2px dashed rgba(255, 255, 255, 0.2);
    flex-shrink: 0;
  }

  .seat-info {
    display: flex;
    flex-direction: column;
    gap: 0.3vh;
    min-width: 0;
  }

  .seat-name {
    font-size: 2.2vh;
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .seat-status {
    font-size: 1.6vh;
    color: #ff851b;
  }

  .seat-status.ready {
    color: #2ecc40;
  }

  .seat-status.disconnected {
    color: #ff4136;
  }

  .seat-score {
    font-size: 1.5vh;
    color: #aaa;
  }

  .seat-actions {
    display: flex;
    gap: 1vh;
    margin-top: 0.5vh;
  }

  .lobby-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1vh;
    margin-top: 2vh;
  }

  .debug-actions {
    margin-top: auto;
    padding-top: 2vh;
    border-top: 1px solid rgba(255,255,255,0.2);
    display: flex;
    gap: 2vw;
    justify-content: center;
  }

  .btn {
    padding: 1.5vh 4vw;
    border: none;
    border-radius: 0.5vh;
    font-size: 2.5vh;
    font-family: monospace;
    font-weight: bold;
    cursor: pointer;
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

  .btn-primary:hover {
    background: #3dd84e;
  }

  .btn-secondary {
    background: #555;
    color: white;
  }

  .btn-small {
    padding: 0.8vh 2vw;
    font-size: 1.8vh;
    background: #444;
    color: white;
  }

  .btn-danger {
    background: #a33;
    color: white;
  }

  .hint {
    color: #aaa;
    font-size: 2vh;
  }

  .waiting {
    color: #ff851b;
    font-size: 2.5vh;
  }

  .connecting {
    font-size: 3vh;
    text-align: center;
  }

  .status-message {
    color: #aaa;
    font-size: 2vh;
    text-align: center;
  }

  .error {
    color: #ff4136;
    font-size: 2vh;
    text-align: center;
  }

  .status-panel {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
