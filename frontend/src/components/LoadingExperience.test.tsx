import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requestActivity } from "../api/requestActivity";
import { LoadingExperience, LoadingScreen } from "./LoadingExperience";

afterEach(() => vi.useRealTimers());

describe("loading experience", () => {
  it("keeps section loading compact without a full-page ribbon", () => {
    render(<LoadingScreen message="Loading workspace settings" inline />);
    expect(screen.getByRole("status")).toHaveClass("work-loading-inline");
    expect(document.querySelector(".work-loading-ribbon")).not.toBeInTheDocument();
  });
  it("shows the branded restoration screen", () => {
    render(<LoadingScreen message="Restoring your workspace" />);
    expect(screen.getByRole("status")).toHaveTextContent("Restoring your workspace");
  });

  it("avoids flashing for quick requests and appears for slower waits", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/workflow"]}>
        <LoadingExperience />
      </MemoryRouter>
    );

    let finish = () => {};
    act(() => {
      finish = requestActivity.begin();
    });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(120));
    expect(screen.getByRole("status")).toHaveTextContent("Opening your workflow");

    act(() => finish());
    act(() => vi.advanceTimersByTime(160));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not show a screen when a request finishes before the delay", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter>
        <LoadingExperience />
      </MemoryRouter>
    );
    let finish = () => {};
    act(() => {
      finish = requestActivity.begin();
    });
    act(() => vi.advanceTimersByTime(100));
    act(() => finish());
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not cover the public landing page with an old request", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <LoadingExperience />
      </MemoryRouter>
    );
    let finish = () => {};
    act(() => {
      finish = requestActivity.begin();
    });
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => finish());
  });
});
