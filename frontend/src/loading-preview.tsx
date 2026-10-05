import React from "react";
import ReactDOM from "react-dom/client";

import { LoadingScreen } from "./components/LoadingExperience";
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
      <LoadingScreen message="Opening your workflow" />
    </ThemeContext.Provider>
  </React.StrictMode>
);
