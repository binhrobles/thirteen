<script lang="ts">
  import { onMount } from "svelte";
  import { router, initRouter } from "./lib/stores/router.svelte.js";
  import MainMenu from "./routes/MainMenu.svelte";
  import LocalGame from "./routes/LocalGame.svelte";

  onMount(() => {
    initRouter();
  });
</script>

<div class="app">
  {#if router.current === "menu"}
    <MainMenu />
  {:else if router.current === "local-game"}
    <LocalGame />
  {/if}
</div>

<style>
  .app {
    width: 100%;
    height: 100%;
  }
</style>
