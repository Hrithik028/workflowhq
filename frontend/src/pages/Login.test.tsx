import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { demoCredentials } from "../demo/credentials";
import Login from "./Login";
import { authApi } from "../api/auth";

vi.mock("../api/auth", () => ({
  authApi: {
    login: vi.fn(),
    verifyMfa: vi.fn()
  }
}));

describe("Login demo account", () => {
  it("shows public demo credentials and opens the populated workspace without the API", async () => {
    const user = userEvent.setup();
    const onDemo = vi.fn();

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/app" element={<p>Populated demo workspace</p>} />
          <Route path="/login" element={<Login onDemo={onDemo} onSuccess={vi.fn()} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(demoCredentials.email)).toBeInTheDocument();
    expect(screen.getByText(demoCredentials.password)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /fill credentials/i }));
    expect(screen.getByRole("textbox", { name: /email address/i })).toHaveValue(
      demoCredentials.email
    );
    expect(document.querySelector('input[name="password"]')).toHaveValue(demoCredentials.password);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(onDemo).toHaveBeenCalledOnce();
    expect(screen.getByText("Populated demo workspace")).toBeInTheDocument();
  });

  it("preserves a secure invitation return path and hides demo entry", () => {
    const invitationPath = `/invitations/${"a".repeat(43)}`;
    render(
      <MemoryRouter initialEntries={[`/login?next=${encodeURIComponent(invitationPath)}`]}>
        <Login onDemo={vi.fn()} onSuccess={vi.fn()} />
      </MemoryRouter>
    );

    expect(screen.queryByLabelText("Demo login")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create an account/i })).toHaveAttribute(
      "href",
      `/register?next=${encodeURIComponent(invitationPath)}`
    );
  });

  it("completes an MFA challenge before opening the workspace", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.mocked(authApi.login).mockResolvedValue({ type: "mfa", challengeToken: "challenge" });
    vi.mocked(authApi.verifyMfa).mockResolvedValue({
      accessToken: "access",
      user: { id: 7, name: "Alex", email: "alex@example.com", role: "user", createdAt: "now" }
    });

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/app" element={<p>Secure workspace</p>} />
          <Route
            path="/login"
            element={<Login allowDemo={false} onDemo={vi.fn()} onSuccess={onSuccess} />}
          />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByRole("textbox", { name: /email address/i }), "alex@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.type(await screen.findByLabelText(/authentication code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify and sign in/i }));

    expect(authApi.verifyMfa).toHaveBeenCalledWith("challenge", "123456");
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(screen.getByText("Secure workspace")).toBeInTheDocument();
  });
});
