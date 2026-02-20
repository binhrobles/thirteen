export type Route = "menu" | "local-game" | "online-lobby" | "online-game";

class RouterState {
  current = $state<Route>("menu");
}

export const router = new RouterState();

const validRoutes: Route[] = ["menu", "local-game", "online-lobby", "online-game"];

function isValidRoute(hash: string): hash is Route {
  return validRoutes.includes(hash as Route);
}

export function navigate(route: Route): void {
  router.current = route;
  window.location.hash = route === "menu" ? "" : route;
}

export function initRouter(): void {
  const hash = window.location.hash.slice(1);
  if (isValidRoute(hash)) {
    router.current = hash;
  }

  window.addEventListener("hashchange", () => {
    const h = window.location.hash.slice(1);
    if (isValidRoute(h)) {
      router.current = h;
    } else {
      router.current = "menu";
    }
  });
}
