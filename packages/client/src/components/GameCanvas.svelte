<script lang="ts">
  import { onMount } from "svelte";
  import { Application } from "pixi.js";
  import { GameApp } from "../lib/pixi/game-app.js";
  import { preloadCardTextures } from "../lib/pixi/card-sprite.js";
  import { getGameContext } from "../lib/stores/game-context.svelte.js";
  import { PIXI_COLORS } from "../lib/design-tokens.js";

  const ctx = getGameContext();

  let canvasContainer: HTMLDivElement;
  let gameApp = $state<GameApp | null>(null);
  let loading = $state(true);

  onMount(() => {
    let destroyed = false;

    (async () => {
      const app = new Application();
      await app.init({
        background: PIXI_COLORS.felt,
        resizeTo: canvasContainer,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (destroyed) {
        app.destroy(true);
        return;
      }

      canvasContainer.appendChild(app.canvas);
      await preloadCardTextures();

      if (destroyed) {
        app.destroy(true);
        return;
      }

      const ga = new GameApp(app);
      ga.onCardClick(ctx.actions.toggleCard);
      ga.onPlayAreaClick(ctx.actions.toggleRoundHistory);
      gameApp = ga;
      loading = false;
    })();

    return () => {
      destroyed = true;
      gameApp?.destroy();
      gameApp = null;
    };
  });

  $effect(() => {
    // Access state to trigger reactivity
    const view = ctx.stateView;
    const selected = ctx.state.selectedCards;
    const yourPos = ctx.state.yourPosition;

    if (gameApp && view.currentPlayer >= 0) {
      gameApp.updateFromState(view, selected, yourPos);
    }
  });
</script>

<div class="canvas-container" bind:this={canvasContainer}>
  {#if loading}
    <div class="loading">Loading...</div>
  {/if}
</div>

<style>
  .canvas-container {
    width: 100%;
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .canvas-container :global(canvas) {
    display: block;
  }

  .loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: white;
    font-size: 1.2rem;
  }
</style>
