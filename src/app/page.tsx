import { Suspense } from "react";
import {
  getApplicationMetrics,
  getUpcomingInterviews,
  getActionQueue,
  getTopScoredMatches,
  getLatestTailoredCv,
} from "@/lib/repo/dashboard";
import { rejectionPatterns } from "@/lib/repo/feedback";
import { MetricsStrip } from "@/components/dashboard/metrics-strip";
import { UpcomingInterviews } from "@/components/dashboard/upcoming-interviews";
import { ActionQueue } from "@/components/dashboard/action-queue";
import { TopScoresTable } from "@/components/dashboard/top-scores-table";
import { LatestVariantCard } from "@/components/dashboard/latest-variant-card";
import { FeedbackPatternsCard } from "@/components/feedback-patterns-card";
import { DashboardSkeleton } from "@/components/dashboard/skeleton";

export const dynamic = "force-dynamic";

async function MetricsSection() {
  const metrics = await getApplicationMetrics();
  return <MetricsStrip metrics={metrics} />;
}

async function UpcomingInterviewsSection() {
  const initial = await getUpcomingInterviews();
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <h2 className="mb-3 text-lg font-semibold">Upcoming interviews</h2>
      <UpcomingInterviews initial={initial} />
    </div>
  );
}

async function ActionQueueSection() {
  const initial = await getActionQueue();
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <h2 className="mb-3 text-lg font-semibold">Action queue</h2>
      <ActionQueue initial={initial} />
    </div>
  );
}

async function TopScoresSection() {
  const rows = await getTopScoredMatches();
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <h2 className="mb-3 text-lg font-semibold">Top scored roles</h2>
      <TopScoresTable rows={rows} />
    </div>
  );
}

async function LatestVariantSection() {
  const variant = await getLatestTailoredCv();
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <h2 className="mb-3 text-lg font-semibold">Latest tailored CV</h2>
      <LatestVariantCard variant={variant} />
    </div>
  );
}

async function FeedbackPatternsSection() {
  const counts = await rejectionPatterns();
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4">
      <h2 className="mb-3 text-lg font-semibold">Feedback patterns</h2>
      <FeedbackPatternsCard initialCounts={counts} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">RoleHunter</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Your candidate command center.
        </p>
      </div>

      <Suspense fallback={<DashboardSkeleton height={84} label="Loading metrics…" />}>
        <MetricsSection />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Suspense fallback={<DashboardSkeleton height={320} label="Loading interviews…" />}>
            <UpcomingInterviewsSection />
          </Suspense>
        </div>
        <div className="lg:col-span-4">
          <Suspense fallback={<DashboardSkeleton height={320} label="Loading action queue…" />}>
            <ActionQueueSection />
          </Suspense>
        </div>
        <div className="lg:col-span-8">
          <Suspense fallback={<DashboardSkeleton height={360} label="Loading top roles…" />}>
            <TopScoresSection />
          </Suspense>
        </div>
        <div className="lg:col-span-4">
          <Suspense fallback={<DashboardSkeleton height={200} label="Loading latest CV…" />}>
            <LatestVariantSection />
          </Suspense>
        </div>
        <div className="lg:col-span-12">
          <Suspense fallback={<DashboardSkeleton height={260} label="Loading feedback patterns…" />}>
            <FeedbackPatternsSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
