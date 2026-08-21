import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import ProtectedRoute from "./ProtectedRoute";

describe("ProtectedRoute", () => {
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
