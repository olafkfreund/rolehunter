"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, Bell, Heart } from "lucide-react";

export type ActionItem = {
  kind: "thank_you" | "followup" | "stale";
  applicationId: number;
  jobId: number;
  jobTitle: string;
  company: string;
  hint: string;
  timestamp: string;
};

type Props = {
  initial: ActionItem[];
};

function formatRelative(iso: string): string {
  const now = Date.now();
  const target = new Date(iso).getTime();
  const diffMs = now - target;
  const absMs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  const past = diffMs >= 0;
  if (absMs < hour) {
    const mins = Math.max(1, Math.round(absMs / minute));
    return past ? `${mins} min ago` : `in ${mins} min`;
  }
  if (absMs < day) {
    const hrs = Math.round(absMs / hour);
    return past ? `${hrs} hour${hrs === 1 ? "" : "s"} ago` : `in ${hrs} hour${hrs === 1 ? "" : "s"}`;
  }
  const days = Math.round(absMs / day);
  return past ? `${days} day${days === 1 ? "" : "s"} ago` : `in ${days} day${days === 1 ? "" : "s"}`;
}

function kindBorder(kind: ActionItem["kind"]): string {
  switch (kind) {
    case "thank_you":
      return "border-l-4 border-l-[var(--success)]";
    case "followup":
      return "border-l-4 border-l-[var(--accent)]";
    case "stale":
      return "border-l-4 border-l-[var(--warning)]";
  }
}

function KindIcon({ kind }: { kind: ActionItem["kind"] }) {
  const cls = "h-4 w-4";
  if (kind === "thank_you") return <Heart className={`${cls} text-[var(--success)]`} aria-hidden />;
  if (kind === "followup") return <Bell className={`${cls} text-[var(--accent)]`} aria-hidden />;
  return <Archive className={`${cls} text-[var(--warning)]`} aria-hidden />;
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text) as { error?: string; message?: string };
      return json.error ?? json.message ?? text;
    } catch {
      return text;
    }
  } catch {
    return `HTTP ${res.status}`;
  }
}

function keyFor(item: ActionItem): string {
  return `${item.kind}:${item.applicationId}:${item.timestamp}`;
}

export function ActionQueue({ initial }: Props) {
  const [items, setItems] = useState<ActionItem[]>(initial);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setBusy = (k: string, v: boolean) => {
    setPending((p) => ({ ...p, [k]: v }));
  };

  const setError = (k: string, msg: string | null) => {
    setErrors((p) => {
      const next = { ...p };
      if (msg === null) delete next[k];
      else next[k] = msg;
      return next;
    });
  };

  const handleThankYou = async (item: ActionItem) => {
    const k = keyFor(item);
    setBusy(k, true);
    setError(k, null);
    const snapshot = items;
    // optimistic remove
    setItems((prev) => prev.filter((x) => keyFor(x) !== k));
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: item.applicationId,
          source: "self",
          whatWentWellMd: "Thank-you sent",
          rating: null,
        }),
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        setItems(snapshot);
        setError(k, `Couldn't log thank-you: ${msg}`);
      }
    } catch (err) {
      setItems(snapshot);
      const msg = err instanceof Error ? err.message : "network error";
      setError(k, `Couldn't log thank-you: ${msg}`);
    } finally {
      setBusy(k, false);
    }
  };

  const handleArchive = async (item: ActionItem) => {
    const k = keyFor(item);
    setBusy(k, true);
    setError(k, null);
    const snapshot = items;
    setItems((prev) => prev.filter((x) => keyFor(x) !== k));
    try {
      const res = await fetch(`/api/applications/${item.applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "rejected" }),
      });
      if (!res.ok) {
        const msg = await parseErrorBody(res);
        setItems(snapshot);
        setError(k, `Couldn't archive: ${msg}`);
      }
    } catch (err) {
      setItems(snapshot);
      const msg = err instanceof Error ? err.message : "network error";
      setError(k, `Couldn't archive: ${msg}`);
    } finally {
      setBusy(k, false);
    }
  };

  return (
    <section>
      <header className="flex items-center justify-end mb-3">
        <span className="inline-flex items-center justify-center rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
          {items.length}
        </span>
      </header>

      {items.length === 0 ? (
        <div className="text-sm text-[var(--muted-foreground)]">
          All caught up. Nothing needs your attention today.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const k = keyFor(item);
            const isPending = !!pending[k];
            const err = errors[k];
            return (
              <li
                key={k}
                className={`rounded-md border border-[var(--border)] p-3 ${kindBorder(
                  item.kind
                )}`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <KindIcon kind={item.kind} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {item.jobTitle} <span className="text-[var(--muted-foreground)]">— {item.company}</span>
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      {item.hint}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <div className="text-[11px] text-[var(--muted-foreground)]">
                        {formatRelative(item.timestamp)}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.kind === "thank_you" ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => void handleThankYou(item)}
                            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
                          >
                            {isPending ? "Logging…" : "Log thank-you"}
                          </button>
                        ) : null}
                        {item.kind === "followup" ? (
                          <Link
                            href={`/jobs/${item.jobId}`}
                            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
                          >
                            Open job
                          </Link>
                        ) : null}
                        {item.kind === "stale" ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => void handleArchive(item)}
                            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)] disabled:opacity-50"
                          >
                            {isPending ? "Archiving…" : "Archive"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {err ? (
                      <div className="mt-2 text-xs text-[var(--danger)]">{err}</div>
                    ) : null}
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

export default ActionQueue;
