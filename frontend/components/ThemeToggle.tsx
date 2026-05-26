"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";
type Accent = "blue" | "teal" | "violet" | "orange";

const THEME_KEY = "mm.theme";
const ACCENT_KEY = "mm.accent";

const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: "blue", label: "Blue", color: "#5b9dff" },
  { id: "teal", label: "Teal", color: "#00e5c7" },
  { id: "violet", label: "Violet", color: "#a78bfa" },
  { id: "orange", label: "Orange", color: "#ff8c42" },
];

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
}

function readAccent(): Accent {
  if (typeof window === "undefined") return "blue";
  return (document.documentElement.getAttribute("data-accent") as Accent) || "blue";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [accent, setAccent] = useState<Accent>("blue");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setAccent(readAccent());
  }, []);

  function applyTheme(next: Theme) {
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }

  function applyAccent(next: Accent) {
    setAccent(next);
    document.documentElement.setAttribute("data-accent", next);
    try {
      localStorage.setItem(ACCENT_KEY, next);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-[6px] rounded-btn border border-mm-border-soft hover:bg-mm-surface-2 text-[11px] text-mm-text-dim"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2">
          <span aria-hidden>{theme === "dark" ? "◐" : "◑"}</span>
          {theme === "dark" ? "Dark" : "Light"}
        </span>
        <span
          className="w-[10px] h-[10px] rounded-full border border-mm-border"
          style={{ background: ACCENTS.find((a) => a.id === accent)?.color }}
          aria-label={`accent ${accent}`}
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 p-2 rounded-card bg-mm-surface border border-mm-border shadow-lg z-10">
          <div className="text-[10px] uppercase tracking-[0.6px] text-mm-text-mute mb-1">
            Theme
          </div>
          <div className="grid grid-cols-2 gap-1 mb-2">
            {(["dark", "light"] as const).map((t) => (
              <button
                key={t}
                onClick={() => applyTheme(t)}
                className={`px-2 py-1 rounded text-[11px] ${
                  theme === t
                    ? "bg-mm-accent/20 text-mm-accent border border-mm-accent/40"
                    : "bg-mm-bg-sub text-mm-text-dim border border-mm-border-soft"
                }`}
              >
                {t === "dark" ? "Dark" : "Light"}
              </button>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-[0.6px] text-mm-text-mute mb-1">
            Accent
          </div>
          <div className="grid grid-cols-4 gap-1">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                onClick={() => applyAccent(a.id)}
                className={`px-1 py-[6px] rounded text-[10px] inline-flex flex-col items-center gap-1 border ${
                  accent === a.id
                    ? "border-mm-accent/60 bg-mm-accent/10"
                    : "border-mm-border-soft bg-mm-bg-sub"
                }`}
                title={a.label}
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ background: a.color }}
                />
                <span className="text-mm-text-dim">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
