// Next.js 15 one-time process init hook.
// Runs once per Node.js worker (not per request). The dynamic import keeps the
// scheduler from coupling to the Edge runtime and lets us guard on NEXT_RUNTIME.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §6.1.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // v3.2 slice 4 — copy DB-stored settings into process.env so existing
  // getEnv()-based code reads the wizard-set values. UI writes therefore
  // take effect on the next container restart (which the /settings UI
  // surfaces as a banner). This avoids migrating 18 sync getProvider()
  // call sites in one slice.
  try {
    const { hydrateProcessEnvFromDb } = await import("./lib/settings/boot");
    await hydrateProcessEnvFromDb();
  } catch (e) {
    // Don't block boot if the table doesn't exist yet (migration pending).
    console.warn("[instrumentation] settings hydrate skipped:", e instanceof Error ? e.message : e);
  }

  const { bootScheduler } = await import("./lib/scheduler/boot");
  await bootScheduler();
}
