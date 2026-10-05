import { createContext, useContext } from "react";

export const PublicGlowContext = createContext(false);

export function usePublicGlow() {
  return useContext(PublicGlowContext);
}
