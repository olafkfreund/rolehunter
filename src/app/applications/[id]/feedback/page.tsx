import Link from "next/link";
import { notFound } from "next/navigation";
import { listApplicationsWithJob } from "@/lib/repo/applications";
import { listForApplication } from "@/lib/repo/feedback";
import { FeedbackForm } from "@/components/feedback-form";
import { FeedbackList } from "@/components/feedback-list";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ApplicationFeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const [apps, feedbacks] = await Promise.all([
    listApplicationsWithJob(),
    listForApplication(id),
  ]);

  const app = apps.find((a) => a.id === id);
  if (!app) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link
            href="/kanban"
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            ← Back to Kanban
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Interview feedback
          </h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            <span className="font-medium text-[var(--foreground)]">
              {app.job.title}
            </span>
            {app.job.company ? ` · ${app.job.company}` : ""}
            {app.job.location ? ` · ${app.job.location}` : ""}
          </p>
        </div>
      </div>

      <FeedbackForm applicationId={app.id} />

      <div className="space-y-3">
        <h2 className="text-base font-semibold">
          Logged feedback
          <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
            {feedbacks.length}{" "}
            {feedbacks.length === 1 ? "entry" : "entries"}
          </span>
        </h2>
        <FeedbackList rows={feedbacks} />
      </div>
    </div>
  );
}
