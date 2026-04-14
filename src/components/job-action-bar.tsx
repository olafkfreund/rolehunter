"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Provider } from "@/lib/llm/types";
import { ProviderToggle } from "@/components/provider-toggle";
import { TrackJobButton } from "@/components/track-job-button";

const PROVIDER_STORAGE_KEY = "rolehunter.provider";

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

export function JobActionBar({
  jobId,
  applicationId: initialAppId,
}: {
  jobId: number;
  applicationId: number | null;
}) {
  const [provider, setProvider] = useState<Provider>("claude");
  const [appId, setAppId] = useState<number | null>(initialAppId);
  const [busy, setBusy] = useState(false);

  // Persist provider preference across pages.
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

  function handleProvider(next: Provider) {
    setProvider(next);
    try {
      window.localStorage.setItem(PROVIDER_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  async function onGenerate() {
    if (appId === null || busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/applications/${appId}/cover-letter-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        },
      );
      if (!res.ok) {
        const body = await parseJsonSafe(res);
        throw new Error(errorMessage(body, "Generation failed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rolehunter-cover-letter-app-${appId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Cover letter ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  const canGenerate = appId !== null && !busy;
  const generateTitle =
    appId === null ? "Track this job first" : "Generate and download cover letter";

  return (
    <div
      className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)]/95 px-4 py-3 backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <TrackJobButton
          jobId={jobId}
          onTracked={(id) => setAppId(id)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ProviderToggle
          value={provider}
          onChange={handleProvider}
          disabled={busy}
        />
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canGenerate}
          title={generateTitle}
          aria-disabled={!canGenerate}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <FileText className="h-4 w-4" aria-hidden />
          )}
          <span>{busy ? "Generating…" : "Generate cover letter"}</span>
        </button>
      </div>
    </div>
  );
}
