<script lang="ts">
  import { setGameContext } from "../lib/stores/game-context.svelte.js";
  import { createLocalAdapter } from "../lib/stores/adapters/local-adapter.svelte.js";
  import { createOnlineAdapter } from "../lib/stores/adapters/online-adapter.svelte.js";
  import GameCanvas from "../components/GameCanvas.svelte";
  import StatusBar from "../components/StatusBar.svelte";
  import ActionButtons from "../components/ActionButtons.svelte";
  import GameOverScreen from "../components/GameOverScreen.svelte";
  import RoundHistoryDrawer from "../components/RoundHistoryDrawer.svelte";
  import Opponents from "../components/Opponents.svelte";

  interface Props {
    mode: "local" | "online";
  }
  let { mode }: Props = $props();

  const adapter = mode === "local" ? createLocalAdapter() : createOnlineAdapter();
  setGameContext(adapter);
</script>

<div class="game">
  <StatusBar />
  <Opponents />
  <GameCanvas />
  <ActionButtons />
  <GameOverScreen />
  {#if mode === "local"}
    <RoundHistoryDrawer />
  {/if}
</div>

<style>
  .game {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1a5c2a;
  }
</style>
