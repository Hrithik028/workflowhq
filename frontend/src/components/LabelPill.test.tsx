import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Label } from "../types";
import LabelPill from "./LabelPill";

const label: Label = {
  id: 1,
  projectId: 1,
  name: "Urgent",
  color: "#ff5500",
  createdAt: "2026-08-19T00:00:00.000Z"
};

describe("LabelPill", () => {
  it("shows the label name and no remove control by default", () => {
    render(<LabelPill label={label} />);

    expect(screen.getByText("Urgent")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("calls onRemove with the label when the remove control is used", async () => {
    const onRemove = vi.fn();
    render(<LabelPill label={label} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove Urgent label" }));

    expect(onRemove).toHaveBeenCalledWith(label);
  });
});
