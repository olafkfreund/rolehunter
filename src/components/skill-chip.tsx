"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClassifiedSkill } from "@/lib/jobs/skill-classify";

interface Props {
  classified: ClassifiedSkill;
  bg: string;
  fg: string;
  border: string;
}

/**
 * Clickable JD-skill chip. Cycles through three override states on click:
 *   (current) → force matched → force missing → cleared (back to current)
 *
 * Saves to /api/profile/skill-override and refreshes the page so the fit
 * dashboard recomputes with the new override in scope.
 */
export function SkillChip({ classified: s, bg, fg, border }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Tracks the most recent action we sent so the chip can show the correct
  // intermediate state until router.refresh() lands.
  const [optimisticOverride, setOptimisticOverride] = useState<
    "match" | "miss" | "clear" | null
  >(null);

  function nextAction(): "match" | "miss" | "clear" {
    // Cycle from the *current effective* state. If chip is overridden, the
    // next click pushes to the next slot. Otherwise it starts at "match".
    if (s.overridden && s.class === "matched") return "miss";
    if (s.overridden && s.class === "missing") return "clear";
    return "match";
  }

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const action = nextAction();
    setOptimisticOverride(action);
    startTransition(async () => {
      try {
        const res = await fetch("/api/profile/skill-override", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: s.token, action }),
        });
        if (res.ok) router.refresh();
      } catch {
        // Ignored — the visual state will reconcile on next refresh.
      }
    });
  }

  const baseTitle =
    s.class === "matched"
      ? s.evidence === "override"
        ? `Override: marked matched by you. Click to cycle to missing.`
        : s.evidence === "portfolio"
          ? `Matched via portfolio project "${s.portfolioProject ?? "unknown"}". Click to override.`
          : `Matched — CV: "${s.cvMatch ?? ""}". Click to override.`
      : s.class === "partial"
        ? s.evidence === "portfolio"
          ? `Partial — portfolio project "${s.portfolioProject ?? "unknown"}". Click to mark as full match.`
          : `Partial — CV has related. Click to mark as full match.`
        : s.evidence === "override"
          ? `Override: marked missing by you. Click to clear.`
          : "Missing from CV + portfolio. Click to mark as matched.";

  const stateMarker =
    s.overridden && s.class === "matched"
      ? "✓"
      : s.overridden && s.class === "missing"
        ? "✗"
        : s.evidence === "portfolio"
          ? "↗"
          : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={baseTitle}
      className="inline-flex items-baseline gap-1 rounded-md border px-2 py-1 text-[11px] font-mono hover:opacity-80 transition-opacity cursor-pointer"
      style={{ background: bg, color: fg, borderColor: border }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: fg }}
      />
      {s.token}
      {stateMarker && (
        <span
          className="text-[9px] uppercase tracking-wider opacity-80"
          aria-label={
            s.overridden ? "user override" : s.evidence === "portfolio" ? "from portfolio" : ""
          }
        >
          {stateMarker}
        </span>
      )}
      {optimisticOverride && pending && (
        <span
          className="text-[9px] opacity-50"
          aria-label="saving override"
        >
          ⋯
        </span>
      )}
    </button>
  );
}
