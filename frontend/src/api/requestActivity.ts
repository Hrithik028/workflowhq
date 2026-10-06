let pendingRequests = 0;
const listeners = new Set<() => void>();
type NavigationScope = { accepting: boolean; requests: Set<symbol> };
let navigation: NavigationScope | null = null;

const publish = () => listeners.forEach((listener) => listener());

export const requestActivity = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => pendingRequests,
  getNavigationSnapshot: () => navigation?.requests.size || 0,
  beginNavigation() {
    const scope: NavigationScope = { accepting: true, requests: new Set() };
    navigation = scope;
    publish();
    return {
      // Capture the page's initial request burst, not later refreshes.
      seal() {
        scope.accepting = false;
      },
      dispose() {
        if (navigation !== scope) return;
        navigation = null;
        publish();
      }
    };
  },
  begin({ foreground = true }: { foreground?: boolean } = {}) {
    const scope = foreground && navigation?.accepting ? navigation : null;
    const id = Symbol("request");
    scope?.requests.add(id);
    pendingRequests += 1;
    publish();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      scope?.requests.delete(id);
      pendingRequests = Math.max(0, pendingRequests - 1);
      publish();
    };
  }
};
