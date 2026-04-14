"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkCheck, BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Variant = "icon" | "default";

type ApplicationLite = { id: number; jobId: number };

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
  return fallback;
}

export function TrackJobButton({
  jobId,
  variant = "default",
  onTracked,
}: {
  jobId: number;
  variant?: Variant;
  onTracked?: (appId: number) => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [applicationId, setApplicationId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/applications?jobId=${jobId}`, {
          cache: "no-store",
        });
        const body = await parseJsonSafe(res);
        if (cancelled) return;
        if (!res.ok) {
          setApplicationId(null);
          return;
        }
        if (body && typeof body === "object" && "id" in body) {
          const app = body as ApplicationLite;
          if (typeof app.id === "number") {
            setApplicationId(app.id);
            return;
          }
        }
        setApplicationId(null);
      } catch {
        if (!cancelled) setApplicationId(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || loading) return;

    if (applicationId !== null) {
      router.push(`/applications#app-${applicationId}`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(errorMessage(body, "Failed to track"));
      }
      if (body && typeof body === "object" && "id" in body) {
        const app = body as ApplicationLite;
        if (typeof app.id === "number") {
          setApplicationId(app.id);
          onTracked?.(app.id);
          toast.success("Tracked");
          return;
        }
      }
      throw new Error("Unexpected response");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to track");
    } finally {
      setBusy(false);
    }
  }

  const tracked = applicationId !== null;
  const iconOnly = variant === "icon";

  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] text-sm font-medium transition-colors disabled:opacity-50";
  const sizing = iconOnly ? "h-8 w-8" : "px-3 py-1.5";
  const tone = tracked
    ? "bg-[var(--muted)]/40 text-[var(--success)] hover:bg-[var(--muted)]/60"
    : "bg-[var(--background)] text-[var(--foreground)] hover:bg-[var(--muted)]/40";

  const label = busy
    ? "Tracking…"
    : tracked
      ? "Tracked"
      : "Track";

  const Icon = busy
    ? Loader2
    : tracked
      ? BookmarkCheck
      : BookmarkPlus;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || loading}
      aria-label={label}
      title={tracked ? "Open in Applications" : "Track this job"}
      className={`${base} ${sizing} ${tone}`}
    >
      <Icon className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}
