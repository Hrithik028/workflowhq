import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { demoCredentials } from "../demo/credentials";
import Login from "./Login";

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
});
