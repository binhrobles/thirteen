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
  } from "../lib/stores/online.svelte.js";
  import { ConnectionState } from "../lib/ws/index.js";

  // Default to local SAM endpoint - change for production
  const WS_URL = "wss://your-api-gateway-url.execute-api.region.amazonaws.com/Prod";
  const LOCAL_WS_URL = "ws://127.0.0.1:3001";

  let useLocalServer = $state(true);
  let nameInput = $state("Player");

  onMount(() => {
    initOnline();
  });

  onDestroy(() => {
    // Don't disconnect on destroy - user might be navigating to game
  });

  function handleConnect() {
    setPlayerName(nameInput);
    const url = useLocalServer ? LOCAL_WS_URL : WS_URL;
    connectToServer(url);
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

  function getSeatDisplay(seat: { position: number; playerId: string | null; playerName: string | null; isBot: boolean; isReady: boolean; score: number } | undefined) {
    if (!seat) return { name: "Empty", status: "", canClaim: false, canKick: false, isYou: false };

    const isYou = seat.playerId === online.playerId;

    if (!seat.playerId && !seat.isBot) {
      return { name: "Empty", status: "", canClaim: true, canKick: false, isYou: false };
    }

    if (seat.isBot) {
      return { name: seat.playerName ?? "Bot", status: seat.isReady ? "Ready" : "", canClaim: false, canKick: true, isYou: false };
    }

    return {
      name: isYou ? `${seat.playerName} (You)` : seat.playerName ?? "Player",
      status: seat.isReady ? "Ready" : "Not Ready",
      canClaim: false,
      canKick: false,
      isYou,
    };
  }

  function isInTourney(): boolean {
    if (!online.tourney) return false;
    return online.tourney.seats.some(s => s.playerId === online.playerId);
  }

  function isReady(): boolean {
    if (!online.tourney) return false;
    const seat = online.tourney.seats.find(s => s.playerId === online.playerId);
    return seat?.isReady ?? false;
  }

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
      <div class="form-group">
        <label for="name">Your Name</label>
        <input
          id="name"
          type="text"
          bind:value={nameInput}
          placeholder="Enter your name"
          maxlength="20"
        />
      </div>

      <div class="form-group">
        <label>
          <input type="checkbox" bind:checked={useLocalServer} />
          Use local server (dev)
        </label>
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
            <div class="seat" class:occupied={seat.playerId || seat.isBot} class:you={display.isYou}>
              <div class="seat-number">Seat {i + 1}</div>
              <div class="seat-name">{display.name}</div>
              {#if display.status}
                <div class="seat-status" class:ready={seat.isReady}>{display.status}</div>
              {/if}
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
          {#if isInTourney()}
            {#if !isReady()}
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
          <button class="btn btn-small" onclick={handleQuickStart}>Quick Start (Debug)</button>
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
    margin-top: 4vh;
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
  }

  .form-group input[type="checkbox"] {
    margin-right: 1vh;
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
    padding: 2vh;
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

  .seat-number {
    font-size: 1.8vh;
    color: #888;
  }

  .seat-name {
    font-size: 2.5vh;
    font-weight: bold;
  }

  .seat-status {
    font-size: 1.8vh;
    color: #ff851b;
  }

  .seat-status.ready {
    color: #2ecc40;
  }

  .seat-score {
    font-size: 1.6vh;
    color: #aaa;
  }

  .seat-actions {
    display: flex;
    gap: 1vh;
    margin-top: 1vh;
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
