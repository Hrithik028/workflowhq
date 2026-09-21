import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { authApi } from "../api/auth";
import SecuritySettings from "./SecuritySettings";

vi.mock("../api/auth", () => ({
  authApi: {
    getSessions: vi.fn(),
    getMfaStatus: vi.fn(),
    revokeSession: vi.fn(),
    revokeAllSessions: vi.fn(),
    startMfaSetup: vi.fn(),
    enableMfa: vi.fn(),
    disableMfa: vi.fn()
  }
}));

describe("SecuritySettings", () => {
  it("loads active sessions and revokes another device", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.getMfaStatus).mockResolvedValue({
      enabled: false,
      enabledAt: null,
      recoveryCodesRemaining: 0
    });
    vi.mocked(authApi.getSessions).mockResolvedValue([
      {
        id: 1,
        current: true,
        userAgent: "Current",
        ipAddress: "127.0.0.1",
        createdAt: "2026-01-01",
        lastUsedAt: "2026-01-02",
        expiresAt: "2026-02-01"
      },
      {
        id: 2,
        current: false,
        userAgent: "Firefox",
        ipAddress: "10.0.0.2",
        createdAt: "2026-01-01",
        lastUsedAt: "2026-01-02",
        expiresAt: "2026-02-01"
      }
    ]);
    vi.mocked(authApi.revokeSession).mockResolvedValue();

    render(
      <MemoryRouter>
        <SecuritySettings onSignedOut={vi.fn()} />
      </MemoryRouter>
    );
    expect(await screen.findByText("Firefox")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /revoke session/i })[0]);
    expect(authApi.revokeSession).toHaveBeenCalledWith(2);
  });

  it("starts authenticator setup after password confirmation", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.getMfaStatus).mockResolvedValue({
      enabled: false,
      enabledAt: null,
      recoveryCodesRemaining: 0
    });
    vi.mocked(authApi.getSessions).mockResolvedValue([]);
    vi.mocked(authApi.startMfaSetup).mockResolvedValue({
      secret: "ABCDEF",
      otpAuthUri: "otpauth://totp/example"
    });

    render(
      <MemoryRouter>
        <SecuritySettings onSignedOut={vi.fn()} />
      </MemoryRouter>
    );
    await user.type(await screen.findByLabelText(/confirm your password/i), "password123");
    await user.click(screen.getByRole("button", { name: /set up mfa/i }));
    expect(await screen.findByText("ABCDEF")).toBeInTheDocument();
  });
});
