"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  jobId: number;
  /** Current hidden state — flips on Hide/Unhide click. */
  hidden: boolean;
}

/**
 * Per-row actions for /jobs. Soft-hide (reversible) + hard-delete
 * (irreversible, with confirm). Stops link propagation so the click
 * doesn't navigate to /jobs/[id].
 */
export function JobRowActions({ jobId, hidden }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function stop(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  function toggleHide(e: React.MouseEvent) {
    stop(e);
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !hidden }),
      });
      if (res.ok) router.refresh();
    });
  }

  function hardDelete(e: React.MouseEvent) {
    stop(e);
    if (
      !confirm(
        "Delete this job permanently? This wipes the row + any cached scores. Use Hide instead if you might want it back.",
      )
    )
      return;
    startTransition(async () => {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        className="btn btn-ghost text-[10px] px-1.5 py-0.5"
        title="Job actions"
        aria-label="Job actions"
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-10 card p-1 flex flex-col min-w-[140px]"
          onClick={stop}
        >
          <button
            type="button"
            onClick={toggleHide}
            disabled={pending}
            className="text-left px-2 py-1 text-[12px] hover:bg-[var(--bg-elev-2)] rounded-sm"
          >
            {hidden ? "Unhide" : "Hide from list"}
          </button>
          <button
            type="button"
            onClick={hardDelete}
            disabled={pending}
            className="text-left px-2 py-1 text-[12px] hover:bg-[var(--bg-elev-2)] rounded-sm"
            style={{ color: "var(--danger)" }}
          >
            Delete forever…
          </button>
        </div>
      )}
    </div>
  );
}
