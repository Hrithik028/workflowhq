import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiModelPicker } from "./AiModelPicker";
import { budgetModels } from "../lib/aiModels";

describe("AI model preferences", () => {
  it("defaults to budget and requires explicit choice for another model", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AiModelPicker provider="openai" value={budgetModels.openai} onChange={onChange} />);
    expect(screen.getByRole("combobox", { name: "Model preference" })).toHaveValue("budget");
    expect(screen.queryByRole("textbox", { name: "AI model" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Model preference" }), "custom");
    expect(onChange).toHaveBeenCalledWith("");
    expect(screen.getByRole("textbox", { name: "AI model" })).toBeRequired();
    await user.selectOptions(screen.getByRole("combobox", { name: "Model preference" }), "budget");
    expect(onChange).toHaveBeenLastCalledWith(budgetModels.openai);
  });
});
