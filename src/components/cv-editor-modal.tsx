"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { X, Plus, Trash2 } from "lucide-react";
import type { CvMaster } from "@/lib/db/schema";
import type { CvJson, Provider } from "@/lib/llm/types";
import { ProviderToggle } from "./provider-toggle";

type ExperienceItem = NonNullable<CvJson["experience"]>[number];
type EducationItem = NonNullable<CvJson["education"]>[number];
type ProjectItem = NonNullable<CvJson["projects"]>[number];

const input =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const label = "text-sm font-medium";
const field = "space-y-1.5";

function coerceCvJson(raw: unknown): CvJson {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as CvJson;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as CvJson;
  return {};
}

async function parseJsonSafe(
  res: Response,
): Promise<{ error?: unknown } & Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error: text || `Request failed (${res.status})` };
  }
}

function errText(j: { error?: unknown } | undefined, fallback: string): string {
  const e = j?.error;
  if (!e) return fallback;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return fallback;
  }
}

export function CvEditorModal({
  cv,
  trigger,
  onSaved,
}: {
  cv: CvMaster;
  trigger: React.ReactNode;
  onSaved?: (cv: CvMaster) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[95vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <Dialog.Title className="text-base font-semibold">
              Edit CV — {cv.title}
            </Dialog.Title>
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
          <Dialog.Description className="sr-only">
            Edit the title, raw markdown, or structured fields of the CV, or re-parse it with an LLM.
          </Dialog.Description>
          {open && (
            <EditorBody
              cv={cv}
              onSaved={(updated) => {
                onSaved?.(updated);
              }}
              onClose={() => setOpen(false)}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditorBody({
  cv,
  onSaved,
  onClose,
}: {
  cv: CvMaster;
  onSaved: (updated: CvMaster) => void;
  onClose: () => void;
}) {
  const initialParsed = useMemo(() => coerceCvJson(cv.parsedJson), [cv.parsedJson]);
  const [title, setTitle] = useState(cv.title);
  const [rawMarkdown, setRawMarkdown] = useState(cv.rawMarkdown);
  const [parsed, setParsed] = useState<CvJson>(initialParsed);

  const [provider, setProvider] = useState<Provider>("claude");
  const [busy, setBusy] = useState<"raw" | "parsed" | "reparse" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function saveRaw() {
    setBusy("raw");
    setErr(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/cv/${cv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, rawMarkdown }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(errText(j, `save failed (${res.status})`));
      onSaved(j as unknown as CvMaster);
      setStatus("Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function saveParsed() {
    setBusy("parsed");
    setErr(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/cv/${cv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedJson: parsed }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(errText(j, `save failed (${res.status})`));
      onSaved(j as unknown as CvMaster);
      setStatus("Saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function reparse() {
    setBusy("reparse");
    setErr(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/cv/${cv.id}/reparse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(errText(j, `re-parse failed (${res.status})`));
      const updated = j as unknown as CvMaster;
      setParsed(coerceCvJson(updated.parsedJson));
      onSaved(updated);
      setStatus("Re-parsed — check the Parsed tab.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Re-parse failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Tabs.Root
      defaultValue="raw"
      className="flex min-h-0 flex-1 flex-col"
    >
      <Tabs.List className="flex gap-1 border-b border-[var(--border)] px-4 pt-3">
        <TabTrigger value="raw">Raw markdown</TabTrigger>
        <TabTrigger value="parsed">Parsed JSON</TabTrigger>
        <TabTrigger value="reparse">Re-parse with LLM</TabTrigger>
      </Tabs.List>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Tabs.Content value="raw" className="space-y-4 p-4">
          <div className={field}>
            <div className={label}>Title</div>
            <input
              className={input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className={field}>
            <div className={label}>Raw markdown</div>
            <textarea
              className={`${input} h-[52vh] resize-y font-mono`}
              value={rawMarkdown}
              onChange={(e) => setRawMarkdown(e.target.value)}
            />
          </div>
          <FooterButtons
            onSave={saveRaw}
            saving={busy === "raw"}
            saveLabel="Save"
            onClose={onClose}
            err={err}
            status={status}
          />
        </Tabs.Content>

        <Tabs.Content value="parsed" className="space-y-6 p-4">
          <ParsedEditor value={parsed} onChange={setParsed} />
          <FooterButtons
            onSave={saveParsed}
            saving={busy === "parsed"}
            saveLabel="Save parsed"
            onClose={onClose}
            err={err}
            status={status}
          />
        </Tabs.Content>

        <Tabs.Content value="reparse" className="space-y-4 p-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Re-run the parser on the current raw markdown to regenerate the structured
            fields. This replaces the parsed JSON — any manual edits in the Parsed tab
            will be overwritten.
          </p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--muted-foreground)]">Parser</span>
            <ProviderToggle
              value={provider}
              onChange={setProvider}
              disabled={busy === "reparse"}
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={reparse}
              disabled={busy === "reparse"}
              className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-50"
            >
              {busy === "reparse" ? "Re-parsing…" : "Re-parse raw markdown"}
            </button>
            {status && <span className="text-sm text-[var(--success)]">{status}</span>}
            {err && <span className="text-sm text-[var(--danger)]">{err}</span>}
          </div>
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

function TabTrigger({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className="rounded-t-md border border-transparent px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] data-[state=active]:border-[var(--border)] data-[state=active]:border-b-transparent data-[state=active]:bg-[var(--background)] data-[state=active]:text-[var(--foreground)]"
    >
      {children}
    </Tabs.Trigger>
  );
}

function FooterButtons({
  onSave,
  saving,
  saveLabel,
  onClose,
  err,
  status,
}: {
  onSave: () => void;
  saving: boolean;
  saveLabel: string;
  onClose: () => void;
  err: string | null;
  status: string | null;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-[var(--border)] pt-3">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-50"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="rounded-md border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
      >
        Close
      </button>
      {status && <span className="text-sm text-[var(--success)]">{status}</span>}
      {err && <span className="text-sm text-[var(--danger)]">{err}</span>}
    </div>
  );
}

/* ------------------------ Parsed JSON form editor ------------------------ */

function ParsedEditor({
  value,
  onChange,
}: {
  value: CvJson;
  onChange: (v: CvJson) => void;
}) {
  function set<K extends keyof CvJson>(k: K, v: CvJson[K]) {
    onChange({ ...value, [k]: v });
  }

  return (
    <div className="space-y-6">
      <section className={field}>
        <div className={label}>Summary</div>
        <textarea
          className={`${input} h-24 resize-y`}
          value={value.summary ?? ""}
          onChange={(e) => set("summary", e.target.value)}
        />
      </section>

      <ExperienceEditor
        value={value.experience ?? []}
        onChange={(v) => set("experience", v)}
      />

      <EducationEditor
        value={value.education ?? []}
        onChange={(v) => set("education", v)}
      />

      <section className={field}>
        <div className={label}>Skills (comma-separated)</div>
        <input
          className={input}
          value={(value.skills ?? []).join(", ")}
          onChange={(e) =>
            set(
              "skills",
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="TypeScript, React, PostgreSQL"
        />
      </section>

      <ProjectsEditor
        value={value.projects ?? []}
        onChange={(v) => set("projects", v)}
      />

      <section className={field}>
        <div className={label}>Certifications (one per line)</div>
        <textarea
          className={`${input} h-24 resize-y`}
          value={(value.certifications ?? []).join("\n")}
          onChange={(e) =>
            set(
              "certifications",
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      </section>

      <section className={field}>
        <div className={label}>Languages (comma-separated)</div>
        <input
          className={input}
          value={(value.languages ?? []).join(", ")}
          onChange={(e) =>
            set(
              "languages",
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          placeholder="English, French"
        />
      </section>
    </div>
  );
}

function SectionHeader({
  title,
  onAdd,
}: {
  title: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm font-semibold">{title}</div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
      >
        <Plus className="h-3 w-3" /> Add
      </button>
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function ExperienceEditor({
  value,
  onChange,
}: {
  value: ExperienceItem[];
  onChange: (v: ExperienceItem[]) => void;
}) {
  function update(i: number, patch: Partial<ExperienceItem>) {
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...value,
      { company: "", title: "", start: "", end: "", location: "", bullets: [] },
    ]);
  }
  return (
    <section className="space-y-3">
      <SectionHeader title="Experience" onAdd={add} />
      {value.length === 0 && (
        <div className="text-xs text-[var(--muted-foreground)]">No experience entries.</div>
      )}
      <div className="space-y-3">
        {value.map((row, i) => (
          <div
            key={i}
            className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                <div className={field}>
                  <div className={label}>Company</div>
                  <input
                    className={input}
                    value={row.company ?? ""}
                    onChange={(e) => update(i, { company: e.target.value })}
                  />
                </div>
                <div className={field}>
                  <div className={label}>Title</div>
                  <input
                    className={input}
                    value={row.title ?? ""}
                    onChange={(e) => update(i, { title: e.target.value })}
                  />
                </div>
                <div className={field}>
                  <div className={label}>Start</div>
                  <input
                    className={input}
                    value={row.start ?? ""}
                    onChange={(e) => update(i, { start: e.target.value })}
                    placeholder="e.g. 2022-01"
                  />
                </div>
                <div className={field}>
                  <div className={label}>End</div>
                  <input
                    className={input}
                    value={row.end ?? ""}
                    onChange={(e) => update(i, { end: e.target.value })}
                    placeholder="e.g. Present"
                  />
                </div>
                <div className={`${field} sm:col-span-2`}>
                  <div className={label}>Location</div>
                  <input
                    className={input}
                    value={row.location ?? ""}
                    onChange={(e) => update(i, { location: e.target.value })}
                  />
                </div>
              </div>
              <RemoveButton onClick={() => remove(i)} />
            </div>
            <div className={field}>
              <div className={label}>Bullets (one per line)</div>
              <textarea
                className={`${input} h-28 resize-y`}
                value={(row.bullets ?? []).join("\n")}
                onChange={(e) =>
                  update(i, {
                    bullets: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function EducationEditor({
  value,
  onChange,
}: {
  value: EducationItem[];
  onChange: (v: EducationItem[]) => void;
}) {
  function update(i: number, patch: Partial<EducationItem>) {
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([
      ...value,
      { institution: "", degree: "", field: "", start: "", end: "" },
    ]);
  }
  return (
    <section className="space-y-3">
      <SectionHeader title="Education" onAdd={add} />
      {value.length === 0 && (
        <div className="text-xs text-[var(--muted-foreground)]">No education entries.</div>
      )}
      <div className="space-y-3">
        {value.map((row, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3"
          >
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className={field}>
                <div className={label}>Institution</div>
                <input
                  className={input}
                  value={row.institution ?? ""}
                  onChange={(e) => update(i, { institution: e.target.value })}
                />
              </div>
              <div className={field}>
                <div className={label}>Degree</div>
                <input
                  className={input}
                  value={row.degree ?? ""}
                  onChange={(e) => update(i, { degree: e.target.value })}
                />
              </div>
              <div className={field}>
                <div className={label}>Field</div>
                <input
                  className={input}
                  value={row.field ?? ""}
                  onChange={(e) => update(i, { field: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={field}>
                  <div className={label}>Start</div>
                  <input
                    className={input}
                    value={row.start ?? ""}
                    onChange={(e) => update(i, { start: e.target.value })}
                  />
                </div>
                <div className={field}>
                  <div className={label}>End</div>
                  <input
                    className={input}
                    value={row.end ?? ""}
                    onChange={(e) => update(i, { end: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <RemoveButton onClick={() => remove(i)} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectsEditor({
  value,
  onChange,
}: {
  value: ProjectItem[];
  onChange: (v: ProjectItem[]) => void;
}) {
  function update(i: number, patch: Partial<ProjectItem>) {
    onChange(value.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...value, { name: "", description: "", tech: [] }]);
  }
  return (
    <section className="space-y-3">
      <SectionHeader title="Projects" onAdd={add} />
      {value.length === 0 && (
        <div className="text-xs text-[var(--muted-foreground)]">No projects.</div>
      )}
      <div className="space-y-3">
        {value.map((row, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-3"
          >
            <div className="grid flex-1 grid-cols-1 gap-3">
              <div className={field}>
                <div className={label}>Name</div>
                <input
                  className={input}
                  value={row.name ?? ""}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </div>
              <div className={field}>
                <div className={label}>Description</div>
                <textarea
                  className={`${input} h-20 resize-y`}
                  value={row.description ?? ""}
                  onChange={(e) => update(i, { description: e.target.value })}
                />
              </div>
              <div className={field}>
                <div className={label}>Tech (comma-separated)</div>
                <input
                  className={input}
                  value={(row.tech ?? []).join(", ")}
                  onChange={(e) =>
                    update(i, {
                      tech: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
            <RemoveButton onClick={() => remove(i)} />
          </div>
        ))}
      </div>
    </section>
  );
}
