import Link from "next/link";
import { listAllWithJob, listUpcoming } from "@/lib/repo/interviews";
import { InterviewsTable } from "@/components/interviews-table";
import { AddInterviewButton } from "@/components/interviews-panel";

export const dynamic = "force-dynamic";

export default async function InterviewsPage() {
  const [upcoming, past] = await Promise.all([
    listUpcoming(60),
    listAllWithJob("completed", 50),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            ← Dashboard
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Interviews
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Track every round across all your applications.
          </p>
        </div>
        <AddInterviewButton />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Upcoming (next 60 days)
          </h2>
          <InterviewsTable
            rows={upcoming}
            emptyMessage="No upcoming interviews scheduled."
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Past (completed)
          </h2>
          <InterviewsTable
            rows={past}
            emptyMessage="No completed interviews yet."
          />
        </section>
      </div>
    </div>
  );
}
