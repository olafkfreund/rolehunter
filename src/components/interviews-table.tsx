import type { InterviewWithJob } from "@/lib/repo/interviews";
import { InterviewRowActions } from "./interviews-panel";

type InterviewsTableProps = {
  rows: InterviewWithJob[];
  emptyMessage?: string;
};

const TYPE_LABELS: Record<string, string> = {
  phone: "Phone",
  video: "Video",
  onsite: "Onsite",
  take_home: "Take-home",
  technical: "Technical",
  system_design: "System Design",
  behavioral: "Behavioral",
  final: "Final",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-[var(--accent)]/10 text-[var(--accent)]",
  completed: "bg-[var(--success)]/10 text-[var(--success)]",
  cancelled: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  no_show: "bg-[var(--danger)]/10 text-[var(--danger)]",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InterviewsTable({ rows, emptyMessage }: InterviewsTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
        {emptyMessage ?? "No interviews."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="min-w-full text-sm">
        <thead className="bg-[var(--muted)]/40 text-xs uppercase text-[var(--muted-foreground)]">
          <tr>
            <th className="px-3 py-2 text-left font-medium">When</th>
            <th className="px-3 py-2 text-left font-medium">Type</th>
            <th className="px-3 py-2 text-left font-medium">Role / Company</th>
            <th className="px-3 py-2 text-left font-medium">Interviewer</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-t border-[var(--border)] align-top"
            >
              <td className="whitespace-nowrap px-3 py-2">
                <div className="font-medium">{formatDate(row.scheduledAt)}</div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {formatTime(row.scheduledAt)} · {row.durationMin}m
                </div>
              </td>
              <td className="px-3 py-2">
                <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs">
                  {TYPE_LABELS[row.type] ?? row.type}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="font-medium">{row.job.title}</div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {row.job.company}
                </div>
              </td>
              <td className="px-3 py-2">
                {row.interviewerName ? (
                  <>
                    <div>{row.interviewerName}</div>
                    {row.interviewerTitle && (
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {row.interviewerTitle}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-[var(--muted-foreground)]">
                    —
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLES[row.status] ?? ""}`}
                >
                  {STATUS_LABELS[row.status] ?? row.status}
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <InterviewRowActions interview={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
