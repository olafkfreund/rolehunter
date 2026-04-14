"use client";

import { useState } from "react";
import type { CvMaster } from "@/lib/db/schema";
import type { Provider } from "@/lib/llm/types";
import { ProviderToggle } from "./provider-toggle";

export function CvUpload({ initial }: { initial: CvMaster | null }) {
  const [cv, setCv] = useState<CvMaster | null>(initial);
  const [provider, setProvider] = useState<Provider>("claude");
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [title, setTitle] = useState("My CV");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title);
      fd.append("provider", provider);
      const res = await fetch("/api/cv", { method: "POST", body: fd });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(json?.error?.toString?.() ?? `upload failed (${res.status})`);
      setCv(json as CvMaster);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPaste() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawMarkdown: paste, title, provider }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(json?.error?.toString?.() ?? `parse failed (${res.status})`);
      setCv(json as CvMaster);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  const parsed = (cv?.parsedJson ?? {}) as Record<string, unknown>;
  const expCount = Array.isArray(parsed.experience) ? parsed.experience.length : 0;
  const skillsCount = Array.isArray(parsed.skills) ? parsed.skills.length : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`rounded-md border border-[var(--border)] px-3 py-1.5 text-sm ${mode === "file" ? "bg-[var(--muted)]" : ""}`}
          >
            Upload file
          </button>
          <button
            type="button"
            onClick={() => setMode("paste")}
            className={`rounded-md border border-[var(--border)] px-3 py-1.5 text-sm ${mode === "paste" ? "bg-[var(--muted)]" : ""}`}
          >
            Paste text
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--muted-foreground)]">Parser</span>
          <ProviderToggle value={provider} onChange={setProvider} disabled={busy} />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-sm font-medium">Title</div>
        <input
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {mode === "file" ? (
        <label className="block cursor-pointer rounded-lg border-2 border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]/40">
          {busy ? "Parsing…" : "Choose a .pdf, .md, or .txt CV"}
          <input
            type="file"
            accept=".pdf,.md,.markdown,.txt"
            className="hidden"
            onChange={onFile}
            disabled={busy}
          />
        </label>
      ) : (
        <div className="space-y-2">
          <textarea
            className="h-48 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
            placeholder="Paste your CV as markdown or plain text…"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <button
            type="button"
            onClick={onPaste}
            disabled={busy || paste.trim().length < 20}
            className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-50"
          >
            {busy ? "Parsing…" : "Parse CV"}
          </button>
        </div>
      )}

      {err && <div className="text-sm text-[var(--danger)]">{err}</div>}

      {cv && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm">
          <div className="font-semibold">{cv.title}</div>
          <div className="mt-1 text-[var(--muted-foreground)]">
            Parsed: {expCount} roles, {skillsCount} skills ·{" "}
            Uploaded {new Date(cv.uploadedAt).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}
