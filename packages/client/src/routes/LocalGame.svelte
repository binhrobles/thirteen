<script lang="ts">
  import GameCanvas from "../components/GameCanvas.svelte";
  import StatusBar from "../components/StatusBar.svelte";
  import ActionButtons from "../components/ActionButtons.svelte";
  import GameOverScreen from "../components/GameOverScreen.svelte";
</script>

<div class="local-game">
  <StatusBar />
  <GameCanvas />
  <ActionButtons />
  <GameOverScreen />
</div>

<style>
  .local-game {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1a5c2a;
  }
</style>
