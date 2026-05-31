"use client";

import { useEffect, useState } from "react";
import { ZONES } from "@/lib/jobs/right-to-work";

interface RightToWorkValue {
  zones: string[];
  evidence: Record<string, string>;
  freeText: string;
}

interface Props {
  initial: RightToWorkValue;
  onChange: (next: RightToWorkValue) => void;
}

/**
 * Right-to-work declaration editor. Multi-select zone chips + per-zone
 * evidence textarea + free-text catch-all. Used inside the larger profile
 * form; doesn't save itself — propagates via onChange.
 */
export function RightToWorkForm({ initial, onChange }: Props) {
  const [zones, setZones] = useState<Set<string>>(new Set(initial.zones));
  const [evidence, setEvidence] = useState<Record<string, string>>(
    initial.evidence ?? {},
  );
  const [freeText, setFreeText] = useState(initial.freeText ?? "");

  useEffect(() => {
    onChange({
      zones: Array.from(zones),
      evidence,
      freeText,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, evidence, freeText]);

  function toggleZone(key: string) {
    setZones((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--fg-3)] mb-2">
          Where can you legally work?
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ZONES.map((z) => {
            const on = zones.has(z.key);
            return (
              <button
                key={z.key}
                type="button"
                onClick={() => toggleZone(z.key)}
                title={z.description}
                className="px-2.5 py-1 text-[12px] rounded-md border transition-colors"
                style={{
                  borderColor: on ? "var(--accent)" : "var(--border)",
                  color: on ? "var(--fg)" : "var(--fg-3)",
                  background: on
                    ? "color-mix(in srgb, var(--accent) 12%, transparent)"
                    : undefined,
                }}
              >
                {on ? "✓ " : ""}
                {z.label}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-[var(--fg-4)] mt-2">
          Drives <code className="font-mono">/jobs?rtw=mine</code> filter. Unknown / fully-remote
          listings always stay visible — false negatives are worse than seeing one extra row.
        </p>
      </div>

      {zones.size > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">
            Evidence per zone (optional)
          </div>
          <div className="space-y-2">
            {Array.from(zones).map((key) => {
              const meta = ZONES.find((z) => z.key === key);
              if (!meta) return null;
              return (
                <div key={key}>
                  <div className="text-[10px] font-mono text-[var(--fg-3)] mb-0.5">
                    {meta.label}
                  </div>
                  <textarea
                    rows={2}
                    placeholder={meta.description}
                    value={evidence[key] ?? ""}
                    onChange={(e) =>
                      setEvidence((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div className="text-[11px] uppercase tracking-wider text-[var(--fg-3)] mb-1">
          Anything else? (free text)
        </div>
        <textarea
          rows={2}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="e.g. Swiss B permit, Singapore EP, work-from-anywhere arrangement"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
      </div>
    </div>
  );
}
