"use client";

import { useEffect, useState } from "react";

type Theme = "editorial-dark" | "editorial-light" | "gruvbox-dark" | "gruvbox-light";

const THEMES: { id: Theme; label: string; swatch: string[] }[] = [
  { id: "editorial-dark",  label: "Editorial · dark",  swatch: ["#0c0b09", "#5cf08c", "#ff6b4a"] },
  { id: "editorial-light", label: "Editorial · light", swatch: ["#faf7f2", "#1f8a4c", "#d44a26"] },
  { id: "gruvbox-dark",    label: "Gruvbox · dark",    swatch: ["#282828", "#b8bb26", "#fb4934"] },
  { id: "gruvbox-light",   label: "Gruvbox · light",   swatch: ["#fbf1c7", "#79740e", "#9d0006"] },
];

const STORAGE_KEY = "rolehunter:theme";

function applyTheme(theme: Theme) {
  if (theme === "editorial-dark") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Theme>("editorial-dark");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "editorial-dark";
    setCurrent(stored);
    applyTheme(stored);
  }, []);

  function pick(t: Theme) {
    setCurrent(t);
    localStorage.setItem(STORAGE_KEY, t);
    applyTheme(t);
    setOpen(false);
  }

  const active = THEMES.find((t) => t.id === current) ?? THEMES[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1.5 border border-[var(--border)] rounded-sm bg-[var(--bg-elev)] hover:border-[var(--border-hi)] text-[11px] text-[var(--fg-3)] transition-colors"
        aria-label="Theme switcher"
      >
        <span className="flex items-center gap-0.5">
          {active.swatch.map((c, i) => (
            <span
              key={i}
              className="inline-block w-2.5 h-2.5 rounded-full border border-[var(--border)]"
              style={{ background: c }}
            />
          ))}
        </span>
        <span className="hidden md:inline ml-1 italic" style={{ fontFamily: "var(--font-serif)" }}>
          theme
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full mt-1 z-[95] w-56 rounded-md border border-[var(--border-hi)] bg-[var(--bg-elev)] shadow-2xl overflow-hidden">
            <div
              className="px-3 pt-2 pb-1 italic text-[11px] text-[var(--fg-3)] tracking-wider uppercase"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              theme
            </div>
            {THEMES.map((t) => {
              const isActive = t.id === current;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-[12px] transition-colors ${
                    isActive
                      ? "bg-[var(--bg-elev-2)] text-[var(--fg)]"
                      : "text-[var(--fg-2)] hover:bg-[var(--bg-elev-2)]"
                  }`}
                >
                  <span className="flex items-center gap-0.5">
                    {t.swatch.map((c, i) => (
                      <span
                        key={i}
                        className="inline-block w-3 h-3 rounded-full border border-[var(--border)]"
                        style={{ background: c }}
                      />
                    ))}
                  </span>
                  <span className="flex-1">{t.label}</span>
                  {isActive && (
                    <span
                      className="text-[var(--accent)] font-mono text-[11px]"
                      aria-hidden
                    >
                      ●
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
