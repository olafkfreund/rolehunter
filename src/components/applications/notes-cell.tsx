"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  applicationId: number;
  value: string;
  onChanged?: (notesMd: string) => void;
};

function preview(md: string): string {
  if (!md) return "";
  const compact = md.replace(/\s+/g, " ").trim();
  return compact.length > 60 ? `${compact.slice(0, 60)}…` : compact;
}

export function NotesCell({ applicationId, value, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string>(value ?? "");
  const [draft, setDraft] = useState<string>(value ?? "");
  const [saving, setSaving] = useState(false);

  function openDialog() {
    setDraft(current);
    setOpen(true);
  }

  async function handleSave() {
    if (draft === current) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notesMd: draft }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${res.status}: ${text.slice(0, 120)}`);
      }
      setCurrent(draft);
      onChanged?.(draft);
      setOpen(false);
      toast.success("Notes saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          onClick={openDialog}
          className="inline-flex max-w-[28ch] items-center gap-1.5 truncate rounded px-1.5 py-0.5 text-left text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          title={current || "Add notes"}
        >
          <Pencil className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {current ? preview(current) : "Add notes"}
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-[var(--border)] bg-[var(--background)] shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <Dialog.Title className="text-base font-semibold">
              Edit notes
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
            Edit markdown notes for this application.
          </Dialog.Description>
          <div className="flex-1 overflow-y-auto p-4">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              placeholder="Notes (markdown)…"
              className="w-full resize-y rounded border border-[var(--border)] bg-[var(--background)] p-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
