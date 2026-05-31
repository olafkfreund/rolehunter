// Degenerate "paste" adapter — exists only so the JobSourceId union is fully
// covered by the registry. The actual manual-paste flow stays in the v2.4
// route handler at /api/jobs POST; the scheduler never invokes this adapter.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5 (subtle decision 5).

import { SourcePermanentError } from "./errors";
import type { JobSource } from "./types";

export function createPasteAdapter(): JobSource {
  return {
    id: "paste",
    displayName: "Manual paste",
    available: async () => ({
      ok: false,
      reason: "Manual-paste flow does not support scheduled invocation",
    }),
    costEstimate: () => 0,
    search: async () => {
      throw new SourcePermanentError(
        "Manual-paste adapter is not callable from the scheduler. Use POST /api/jobs from the UI.",
      );
    },
  };
}
