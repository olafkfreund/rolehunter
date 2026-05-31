// Next.js 15 one-time process init hook.
// Runs once per Node.js worker (not per request). The dynamic import keeps the
// scheduler from coupling to the Edge runtime and lets us guard on NEXT_RUNTIME.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §6.1.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootScheduler } = await import("./lib/scheduler/boot");
  await bootScheduler();
}
