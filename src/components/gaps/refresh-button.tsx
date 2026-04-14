"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Provider } from "@/lib/llm/types";
import { ProviderToggle } from "@/components/provider-toggle";

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
  if (typeof body === "string" && body) return body;
  return fallback;
}

export function RefreshButton() {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>("claude");
  const [busy, setBusy] = useState(false);

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

  async function handleRefresh() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gaps/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(
          errorMessage(body, `Refresh failed (${res.status})`),
        );
      }
      const summary = body as { clustersCreated: number; totalMatches: number };
      toast.success(
        `Clustered ${summary.clustersCreated} gaps from ${summary.totalMatches} matches`,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <ProviderToggle value={provider} onChange={handleProvider} disabled={busy} />
      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--foreground)] px-3 py-1.5 text-sm font-medium text-[var(--background)] transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Refresh from matches
      </button>
    </div>
  );
}
