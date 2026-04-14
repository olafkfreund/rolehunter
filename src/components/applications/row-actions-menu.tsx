"use client";

import Link from "next/link";
import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  CalendarDays,
  ExternalLink,
  FileText,
  MessageSquare,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { ApplicationWithJob } from "@/lib/repo/applications";

type Props = {
  application: ApplicationWithJob;
  onChanged: (action: "deleted") => void;
};

export function RowActionsMenu({ application, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this application? This cannot be undone.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`DELETE ${res.status}: ${text.slice(0, 120)}`);
      }
      toast.success("Application deleted");
      onChanged("deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  async function handleCoverLetter() {
    setBusy(true);
    try {
      let provider = "claude";
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("rolehunter.provider");
        if (stored) provider = stored;
      }
      const res = await fetch(
        `/api/applications/${application.id}/cover-letter-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${res.status}: ${text.slice(0, 120)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeCompany = application.job.company.replace(/[^a-z0-9]+/gi, "-");
      const safeTitle = application.job.title.replace(/[^a-z0-9]+/gi, "-");
      a.download = `cover-letter-${safeCompany}-${safeTitle}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Cover letter generated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to generate cover letter",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Row actions"
          disabled={busy}
          className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-[200px] rounded-md border border-[var(--border)] bg-[var(--background)] p-1 text-sm shadow-md"
        >
          <DropdownMenu.Item asChild>
            <Link
              href={`/jobs/${application.jobId}`}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-[var(--muted)]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open job
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href={`/jobs/${application.jobId}`}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-[var(--muted)]"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Schedule interview
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href={`/applications/${application.id}/feedback`}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-[var(--muted)]"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Log feedback
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-[var(--muted)]"
            onSelect={(e) => {
              e.preventDefault();
              void handleCoverLetter();
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            Generate cover letter
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[var(--danger)] outline-none hover:bg-[var(--danger)]/10"
            onSelect={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
