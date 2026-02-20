<script lang="ts">
  import GameCanvas from "../components/GameCanvas.svelte";
  import StatusBar from "../components/StatusBar.svelte";
  import ActionButtons from "../components/ActionButtons.svelte";
  import GameOverScreen from "../components/GameOverScreen.svelte";
  import RoundHistoryDrawer from "../components/RoundHistoryDrawer.svelte";
</script>

<div class="local-game">
  <StatusBar />
  <GameCanvas />
  <ActionButtons />
  <GameOverScreen />
  <RoundHistoryDrawer />
</div>

<style>
  .local-game {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1a5c2a;
  }
</style>
