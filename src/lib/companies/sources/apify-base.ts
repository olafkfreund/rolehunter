// Shared Apify run-and-poll primitives used by Glassdoor / Levels.fyi /
// Layoffs.fyi / LinkedIn-Company adapters.
//
// Each company-side actor:
//   1. POST /acts/<id>/runs with multi-shape input
//   2. Poll the run id until it lands in SUCCEEDED / FAILED / TIMED-OUT
//   3. Fetch the first N items from the run's default dataset
//
// All adapters share the same env-var-absent escape hatch: return null so
// the orchestrator can silently skip when the actor isn't configured.

const APIFY_BASE = "https://api.apify.com/v2";
const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 90_000;

interface RunData {
  id: string;
  actId: string;
  status:
    | "READY"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "TIMING-OUT"
    | "TIMED-OUT"
    | "ABORTING"
    | "ABORTED";
  defaultDatasetId: string;
  finishedAt?: string;
}

interface RunResponse {
  data: RunData;
}

export async function runApifyActor<T = unknown>(
  actorId: string,
  token: string,
  input: Record<string, unknown>,
  opts: { itemLimit?: number } = {},
): Promise<T[]> {
  const startUrl = `${APIFY_BASE}/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(token)}`;
  const startRes = await fetch(startUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => "");
    throw new Error(`Apify start (${startRes.status}): ${text || startRes.statusText}`);
  }
  const startData = ((await startRes.json()) as RunResponse).data;

  const deadline = Date.now() + MAX_POLL_MS;
  let finished: RunData | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const pollUrl = `${APIFY_BASE}/actor-runs/${encodeURIComponent(startData.id)}?token=${encodeURIComponent(token)}`;
    const pollRes = await fetch(pollUrl);
    if (!pollRes.ok) {
      const text = await pollRes.text().catch(() => "");
      throw new Error(`Apify poll (${pollRes.status}): ${text || pollRes.statusText}`);
    }
    const d = ((await pollRes.json()) as RunResponse).data;
    if (
      d.status === "SUCCEEDED" ||
      d.status === "FAILED" ||
      d.status === "TIMED-OUT" ||
      d.status === "ABORTED"
    ) {
      finished = d;
      break;
    }
  }
  if (!finished) throw new Error(`Apify run did not finish within ${MAX_POLL_MS}ms`);
  if (finished.status !== "SUCCEEDED") {
    throw new Error(`Apify run finished with status ${finished.status}`);
  }

  const limit = opts.itemLimit ?? 50;
  const dsUrl = `${APIFY_BASE}/datasets/${encodeURIComponent(finished.defaultDatasetId)}/items?token=${encodeURIComponent(token)}&format=json&limit=${limit}`;
  const dsRes = await fetch(dsUrl);
  if (!dsRes.ok) {
    const text = await dsRes.text().catch(() => "");
    throw new Error(`Apify dataset (${dsRes.status}): ${text || dsRes.statusText}`);
  }
  const items = (await dsRes.json()) as unknown;
  return Array.isArray(items) ? (items as T[]) : [];
}

export function pickStr(v: unknown, fallback: string | null = null): string | null {
  if (typeof v === "string" && v.length > 0) return v.slice(0, 2_000);
  return fallback;
}

export function pickNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
