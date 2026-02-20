/**
 * Game context provider using Svelte's context API
 *
 * Components use getGameContext() to access the unified game interface,
 * allowing them to work with both local and online game modes.
 */

import { getContext, setContext } from "svelte";
import type { UnifiedGameContext } from "./types.js";

const GAME_CONTEXT_KEY = Symbol("game");

export function setGameContext(ctx: UnifiedGameContext): void {
  setContext(GAME_CONTEXT_KEY, ctx);
}

export function getGameContext(): UnifiedGameContext {
  return getContext<UnifiedGameContext>(GAME_CONTEXT_KEY);
}
