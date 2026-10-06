import { act, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import RouteContentBoundary from "./RouteContentBoundary";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("on-demand page boundary", () => {
  it("keeps the shell visible and delays feedback until a chunk is genuinely slow", async () => {
    vi.useFakeTimers();
    let finish!: (value: { default: () => React.JSX.Element }) => void;
    const Page = lazy(
      () =>
        new Promise<{ default: () => React.JSX.Element }>((resolve) => {
          finish = resolve;
        })
    );
    render(
      <MemoryRouter>
        <nav>Persistent sidebar</nav>
        <RouteContentBoundary>
          <Page />
        </RouteContentBoundary>
      </MemoryRouter>
    );
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getByText("Persistent sidebar")).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveClass("work-loading-inline");
    await act(async () => finish({ default: () => <h1>Page ready</h1> }));
    expect(screen.getByRole("heading", { name: "Page ready" })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("never flashes an indicator for a quick import", async () => {
    vi.useFakeTimers();
    const Page = lazy(async () => ({ default: () => <h1>Fast page</h1> }));
    await act(async () => {
      render(
        <MemoryRouter>
          <RouteContentBoundary>
            <Page />
          </RouteContentBoundary>
        </MemoryRouter>
      );
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("heading", { name: "Fast page" })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("provides recovery rather than a blank app for a rejected chunk", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const chunkError = new Error("Chunk unavailable");
    // React 18 reports caught render errors through jsdom's window error event too.
    // Silence only this deliberately injected failure; unexpected errors still surface.
    const handleExpectedError = (event: ErrorEvent) => {
      if (event.error === chunkError) event.preventDefault();
    };
    window.addEventListener("error", handleExpectedError);
    try {
      const Page = lazy(() => Promise.reject(chunkError));
      render(
        <MemoryRouter>
          <RouteContentBoundary>
            <Page />
          </RouteContentBoundary>
        </MemoryRouter>
      );
      expect(await screen.findByRole("alert")).toHaveTextContent("This page could not load");
      expect(screen.getByRole("button", { name: "Reload page" })).toBeVisible();
    } finally {
      window.removeEventListener("error", handleExpectedError);
    }
  });
});
