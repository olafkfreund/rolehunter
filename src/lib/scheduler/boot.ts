// Scheduler boot: registers the 60s tick, orphan-reaper on first boot, signal
// handlers for graceful shutdown.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §6.1, §6.5.

import cron from "node-cron";
import { reapOrphanedRuns } from "./reap";
import { inFlightCount, tick } from "./tick";

let booted = false;
let shuttingDown = false;

function isEnabled(): boolean {
  if (process.env.ENABLE_SCHEDULER === "1") return true;
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

export async function bootScheduler(): Promise<void> {
  if (booted) return;
  if (!isEnabled()) {
    console.log("[scheduler] disabled in dev (set ENABLE_SCHEDULER=1 to override)");
    return;
  }
  booted = true;
  console.log("[scheduler] booting; tick every 60s");

  // Reap any 'running' search_runs from a previous boot that crashed mid-fetch.
  // Best-effort: if the DB is briefly unavailable at boot, log + carry on.
  try {
    const reaped = await reapOrphanedRuns();
    if (reaped > 0) {
      console.warn(`[scheduler] reaped ${reaped} orphaned run(s) from prior crash`);
    }
  } catch (err) {
    console.error("[scheduler] orphan reaper failed (continuing)", err);
  }

  cron.schedule(
    "* * * * *",
    () => {
      if (shuttingDown) return;
      tick().catch((err) =>
        console.error("[scheduler] tick crash", {
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    },
    { name: "rolehunter-tick" },
  );

  process.on("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void gracefulShutdown("SIGINT");
  });
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[scheduler] ${signal} — stopping cron`);
  for (const task of cron.getTasks().values()) {
    task.stop();
  }
  const deadline = Date.now() + 30_000;
  while (inFlightCount() > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (inFlightCount() > 0) {
    console.warn(
      `[scheduler] ${inFlightCount()} run(s) incomplete at shutdown — they'll be reaped on next boot`,
    );
  }
  process.exit(0);
}
