import { Component, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { DelayedLoadingScreen } from "./LoadingExperience";

class ChunkErrorBoundary extends Component<
  { children: ReactNode; pathname: string },
  { failed: boolean; pathname: string }
> {
  state = { failed: false, pathname: this.props.pathname };

  static getDerivedStateFromProps(props: { pathname: string }, state: { pathname: string }) {
    return props.pathname !== state.pathname ? { failed: false, pathname: props.pathname } : null;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="form-alert error" role="alert">
          <p>
            This page could not load. Check your connection, then reload to get the latest version.
          </p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}

// The nearest boundary keeps the sidebar mounted while a route chunk downloads.
// Query/filter changes do not remount the page; a different path clears chunk errors.
export default function RouteContentBoundary({
  children,
  message = "Opening this page"
}: {
  children: ReactNode;
  message?: string;
}) {
  const { pathname } = useLocation();
  return (
    <ChunkErrorBoundary pathname={pathname}>
      <Suspense fallback={<DelayedLoadingScreen message={message} inline />}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}
