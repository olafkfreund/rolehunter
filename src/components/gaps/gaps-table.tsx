"use client";

import { useMemo, useState } from "react";
import {
  ColumnDef,
  FilterFn,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  MoreVertical,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { GapRow, LearningStatus } from "@/lib/repo/gaps";
import { StatusSelect } from "./status-select";
import { LearnDrawer } from "./learn-drawer";

const globalFilterFn: FilterFn<GapRow> = (row, _col, filterValue) => {
  const q = String(filterValue ?? "").trim().toLowerCase();
  if (!q) return true;
  const g = row.original;
  const hay = [g.name, g.description].join(" ").toLowerCase();
  return hay.includes(q);
};

type Props = {
  initial: GapRow[];
};

export function GapsTable({ initial }: Props) {
  const [data, setData] = useState<GapRow[]>(initial);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "frequency", desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [drawerGapId, setDrawerGapId] = useState<number | null>(null);

  const maxOccurrences = useMemo(() => {
    let m = 0;
    for (const r of data) {
      if (r.occurrences > m) m = r.occurrences;
    }
    return Math.max(m, 1);
  }, [data]);

  function patchRow(id: number, patch: Partial<GapRow>) {
    setData((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: number) {
    setData((list) => list.filter((r) => r.id !== id));
  }

  async function handleDismiss(gap: GapRow) {
    try {
      const res = await fetch(`/api/gaps/${gap.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learningStatus: "dismissed" }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`PATCH ${res.status}: ${text.slice(0, 120)}`);
      }
      removeRow(gap.id);
      toast.success(`Dismissed "${gap.name}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss");
    }
  }

  const columns = useMemo<ColumnDef<GapRow>[]>(
    () => [
      {
        id: "skill",
        accessorFn: (r) => r.name,
        header: ({ column }) => (
          <HeaderSort
            label="Skill"
            sort={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => {
          const g = row.original;
          return (
            <div className="min-w-0">
              <div className="truncate font-semibold" title={g.name}>
                {g.name}
              </div>
              {g.description ? (
                <div
                  className="hidden truncate text-xs text-[var(--muted-foreground)] sm:block"
                  title={g.description}
                >
                  {g.description}
                </div>
              ) : null}
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "frequency",
        accessorFn: (r) => r.occurrences,
        header: ({ column }) => (
          <HeaderSort
            label="Frequency"
            sort={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => {
          const g = row.original;
          const pct = Math.min(
            100,
            Math.round((g.occurrences / maxOccurrences) * 100),
          );
          return (
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--muted)]"
                aria-hidden
              >
                <div
                  className="h-full bg-[var(--accent)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="tabular-nums text-sm">{g.occurrences}</span>
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "jobs",
        accessorFn: (r) => r.affectedJobTitles.length,
        header: ({ column }) => (
          <HeaderSort
            label="Jobs"
            sort={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => {
          const g = row.original;
          const count = g.affectedJobTitles.length;
          if (count === 0) {
            return (
              <span className="text-sm text-[var(--muted-foreground)]">—</span>
            );
          }
          const titlesText = g.affectedJobTitles.join("\n");
          return (
            <details className="group">
              <summary
                className="inline-flex cursor-pointer select-none items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-0.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)]"
                title={titlesText}
              >
                {count} job{count === 1 ? "" : "s"}
              </summary>
              <ul className="mt-1 max-h-40 overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-2 text-xs">
                {g.affectedJobTitles.map((t, i) => (
                  <li key={i} className="truncate" title={t}>
                    {t}
                  </li>
                ))}
              </ul>
            </details>
          );
        },
        enableSorting: true,
      },
      {
        id: "status",
        accessorKey: "learningStatus",
        header: () => (
          <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Status
          </span>
        ),
        cell: ({ row }) => {
          const g = row.original;
          return (
            <StatusSelect
              gapId={g.id}
              value={g.learningStatus as LearningStatus}
              onChanged={(s) => {
                if (s === "dismissed") {
                  removeRow(g.id);
                } else {
                  patchRow(g.id, { learningStatus: s });
                }
              }}
            />
          );
        },
        enableSorting: false,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const g = row.original;
          return (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label="Row actions"
                  className="rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-[180px] rounded-md border border-[var(--border)] bg-[var(--background)] p-1 text-sm shadow-md"
                >
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none hover:bg-[var(--muted)]"
                    onSelect={(e) => {
                      e.preventDefault();
                      setDrawerGapId(g.id);
                    }}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Learn
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]" />
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[var(--danger)] outline-none hover:bg-[var(--danger)]/10"
                    onSelect={(e) => {
                      e.preventDefault();
                      void handleDismiss(g);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Dismiss
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          );
        },
        enableSorting: false,
      },
    ],
    [maxOccurrences],
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const totalCount = data.length;
  const visibleCount = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1.5">
        <Search className="h-4 w-4 text-[var(--muted-foreground)]" />
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search skill, description…"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--background)]">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-[var(--border)]">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-3 py-2 align-bottom text-xs font-semibold uppercase text-[var(--muted-foreground)]"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-sm text-[var(--muted-foreground)]"
                >
                  {totalCount === 0
                    ? "No gaps yet. Click Refresh to cluster from recent matches."
                    : "No gaps match the current filter."}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-[var(--muted-foreground)]">
        Showing {visibleCount} of {totalCount}
      </div>

      {drawerGapId !== null ? (
        <LearnDrawer
          gapId={drawerGapId}
          open={drawerGapId !== null}
          onOpenChange={(open) => {
            if (!open) setDrawerGapId(null);
          }}
          onStatusChanged={(s) => {
            if (s === "dismissed") {
              removeRow(drawerGapId);
            } else {
              patchRow(drawerGapId, { learningStatus: s });
            }
          }}
        />
      ) : null}
    </div>
  );
}

type HeaderSortProps = {
  label: string;
  sort: false | "asc" | "desc";
  onToggle: () => void;
};

function HeaderSort({ label, sort, onToggle }: HeaderSortProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
    >
      {label}
      {sort === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : sort === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}
