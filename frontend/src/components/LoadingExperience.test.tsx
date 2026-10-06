import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { requestActivity } from "../api/requestActivity";
import { DelayedLoadingScreen, LoadingExperience, LoadingScreen } from "./LoadingExperience";

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
    act(() => vi.advanceTimersByTime(999));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent("Opening your workflow");

    act(() => finish());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not show a screen when a request finishes before the delay", () => {
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
    act(() => vi.advanceTimersByTime(900));
    act(() => finish());
    act(() => vi.advanceTimersByTime(1000));
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
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => finish());
  });

  it("does not accumulate separate short waits or reuse a previous visible loader", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/workflow"]}>
        <LoadingExperience />
      </MemoryRouter>
    );
    for (let request = 0; request < 3; request += 1) {
      let finish = () => {};
      act(() => {
        finish = requestActivity.begin();
      });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      act(() => finish());
    }
    let finish = () => {};
    act(() => {
      finish = requestActivity.begin();
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => finish());
    act(() => {
      finish = requestActivity.begin();
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => finish());
  });

  it("keeps one loader for concurrent requests and hides it when all finish", () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/workflow"]}>
        <LoadingExperience />
      </MemoryRouter>
    );
    let first = () => {};
    let second = () => {};
    act(() => {
      first = requestActivity.begin();
    });
    act(() => vi.advanceTimersByTime(700));
    act(() => {
      second = requestActivity.begin();
    });
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    act(() => first());
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => second());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("restarts the delay on navigation and never carries a stale overlay onto another tab", () => {
    vi.useFakeTimers();
    function Tabs() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate("/projects")}>Projects</button>
          <LoadingExperience />
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={["/workflow"]}>
        <Tabs />
      </MemoryRouter>
    );
    let finish = () => {};
    act(() => {
      finish = requestActivity.begin();
    });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toHaveTextContent("Opening your workflow");
    act(() => screen.getByRole("button", { name: "Projects" }).click());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(999));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent("Loading project context");
    act(() => finish());
  });

  it("cancels a section loader when the section finishes or changes", () => {
    vi.useFakeTimers();
    const view = render(<DelayedLoadingScreen key="first" message="Loading workspaces" inline />);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("status")).toHaveClass("work-loading-inline");
    view.rerender(<DelayedLoadingScreen key="second" message="Loading settings" inline />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    view.unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
