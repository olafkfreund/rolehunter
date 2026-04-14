"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ExternalLink,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { Provider } from "@/lib/llm/types";
import type { CanonicalGap, CanonicalGapResource } from "@/lib/db/schema";
import type { GapDetail, GapSourceInfo, LearningStatus } from "@/lib/repo/gaps";
import { ProviderToggle } from "@/components/provider-toggle";

const PROVIDER_STORAGE_KEY = "rolehunter.provider";

type ResourceKind = "docs" | "guide" | "reference" | "community";

const KIND_ORDER: ResourceKind[] = ["docs", "guide", "reference", "community"];

const KIND_LABELS: Record<ResourceKind, string> = {
  docs: "Official docs",
  guide: "Guides",
  reference: "References",
  community: "Community",
};

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const e = (body as { error: unknown }).error;
    if (typeof e === "string") return e;
    if (e && typeof e === "object") {
      try {
        return JSON.stringify(e);
      } catch {
        return fallback;
      }
    }
  }
  if (typeof body === "string" && body) return body;
  return fallback;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function toKind(raw: string): ResourceKind {
  if (raw === "docs" || raw === "guide" || raw === "reference" || raw === "community") {
    return raw;
  }
  return "reference";
}

function formatFetched(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type Props = {
  gapId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChanged?: (status: LearningStatus) => void;
};

export function LearnDrawer({
  gapId,
  open,
  onOpenChange,
  onStatusChanged,
}: Props) {
  const [provider, setProvider] = useState<Provider>("claude");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [gap, setGap] = useState<CanonicalGap | null>(null);
  const [sources, setSources] = useState<GapSourceInfo[]>([]);
  const [resources, setResources] = useState<CanonicalGapResource[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PROVIDER_STORAGE_KEY);
      if (stored === "claude" || stored === "gemini") {
        setProvider(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/gaps/${gapId}`);
        const body = await parseJsonSafe(res);
        if (!res.ok) {
          throw new Error(errorMessage(body, `Failed to load gap (${res.status})`));
        }
        if (cancelled) return;
        const detail = body as GapDetail;
        setGap(detail.gap);
        setSources(detail.sources);
        setResources(detail.resources);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load gap");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gapId, open]);

  function handleProvider(next: Provider) {
    setProvider(next);
    try {
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/gaps/${gapId}/learn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(
          errorMessage(body, `Failed to generate resources (${res.status})`),
        );
      }
      const rows = body as CanonicalGapResource[];
      setResources(rows);
      setGap((g) =>
        g ? { ...g, resourcesFetchedAt: new Date() as Date } : g,
      );
      toast.success(
        rows.length === 0
          ? "No whitelisted resources returned"
          : `Generated ${rows.length} resource${rows.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleStatus(status: LearningStatus) {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/gaps/${gapId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learningStatus: status }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${res.status}: ${text.slice(0, 120)}`);
      }
      onStatusChanged?.(status);
      toast.success(
        status === "learning"
          ? "Marked as learning"
          : status === "done"
            ? "Marked as done"
            : "Status updated",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  const fetchedLabel = formatFetched(gap?.resourcesFetchedAt ?? null);

  const grouped: Record<ResourceKind, CanonicalGapResource[]> = {
    docs: [],
    guide: [],
    reference: [],
    community: [],
  };
  for (const r of resources) {
    const k = toKind(r.kind);
    grouped[k].push(r);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-[var(--border)] bg-[var(--background)] shadow-xl sm:w-[520px]"
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold">
                {gap?.name ?? "Loading…"}
              </Dialog.Title>
              {gap?.description ? (
                <Dialog.Description className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {gap.description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <ProviderToggle
                value={provider}
                onChange={handleProvider}
                disabled={generating}
              />
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating || loading}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate resources
              </button>
            </div>
            {fetchedLabel ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Last fetched {fetchedLabel}
              </p>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading gap details…
              </div>
            ) : (
              <div className="space-y-5">
                {sources.length > 0 ? (
                  <section>
                    <h3 className="mb-1.5 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                      Seen in {sources.length} match{sources.length === 1 ? "" : "es"}
                    </h3>
                    <ul className="space-y-1 text-xs">
                      {sources.slice(0, 8).map((s, i) => (
                        <li
                          key={`${s.matchId}-${i}`}
                          className="truncate text-[var(--muted-foreground)]"
                          title={`${s.jobTitle} @ ${s.company}: ${s.rawPhrase}`}
                        >
                          <span className="text-[var(--foreground)]">
                            {s.jobTitle}
                          </span>{" "}
                          — {s.rawPhrase}
                        </li>
                      ))}
                      {sources.length > 8 ? (
                        <li className="text-[var(--muted-foreground)]">
                          …and {sources.length - 8} more
                        </li>
                      ) : null}
                    </ul>
                  </section>
                ) : null}

                {resources.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">
                    No resources yet. Click <strong>Generate resources</strong> to
                    fetch learning links.
                  </div>
                ) : (
                  KIND_ORDER.filter((k) => grouped[k].length > 0).map((k) => (
                    <section key={k}>
                      <h3 className="mb-2 text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                        {KIND_LABELS[k]}
                      </h3>
                      <ul className="space-y-3">
                        {grouped[k].map((r) => (
                          <li
                            key={r.id}
                            className="rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3"
                          >
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-start gap-1.5 text-sm font-semibold text-[var(--foreground)] hover:underline"
                            >
                              <ExternalLink className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--muted-foreground)]" />
                              <span>{r.title}</span>
                            </a>
                            <div className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                              {hostOf(r.url)}
                            </div>
                            {r.rationale ? (
                              <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
                                {r.rationale}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            <button
              type="button"
              onClick={() => void handleStatus("learning")}
              disabled={statusBusy || loading}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--muted)] disabled:opacity-50"
            >
              Mark as learning
            </button>
            <button
              type="button"
              onClick={() => void handleStatus("done")}
              disabled={statusBusy || loading}
              className="rounded-md border border-[var(--border)] bg-[var(--success)]/10 px-3 py-1.5 text-sm font-medium text-[var(--success)] hover:bg-[var(--success)]/20 disabled:opacity-50"
            >
              Mark as done
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
