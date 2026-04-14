"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CoverLetterTemplate } from "@/lib/db/schema";

type Draft = {
  id: number | null;
  name: string;
  bodyMd: string;
  isDefault: boolean;
};

function emptyDraft(): Draft {
  return { id: null, name: "", bodyMd: "", isDefault: false };
}

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

export function CoverLetterTemplateEditor({
  templates,
}: {
  templates: CoverLetterTemplate[];
}) {
  const router = useRouter();
  const [list, setList] = useState<CoverLetterTemplate[]>(templates);
  const [draft, setDraft] = useState<Draft>(() =>
    templates[0]
      ? {
          id: templates[0].id,
          name: templates[0].name,
          bodyMd: templates[0].bodyMd,
          isDefault: templates[0].isDefault,
        }
      : emptyDraft(),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(
    () => list.find((t) => t.id === draft.id) ?? null,
    [list, draft.id],
  );

  function selectTemplate(id: number | null) {
    if (id === null) {
      setDraft(emptyDraft());
      setErr(null);
      return;
    }
    const t = list.find((x) => x.id === id);
    if (!t) return;
    setDraft({
      id: t.id,
      name: t.name,
      bodyMd: t.bodyMd,
      isDefault: t.isDefault,
    });
    setErr(null);
  }

  async function refetchList(): Promise<CoverLetterTemplate[]> {
    const res = await fetch("/api/cover-letter-templates", { cache: "no-store" });
    const body = await parseJsonSafe(res);
    if (!res.ok) throw new Error(errorMessage(body, "Failed to load templates"));
    return Array.isArray(body) ? (body as CoverLetterTemplate[]) : [];
  }

  async function onSave() {
    setBusy(true);
    setErr(null);
    try {
      if (!draft.name.trim()) {
        throw new Error("Name is required");
      }
      const payload = {
        name: draft.name.trim(),
        bodyMd: draft.bodyMd,
        isDefault: draft.isDefault,
      };
      const res = await fetch(
        draft.id
          ? `/api/cover-letter-templates/${draft.id}`
          : "/api/cover-letter-templates",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await parseJsonSafe(res);
      if (!res.ok) throw new Error(errorMessage(body, "Save failed"));
      const saved = body as CoverLetterTemplate;
      const next = await refetchList();
      setList(next);
      setDraft({
        id: saved.id,
        name: saved.name,
        bodyMd: saved.bodyMd,
        isDefault: saved.isDefault,
      });
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!draft.id) return;
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/cover-letter-templates/${draft.id}`, {
        method: "DELETE",
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) throw new Error(errorMessage(body, "Delete failed"));
      const next = await refetchList();
      setList(next);
      setDraft(next[0]
        ? {
            id: next[0].id,
            name: next[0].name,
            bodyMd: next[0].bodyMd,
            isDefault: next[0].isDefault,
          }
        : emptyDraft());
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function onMakeDefault() {
    if (!draft.id) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/cover-letter-templates/${draft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      const body = await parseJsonSafe(res);
      if (!res.ok) throw new Error(errorMessage(body, "Could not set default"));
      const next = await refetchList();
      setList(next);
      const updated = next.find((t) => t.id === draft.id);
      if (updated) {
        setDraft({
          id: updated.id,
          name: updated.name,
          bodyMd: updated.bodyMd,
          isDefault: updated.isDefault,
        });
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not set default");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
      <aside className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
        <button
          type="button"
          onClick={() => selectTemplate(null)}
          className="w-full rounded-md border border-dashed border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
        >
          + New template
        </button>
        <ul className="space-y-1">
          {list.map((t) => {
            const active = draft.id === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => selectTemplate(t.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-[var(--foreground)] text-[var(--background)]"
                      : "hover:bg-[var(--muted)]"
                  }`}
                >
                  <span className="truncate">{t.name}</span>
                  {t.isDefault && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        active
                          ? "bg-[var(--background)] text-[var(--foreground)]"
                          : "bg-[var(--success)]/10 text-[var(--success)]"
                      }`}
                    >
                      Default
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
              No templates yet.
            </li>
          )}
        </ul>
      </aside>

      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              {draft.id ? "Edit template" : "New template"}
            </h2>
            {selected && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Last updated {new Date(selected.updatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {draft.id && !draft.isDefault && (
              <button
                type="button"
                onClick={onMakeDefault}
                disabled={busy}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
              >
                Make default
              </button>
            )}
            {draft.id && (
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="rounded-md border border-[var(--danger)] px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-50"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
            >
              {busy ? "Saving…" : draft.id ? "Save" : "Create"}
            </button>
          </div>
        </div>

        {err && <div className="text-sm text-[var(--danger)]">{err}</div>}

        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--muted-foreground)]">
            Name
          </label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Warm, story-driven"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--foreground)]"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[var(--muted-foreground)]">
            Template body (markdown)
          </label>
          <textarea
            value={draft.bodyMd}
            onChange={(e) => setDraft({ ...draft, bodyMd: e.target.value })}
            placeholder={
              "Describe tone, structure, and any phrasing you like.\n\nExample:\n\nDear hiring team at {{company}},\n\nI'm excited to apply for the {{role}} role because…\n\nOne specific result: …\n\nWarm regards,\n{{candidate}}"
            }
            rows={18}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-[var(--foreground)]"
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Placeholder hints:{" "}
            <code className="rounded bg-[var(--muted)]/50 px-1">
              {"{{company}}"}
            </code>
            ,{" "}
            <code className="rounded bg-[var(--muted)]/50 px-1">
              {"{{role}}"}
            </code>
            ,{" "}
            <code className="rounded bg-[var(--muted)]/50 px-1">
              {"{{topSkill}}"}
            </code>
            ,{" "}
            <code className="rounded bg-[var(--muted)]/50 px-1">
              {"{{candidate}}"}
            </code>
            . These are guidance for the LLM, not strict string replacements —
            the model will interpret your template as tone/structure guidance
            and weave in the actual job, company, and candidate details.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })}
          />
          Use this template as the default
        </label>
      </section>
    </div>
  );
}
