import { listCanonicalGaps } from "@/lib/repo/gaps";
import { GapsTable } from "@/components/gaps/gaps-table";
import { RefreshButton } from "@/components/gaps/refresh-button";

export const dynamic = "force-dynamic";

export default async function GapsPage() {
  const rows = await listCanonicalGaps();

  const uniqueTitles = new Set<string>();
  for (const r of rows) {
    for (const t of r.affectedJobTitles) {
      uniqueTitles.add(t);
    }
  }
  const totalAffectedJobs = uniqueTitles.size;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gaps</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {rows.length === 0
              ? "No gaps aggregated yet. Score some jobs and click Refresh."
              : `${rows.length} skill${rows.length === 1 ? "" : "s"} across ${totalAffectedJobs} job${totalAffectedJobs === 1 ? "" : "s"}.`}
          </p>
        </div>
        <RefreshButton />
      </header>
      <GapsTable initial={rows} />
    </div>
  );
}
