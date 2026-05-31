"use client";

import { useEffect, useState } from "react";

export interface CultureKeyword {
  key: string;
  label: string;
  positive: boolean;
}

interface Props {
  keywords: CultureKeyword[];
  initialLikes: string[];
  initialAvoids: string[];
  initialWorkMode: "remote" | "hybrid" | "onsite" | "any";
  initialMaxOfficeDays: number | null;
  onChange: (state: {
    cultureLikes: string[];
    cultureAvoids: string[];
    workModePreference: "remote" | "hybrid" | "onsite" | "any";
    maxOfficeDaysPerWeek: number | null;
  }) => void;
}

type ChipState = "neutral" | "like" | "avoid";

export function CulturePrefs({
  keywords,
  initialLikes,
  initialAvoids,
  initialWorkMode,
  initialMaxOfficeDays,
  onChange,
}: Props) {
  const [likes, setLikes] = useState<Set<string>>(new Set(initialLikes));
  const [avoids, setAvoids] = useState<Set<string>>(new Set(initialAvoids));
  const [workMode, setWorkMode] = useState(initialWorkMode);
  const [maxDays, setMaxDays] = useState<number | null>(initialMaxOfficeDays);

  // Propagate any change upward.
  useEffect(() => {
    onChange({
      cultureLikes: Array.from(likes),
      cultureAvoids: Array.from(avoids),
      workModePreference: workMode,
      maxOfficeDaysPerWeek: maxDays,
    });
  }, [likes, avoids, workMode, maxDays, onChange]);

  function stateOf(key: string): ChipState {
    if (likes.has(key)) return "like";
    if (avoids.has(key)) return "avoid";
    return "neutral";
  }

  // Click cycles neutral → like → avoid → neutral
  function cycle(key: string) {
    const s = stateOf(key);
    if (s === "neutral") {
      setLikes((prev) => {
        const n = new Set(prev);
        n.add(key);
        return n;
      });
    } else if (s === "like") {
      setLikes((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
      setAvoids((prev) => {
        const n = new Set(prev);
        n.add(key);
        return n;
      });
    } else {
      setAvoids((prev) => {
        const n = new Set(prev);
        n.delete(key);
        return n;
      });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--fg-3)] mb-2">
          Work mode preference
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["remote", "hybrid", "onsite", "any"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setWorkMode(mode)}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                workMode === mode
                  ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                  : "border-[var(--border)] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        {(workMode === "hybrid" || workMode === "onsite") && (
          <div className="mt-3">
            <label className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">
              Max office days/week
            </label>
            <input
              type="number"
              min={0}
              max={7}
              value={maxDays ?? ""}
              onChange={(e) =>
                setMaxDays(e.target.value === "" ? null : Number(e.target.value))
              }
              className="block mt-1 w-24 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm font-mono"
              placeholder="3"
            />
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
          <div className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">
            Cues — click to cycle: neutral → ✓ like → ✗ avoid → neutral
          </div>
          <div className="text-[10px] font-mono text-[var(--fg-4)]">
            <span style={{ color: "var(--ok)" }}>{likes.size} likes</span>{" "}
            ·{" "}
            <span style={{ color: "var(--danger)" }}>{avoids.size} avoids</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((kw) => {
            const s = stateOf(kw.key);
            const colors =
              s === "like"
                ? {
                    fg: "var(--ok)",
                    bg: "color-mix(in srgb, var(--ok) 12%, transparent)",
                    border: "color-mix(in srgb, var(--ok) 40%, var(--border))",
                  }
                : s === "avoid"
                  ? {
                      fg: "var(--danger)",
                      bg: "color-mix(in srgb, var(--danger) 10%, transparent)",
                      border: "color-mix(in srgb, var(--danger) 35%, var(--border))",
                    }
                  : {
                      fg: "var(--fg-3)",
                      bg: "var(--bg-elev)",
                      border: "var(--border)",
                    };
            const marker = s === "like" ? "✓" : s === "avoid" ? "✗" : "○";
            return (
              <button
                key={kw.key}
                type="button"
                onClick={() => cycle(kw.key)}
                className="inline-flex items-baseline gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors"
                style={{ background: colors.bg, color: colors.fg, borderColor: colors.border }}
              >
                <span className="font-mono text-[11px] leading-none">{marker}</span>
                <span>{kw.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
