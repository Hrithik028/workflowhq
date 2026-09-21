import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { authApi } from "../api/auth";
import ForgotPassword from "./ForgotPassword";
import ResetPassword from "./ResetPassword";
import VerifyEmail from "./VerifyEmail";

vi.mock("../api/auth", () => ({
  authApi: {
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    verifyEmail: vi.fn()
  }
}));

describe("account recovery screens", () => {
  it("uses a generic confirmation for password-reset requests", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.requestPasswordReset).mockResolvedValue();
    render(
      <MemoryRouter>
        <ForgotPassword />
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText(/email address/i), "person@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByText(/if an account exists/i)).toBeInTheDocument();
  });

  it("submits a reset token and new password", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.resetPassword).mockResolvedValue();
    render(
      <MemoryRouter initialEntries={["/reset-password?token=reset-token"]}>
        <ResetPassword />
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText(/new password/i), "new-password-123");
    await user.click(screen.getByRole("button", { name: /update password/i }));
    expect(authApi.resetPassword).toHaveBeenCalledWith("reset-token", "new-password-123");
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it("verifies the token from the email link", async () => {
    vi.mocked(authApi.verifyEmail).mockResolvedValue();
    render(
      <MemoryRouter initialEntries={["/verify-email?token=verify-token"]}>
        <VerifyEmail />
      </MemoryRouter>
    );
    await waitFor(() => expect(authApi.verifyEmail).toHaveBeenCalledWith("verify-token"));
    expect(await screen.findByText(/you are ready to work/i)).toBeInTheDocument();
  });
});
