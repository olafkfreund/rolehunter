"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarPlus, ChevronRight, ExternalLink } from "lucide-react";

export type UpcomingInterview = {
  id: number;
  scheduledAt: string;
  durationMin: number;
  type:
    | "phone"
    | "video"
    | "onsite"
    | "take_home"
    | "technical"
    | "system_design"
    | "behavioral"
    | "final";
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  interviewerName: string | null;
  interviewerTitle: string | null;
  meetingUrl: string | null;
  locationText: string | null;
  applicationId: number;
  jobId: number;
  jobTitle: string;
  company: string;
  stage: string;
};

type Props = {
  initial: UpcomingInterview[];
};

const TYPE_LABELS: Record<UpcomingInterview["type"], string> = {
  phone: "phone",
  video: "video",
  onsite: "onsite",
  take_home: "take-home",
  technical: "technical",
  system_design: "system design",
  behavioral: "behavioural",
  final: "final",
};

function typePillClass(type: UpcomingInterview["type"]): string {
  if (type === "technical" || type === "system_design" || type === "take_home") {
    return "bg-[var(--warning)]/10 text-[var(--warning)]";
  }
  if (type === "video" || type === "phone" || type === "behavioral") {
    return "bg-[var(--accent)]/10 text-[var(--accent)]";
  }
  // final, onsite
  return "bg-[var(--success)]/10 text-[var(--success)]";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: "short" });
  const dayNum = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${dayNum} · ${time}`;
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const target = new Date(iso).getTime();
  const diffMs = target - now;
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const future = diffMs >= 0;
  if (absMs < hour) {
    const mins = Math.max(1, Math.round(absMs / minute));
    return future ? `in ${mins} min` : `${mins} min ago`;
  }
  if (absMs < day) {
    const hrs = Math.round(absMs / hour);
    return future ? `in ${hrs} hour${hrs === 1 ? "" : "s"}` : `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  }
  const days = Math.round(absMs / day);
  return future ? `in ${days} day${days === 1 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"} ago`;
}

export function UpcomingInterviews({ initial }: Props) {
  const sorted = useMemo(() => {
    return [...initial].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }, [initial]);

  return (
    <section>
      <header className="flex items-center justify-end mb-3">
        <Link
          href="/kanban"
          title="Pick a job on the Kanban to schedule an interview"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
        >
          <CalendarPlus className="h-3.5 w-3.5" aria-hidden />
          Schedule
        </Link>
      </header>

      {sorted.length === 0 ? (
        <div className="text-sm text-[var(--muted-foreground)]">
          Nothing scheduled.{" "}
          <Link href="/jobs" className="underline hover:no-underline">
            Schedule an interview from a job&apos;s page.
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((iv, idx) => {
            const highlight = idx < 3;
            const borderClass = highlight
              ? "border-[var(--accent)]"
              : "border-[var(--border)]";
            return (
              <li
                key={iv.id}
                className={`rounded-md border ${borderClass} p-3`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs text-[var(--muted-foreground)]">
                    <span className="font-medium text-[var(--foreground)]">
                      {formatWhen(iv.scheduledAt)}
                    </span>
                    <span className="mx-2">·</span>
                    <span>{formatRelative(iv.scheduledAt)}</span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${typePillClass(
                      iv.type
                    )}`}
                  >
                    {TYPE_LABELS[iv.type]}
                  </span>
                </div>

                <div className="mb-1">
                  <div className="text-sm font-semibold truncate">{iv.jobTitle}</div>
                  <div className="text-xs text-[var(--muted-foreground)] truncate">
                    {iv.company}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 mt-2">
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {iv.durationMin} min
                    {iv.interviewerName ? (
                      <>
                        <span className="mx-1">·</span>
                        <span>
                          {iv.interviewerName}
                          {iv.interviewerTitle ? ` (${iv.interviewerTitle})` : ""}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    {iv.meetingUrl ? (
                      <a
                        href={iv.meetingUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        Join
                      </a>
                    ) : null}
                    <Link
                      href={`/jobs/${iv.jobId}`}
                      className="inline-flex items-center gap-0.5 text-xs hover:underline"
                    >
                      Open application
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default UpcomingInterviews;
