import { Moon, Sun } from "lucide-react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { ThemeContext, useTheme, type Theme } from "./theme-context";

const storageKey = "workflowhq-theme";

function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem("workflowhq-landing-theme");
    return saved === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101922" : "#f5f2ec");
    try {
      window.localStorage.setItem(storageKey, theme);
    } catch {
      // Navigation still keeps the selected theme for this session.
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme((current) => current === "dark" ? "light" : "dark") }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${next} mode`}
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      title={`Switch to ${next} mode`}
      type="button"
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
