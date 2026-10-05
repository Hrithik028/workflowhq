let pendingRequests = 0;
const listeners = new Set<() => void>();

const publish = () => listeners.forEach((listener) => listener());

export const requestActivity = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => pendingRequests,
  begin() {
    pendingRequests += 1;
    publish();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      pendingRequests = Math.max(0, pendingRequests - 1);
      publish();
    };
  }
};
