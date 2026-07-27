"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type Theme = "light" | "dark";

/**
 * Light/dark switch.
 *
 * The applied theme is set by the inline script in app/layout.tsx before first
 * paint; this component only reflects and changes it. Reading the state from the
 * DOM rather than from storage keeps the two in step even if the script's
 * fallback (the OS preference) was what actually decided.
 */
export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme((document.documentElement.getAttribute("data-theme") as Theme) ?? "light");
  }, []);

  const set = (t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("theme", t);
    } catch {
      // Private-mode or blocked storage: the choice just will not persist.
    }
    setTheme(t);
  };

  // Render nothing until mounted: the server has no way to know the theme, and
  // guessing would produce a button whose label flips on hydration.
  if (theme === null) return <span className="theme-toggle-placeholder" aria-hidden />;

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => set(next)}
      aria-label={next === "dark" ? t.theme.toDark : t.theme.toLight}
      title={next === "dark" ? t.theme.toDark : t.theme.toLight}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5 5.8 5.8 0 1 0 13.5 9.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.3" />
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1" />
      </g>
    </svg>
  );
}
