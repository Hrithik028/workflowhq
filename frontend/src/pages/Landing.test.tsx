import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import Landing from "./Landing";

describe("Landing", () => {
  it("lets a signed-in user return to the workspace", () => {
    render(
      <MemoryRouter>
        <Landing authenticated />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: /go to your workspace/i })).toHaveAttribute(
      "href",
      "/app"
    );
  });

  it("offers account creation to a visitor", () => {
    render(
      <MemoryRouter>
        <Landing authenticated={false} />
      </MemoryRouter>
    );
    expect(screen.getByRole("link", { name: /get started/i })).toHaveAttribute("href", "/register");
  });
});
