import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({ landing: 0, overview: 0, ai: 0, github: 0 }));
vi.mock("./api/auth", () => ({
  authApi: {
    restore: vi.fn().mockResolvedValue({
      accessToken: "test-session",
      user: { id: 1, name: "Test User", email: "test@example.com", role: "user", createdAt: "" }
    })
  }
}));
vi.mock("./pages/Landing", () => {
  loaded.landing++;
  return { default: () => <h1>Landing only</h1> };
});
vi.mock("./components/AppLayout", () => ({
  default: () => (
    <>
      <input aria-label="Sidebar search" defaultValue="" />
      <Outlet />
    </>
  )
}));
vi.mock("./pages/OverviewEngineering", () => {
  loaded.overview++;
  return { default: () => <h1>Overview only</h1> };
});
vi.mock("./pages/AiIntegrations", () => {
  loaded.ai++;
  return { default: () => <h1>AI providers only</h1> };
});
vi.mock("./pages/GitHubIntegration", () => {
  loaded.github++;
  return { default: () => <h1>GitHub only</h1> };
});

import App from "./App";

function Navigation() {
  const navigate = useNavigate();
  return (
    <nav>
      <button onClick={() => navigate("/app")}>Open overview</button>
      <button onClick={() => navigate("/settings/integrations/ai")}>Open AI</button>
    </nav>
  );
}

describe("application route imports", () => {
  it("loads only the visited routes, not other integration pages", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Navigation />
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByRole("heading", { name: "Landing only" })).toBeVisible();
    expect(loaded).toEqual({ landing: 1, overview: 0, ai: 0, github: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Open overview" }));
    expect(await screen.findByRole("heading", { name: "Overview only" })).toBeVisible();
    expect(loaded.ai).toBe(0);
    expect(loaded.github).toBe(0);
    const sidebarSearch = screen.getByLabelText("Sidebar search");
    fireEvent.change(sidebarSearch, { target: { value: "Keep my sidebar state" } });
    fireEvent.click(screen.getByRole("button", { name: "Open AI" }));
    expect(await screen.findByRole("heading", { name: "AI providers only" })).toBeVisible();
    expect(loaded.ai).toBe(1);
    expect(loaded.github).toBe(0);
    expect(screen.getByLabelText("Sidebar search")).toBe(sidebarSearch);
    expect(sidebarSearch).toHaveValue("Keep my sidebar state");
  });
});
