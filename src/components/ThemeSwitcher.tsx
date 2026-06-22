import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "repolens.theme.mode";

const THEME_OPTIONS: Array<{ id: ThemeMode; label: string; Icon: typeof Sun }> = [
  { id: "light", label: "浅色", Icon: Sun },
  { id: "dark", label: "暗黑", Icon: Moon }
];

function parseThemeMode(value: string | null): ThemeMode {
  return value === "dark" ? "dark" : "light";
}

function readStoredThemeMode(): ThemeMode {
  try {
    return parseThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

function persistThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage may be blocked in preview contexts; the current window still updates.
  }
}

function applyThemeMode(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.style.accentColor = "var(--accent)";
}

export function ThemeSwitcher() {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredThemeMode());

  useEffect(() => {
    applyThemeMode(mode);
    persistThemeMode(mode);
  }, [mode]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      setMode(parseThemeMode(event.newValue));
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return (
    <section className="theme-switcher" aria-label="界面明暗模式">
      <span className="theme-label">主题</span>
      <div className="theme-segmented" role="group" aria-label="界面明暗模式">
        {THEME_OPTIONS.map(({ id, label, Icon }) => {
          const isActive = mode === id;
          return (
            <button
              className={`theme-option ${isActive ? "is-active" : ""}`}
              type="button"
              key={id}
              aria-pressed={isActive}
              onClick={() => setMode(id)}
            >
              <span className="theme-icon" aria-hidden="true">
                <Icon size={14} strokeWidth={2.4} />
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
