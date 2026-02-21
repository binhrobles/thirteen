<script lang="ts">
  import { onMount } from "svelte";
  import Game from "./Game.svelte";
  import {
    initOnline,
    connectToServer,
    getStoredSession,
  } from "../lib/stores/online.svelte.js";
  import { ConnectionState } from "../lib/ws/index.js";
  import { wsClient } from "../lib/ws/client.svelte.js";
  import { WS_URL } from "../lib/config.js";

  onMount(() => {
    initOnline();

    // If we have a stored session but aren't connected, reconnect automatically
    // This handles the case where the user refreshes the page while in a game
    const session = getStoredSession();
    const isDisconnected =
      wsClient.state === ConnectionState.DISCONNECTED ||
      wsClient.state === ConnectionState.ERROR;

    if (session && isDisconnected) {
      console.log(
        `[OnlineGame] Auto-reconnecting to game (seat ${session.seatPosition})...`
      );
      connectToServer(WS_URL);
    }
  });
</script>

<Game mode="online" />
