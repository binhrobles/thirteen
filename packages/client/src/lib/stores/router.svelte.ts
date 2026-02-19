export type Route = "menu" | "local-game";

class RouterState {
  current = $state<Route>("menu");
}

export const router = new RouterState();

export function navigate(route: Route): void {
  router.current = route;
  window.location.hash = route === "menu" ? "" : route;
}

export function initRouter(): void {
  const hash = window.location.hash.slice(1);
  if (hash === "local-game") {
    router.current = "local-game";
  }

  window.addEventListener("hashchange", () => {
    const h = window.location.hash.slice(1);
    if (h === "local-game") router.current = "local-game";
    else router.current = "menu";
  });
}
