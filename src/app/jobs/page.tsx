import { listJobs } from "@/lib/repo/jobs";
import { JobList } from "@/components/job-list";
import { JobPasteForm } from "@/components/job-paste-form";
import { JobsSearchForm } from "@/components/jobs-search-form";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Search JSearch or paste a posting. Cached locally so match and tailoring steps stay fast.
        </p>
      </section>

      <section className="space-y-4">
        <JobsSearchForm />
        <JobPasteForm />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Saved jobs</h2>
          <span className="text-xs text-[var(--muted-foreground)]">{jobs.length} total</span>
        </div>
        <JobList jobs={jobs} />
      </section>
    </div>
  );
}
