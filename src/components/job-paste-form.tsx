"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const input =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const label = "text-sm font-medium";
const field = "space-y-1.5";

function extractTitleAndCompany(text: string): { title: string; company: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const first = lines[0] ?? "";
  // Common patterns: "Senior Engineer at Acme", "Senior Engineer - Acme", "Senior Engineer | Acme"
  const sep = first.match(/^(.+?)\s+(?:at|@|-|–|\|)\s+(.+)$/i);
  if (sep) {
    return { title: sep[1].trim(), company: sep[2].trim() };
  }
  return { title: first.slice(0, 200), company: lines[1]?.slice(0, 200) ?? "" };
}

export function JobPasteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPasteChange(value: string) {
    setDescription(value);
    if (value.length > 20 && !title && !company) {
      const guessed = extractTitleAndCompany(value);
      if (guessed.title) setTitle(guessed.title);
      if (guessed.company) setCompany(guessed.company);
    }
  }

  function reset() {
    setTitle("");
    setCompany("");
    setLocation("");
    setUrl("");
    setDescription("");
    setErr(null);
  }

  function onSubmit() {
    setErr(null);
    if (!title.trim() || description.trim().length < 20) {
      setErr("Title and a description (20+ chars) are required.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            company: company.trim() || undefined,
            location: location.trim() || undefined,
            url: url.trim() || undefined,
            description: description.trim(),
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(
            typeof json?.error === "string" ? json.error : "Failed to save job",
          );
        }
        reset();
        setOpen(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to save job");
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]"
      >
        Paste a job description
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Paste job description</h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          Cancel
        </button>
      </div>

      <div className={field}>
        <div className={label}>Description</div>
        <textarea
          className={`${input} h-40 resize-y font-mono`}
          placeholder="Paste the full job posting here. The first line is auto-parsed into title & company."
          value={description}
          onChange={(e) => onPasteChange(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={field}>
          <div className={label}>Title</div>
          <input
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className={field}>
          <div className={label}>Company</div>
          <input
            className={input}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
        <div className={field}>
          <div className={label}>Location</div>
          <input
            className={input}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div className={field}>
          <div className={label}>Source URL</div>
          <input
            className={input}
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      </div>

      {err && <div className="text-sm text-[var(--danger)]">{err}</div>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending}
          className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save job"}
        </button>
      </div>
    </div>
  );
}
