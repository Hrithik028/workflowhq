import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "../types";
import AiIntegrations from "./AiIntegrations";

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  replace: vi.fn(),
  save: vi.fn(),
  validate: vi.fn()
}));

vi.mock("../api/aiCredentials", () => ({ aiCredentialsApi: apiMocks }));

const user: User = {
  id: 1,
  name: "Credential Owner",
  email: "owner@example.com",
  role: "user",
  createdAt: "2026-09-01T00:00:00.000Z"
};

const renderPage = (isDemo = false) =>
  render(
    <MemoryRouter initialEntries={["/settings/integrations/ai"]}>
      <Routes>
        <Route element={<Outlet context={{ isDemo, user }} />}>
          <Route path="/settings/integrations/ai" element={<AiIntegrations />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("AI integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.list.mockResolvedValue([
      {
        provider: "openai",
        configured: true,
        maskedSuffix: "••••1234",
        keyVersion: 1,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z"
      },
      ...["anthropic", "google"].map((provider) => ({
        provider,
        configured: false,
        maskedSuffix: null,
        keyVersion: null,
        createdAt: null,
        updatedAt: null
      }))
    ]);
    apiMocks.validate.mockResolvedValue(undefined);
    apiMocks.save.mockResolvedValue({
      provider: "anthropic",
      configured: true,
      maskedSuffix: "••••9876",
      keyVersion: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z"
    });
  });

  it("shows only masked saved metadata", async () => {
    renderPage();

    expect(await screen.findByText(/saved as ••••1234/i)).toBeInTheDocument();
    expect(screen.queryByText(/private-provider-secret/i)).not.toBeInTheDocument();
  });

  it("keeps validation separate from saving and clears a saved draft", async () => {
    const browser = userEvent.setup();
    renderPage();
    const input = await screen.findByLabelText(/anthropic credential/i);
    await browser.type(input, "fixture-anthropic-credential-9876");
    await browser.click(screen.getAllByRole("button", { name: /validate only/i })[1]);

    await waitFor(() =>
      expect(apiMocks.validate).toHaveBeenCalledWith(
        "anthropic",
        "fixture-anthropic-credential-9876"
      )
    );
    expect(apiMocks.save).not.toHaveBeenCalled();
    expect(screen.getByText(/not saved yet/i)).toBeInTheDocument();

    const saveButton = screen.getAllByRole("button", { name: /^save$/i })[0];
    await waitFor(() => expect(saveButton).toBeEnabled());
    await browser.click(saveButton);
    await waitFor(() => expect(apiMocks.save).toHaveBeenCalledTimes(1));
    expect(input).toHaveValue("");
    expect(await screen.findByText(/saved as ••••9876/i)).toBeInTheDocument();
  });

  it("never calls live credential APIs in preview mode", () => {
    renderPage(true);
    expect(apiMocks.list).not.toHaveBeenCalled();
    expect(screen.getByText(/controls are disabled in preview mode/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /validate only/i })[0]).toBeDisabled();
  });
});
