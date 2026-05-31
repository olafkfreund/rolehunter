// Adapter registry. Built lazily on first lookup so adapters with side-effecting
// init (e.g. MCP client connection) don't run at import time.
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.

import type { JobSource, JobSourceId } from "./types";

type AdapterFactory = () => JobSource;

const factories = new Map<JobSourceId, AdapterFactory>();
const cache = new Map<JobSourceId, JobSource>();

export function register(id: JobSourceId, factory: AdapterFactory): void {
  factories.set(id, factory);
}

export function get(id: JobSourceId): JobSource {
  const cached = cache.get(id);
  if (cached) return cached;
  const factory = factories.get(id);
  if (!factory) {
    throw new Error(`No adapter registered for source '${id}'. Register it in src/lib/jobs/sources/index.ts.`);
  }
  const adapter = factory();
  cache.set(id, adapter);
  return adapter;
}

export function has(id: JobSourceId): boolean {
  return factories.has(id);
}

export function knownSources(): JobSourceId[] {
  return Array.from(factories.keys());
}

/** Test/dev only — drops the lazy cache so factories re-run on next get(). */
export function _clearCacheForTests(): void {
  cache.clear();
}
