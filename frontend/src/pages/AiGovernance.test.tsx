import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiGovernanceSnapshot, User } from "../types";
import AiGovernance from "./AiGovernance";

const adminMocks = vi.hoisted(() => ({
  getAiGovernance: vi.fn(),
  updateAiGovernance: vi.fn()
}));

vi.mock("../api/admin", () => ({ adminApi: adminMocks }));

const owner: User = {
  id: 1,
  name: "Platform Owner",
  email: "owner@workflowhq.dev",
  role: "platform_owner",
  createdAt: "2026-01-01T00:00:00.000Z"
};

const snapshot: AiGovernanceSnapshot = {
  settings: {
    deploymentEnabled: true,
    enforcementEnabled: true,
    providerPolicies: [
      {
        provider: "openai",
        enabled: true,
        allowedModels: ["gpt-5"],
        defaultModel: "gpt-5"
      },
      { provider: "anthropic", enabled: false, allowedModels: [], defaultModel: null },
      { provider: "google", enabled: false, allowedModels: [], defaultModel: null }
    ],
    dailyRunLimit: 20,
    maxPromptCharacters: 20000,
    maxOutputTokens: 4000,
    maxProposedActions: 20,
    requestTimeoutMs: 30000,
    retentionDays: 30,
    updatedBy: 1,
    updatedAt: "2026-09-01T00:00:00.000Z",
    serverCeilings: {
      dailyRunLimit: 100,
      maxPromptCharacters: 50000,
      maxOutputTokens: 10000,
      maxProposedActions: 50,
      requestTimeoutMs: 60000,
      retentionDays: 90
    }
  },
  usage: {
    windowHours: 24,
    totalRuns: 3,
    succeededRuns: 2,
    failedRuns: 1,
    providerHealth: [
      {
        provider: "openai",
        status: "healthy",
        succeeded: 2,
        failed: 1,
        averageLatencyMs: 850,
        lastFailureCode: "AI_PROVIDER_UNAVAILABLE",
        lastFailureAt: "2026-09-01T00:00:00.000Z"
      },
      {
        provider: "anthropic",
        status: "unknown",
        succeeded: 0,
        failed: 0,
        averageLatencyMs: 0,
        lastFailureCode: null,
        lastFailureAt: null
      },
      {
        provider: "google",
        status: "unknown",
        succeeded: 0,
        failed: 0,
        averageLatencyMs: 0,
        lastFailureCode: null,
        lastFailureAt: null
      }
    ]
  }
};

const renderPage = (user: User = owner, isDemo = false) =>
  render(
    <MemoryRouter initialEntries={["/settings/ai-governance"]}>
      <Routes>
        <Route element={<Outlet context={{ isDemo, user }} />}>
          <Route path="/settings/ai-governance" element={<AiGovernance />} />
          <Route path="/settings" element={<p>Settings</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("AI governance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminMocks.getAiGovernance.mockResolvedValue(snapshot);
    adminMocks.updateAiGovernance.mockResolvedValue(snapshot);
  });

  it("loads sanitized provider health and server ceilings for the platform owner", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /approved ai operators/i })
    ).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/healthy · 850 ms average/i)).toBeInTheDocument();
    expect(screen.getByText(/server max 50,000/i)).toBeInTheDocument();
  });

  it("submits only policy and limit fields", async () => {
    renderPage();
    const dailyRuns = await screen.findByLabelText("Daily runs");
    fireEvent.change(dailyRuns, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: /save governance policy/i }));

    await waitFor(() =>
      expect(adminMocks.updateAiGovernance).toHaveBeenCalledWith(
        expect.objectContaining({ dailyRunLimit: 25 })
      )
    );
    const sent = adminMocks.updateAiGovernance.mock.calls[0][0];
    expect(sent).not.toHaveProperty("serverCeilings");
    expect(sent).not.toHaveProperty("deploymentEnabled");
  });

  it("does not load governance data for an administrator", () => {
    renderPage({ ...owner, role: "admin" });

    expect(
      screen.getByRole("heading", { name: /ai governance is protected/i })
    ).toBeInTheDocument();
    expect(adminMocks.getAiGovernance).not.toHaveBeenCalled();
  });
});
