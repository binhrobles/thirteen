<script lang="ts">
  import { onMount } from "svelte";
  import { router, initRouter } from "./lib/stores/router.svelte.js";
  import MainMenu from "./routes/MainMenu.svelte";
  import LocalGame from "./routes/LocalGame.svelte";
  import OnlineLobby from "./routes/OnlineLobby.svelte";
  import OnlineGame from "./routes/OnlineGame.svelte";

  onMount(() => {
    initRouter();
  });
</script>

<div class="app">
  {#if router.current === "menu"}
    <MainMenu />
  {:else if router.current === "local-game"}
    <LocalGame />
  {:else if router.current === "online-lobby"}
    <OnlineLobby />
  {:else if router.current === "online-game"}
    <OnlineGame />
  {/if}
</div>

<style>
  .app {
    font-family: 'Playfair Display', serif;
    width: 100%;
    height: 100%;
  }
</style>
