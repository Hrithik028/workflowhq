import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import ProtectedRoute from "./ProtectedRoute";

afterEach(() => vi.useRealTimers());

describe("ProtectedRoute", () => {
  it("delays auth loading without exposing protected content and hides it on completion", () => {
    vi.useFakeTimers();
    const view = (isChecking: boolean) => (
      <MemoryRouter>
        <ProtectedRoute isAuthenticated isChecking={isChecking}>
          <p>Private workspace</p>
        </ProtectedRoute>
      </MemoryRouter>
    );
    const rendered = render(view(true));
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("Private workspace")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent("Restoring your workspace");
    rendered.rerender(view(false));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Private workspace")).toBeInTheDocument();
  });

  it("redirects an unauthenticated visitor to sign in", () => {
    render(
      <MemoryRouter initialEntries={["/app"]}>
        <Routes>
          <Route path="/login" element={<p>Sign in screen</p>} />
          <Route
            path="/app"
            element={
              <ProtectedRoute isAuthenticated={false} isChecking={false}>
                <p>Private workspace</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Sign in screen")).toBeInTheDocument();
    expect(screen.queryByText("Private workspace")).not.toBeInTheDocument();
  });

  it("renders private content for an authenticated user", () => {
    render(
      <MemoryRouter>
        <ProtectedRoute isAuthenticated isChecking={false}>
          <p>Private workspace</p>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText("Private workspace")).toBeInTheDocument();
  });
});
