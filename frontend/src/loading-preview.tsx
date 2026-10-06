import React from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

import { LoadingScreen } from "./components/LoadingExperience";
import LoadingTimingPreview from "./components/LoadingTimingPreview";
import { ThemeContext, type Theme } from "./theme-context";
import "./styles.css";
import "./editorial.css";
import "./theme.css";

const theme: Theme =
  new URLSearchParams(window.location.search).get("theme") === "light" ? "light" : "dark";
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeContext.Provider value={{ theme, toggleTheme: () => {} }}>
      {new URLSearchParams(window.location.search).get("timing") === "true" ? (
        <MemoryRouter initialEntries={["/workflow"]}>
          <LoadingTimingPreview />
        </MemoryRouter>
      ) : (
        <LoadingScreen message="Opening your workflow" />
      )}
    </ThemeContext.Provider>
  </React.StrictMode>
);
