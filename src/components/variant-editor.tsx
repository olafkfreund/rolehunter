"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type SavedRow = {
  id: number;
  tailoredMarkdown: string;
  keywords: string[];
};

type VariantEditorProps = {
  initialMarkdown: string;
  initialKeywords: string[];
  variantId: number;
  onSaved: (row: SavedRow) => void;
  onCancel: () => void;
};

function parseKeywords(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function keywordsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function VariantEditor({
  initialMarkdown,
  initialKeywords,
  variantId,
  onSaved,
  onCancel,
}: VariantEditorProps) {
  const [markdown, setMarkdown] = useState<string>(initialMarkdown);
  const [keywordsStr, setKeywordsStr] = useState<string>(
    initialKeywords.join(", "),
  );
  const [saving, setSaving] = useState(false);

  const parsedKeywords = useMemo(
    () => parseKeywords(keywordsStr),
    [keywordsStr],
  );

  const markdownUnchanged = markdown === initialMarkdown;
  const keywordsUnchanged = keywordsEqual(parsedKeywords, initialKeywords);
  const saveDisabled = saving || (markdownUnchanged && keywordsUnchanged);

  async function onSave() {
    setSaving(true);
    try {
      const patch: { tailoredMarkdown?: string; keywords?: string[] } = {};
      if (!markdownUnchanged) patch.tailoredMarkdown = markdown;
      if (!keywordsUnchanged) patch.keywords = parsedKeywords;

      const res = await fetch(`/api/variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const text = await res.text();
      const json: unknown = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const msg =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error?: unknown }).error === "string"
            ? (json as { error: string }).error
            : `Save failed (${res.status})`;
        throw new Error(msg);
      }
      const row = json as {
        id: number;
        tailoredMarkdown: string;
        keywords: unknown;
      };
      const savedKeywords = Array.isArray(row.keywords)
        ? (row.keywords as unknown[]).filter(
            (x): x is string => typeof x === "string",
          )
        : [];
      toast.success("Saved");
      onSaved({
        id: row.id,
        tailoredMarkdown: row.tailoredMarkdown,
        keywords: savedKeywords,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        spellCheck={false}
        className="h-[520px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
      />

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-[var(--muted-foreground)]">
          Keywords (comma-separated)
        </div>
        <input
          type="text"
          value={keywordsStr}
          onChange={(e) => setKeywordsStr(e.target.value)}
          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          placeholder="e.g. kubernetes, terraform, observability"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
