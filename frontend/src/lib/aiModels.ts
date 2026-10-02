import type { AiProvider } from "../types";

// Budget-oriented defaults checked against official provider documentation.
// Keep custom IDs available because model access differs between accounts.
export const budgetModels: Record<AiProvider, string> = {
  openai: "gpt-5.6-luna",
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.5-flash-lite"
};
