"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
} from "lucide-react";
import type {
  ApplicationPriority,
  ApplicationStage,
  ApplicationWithJob,
} from "@/lib/repo/applications";
import { formatDate } from "@/lib/utils";
import { StageSelect } from "./stage-select";
import { PrioritySelect } from "./priority-select";
import { ExcitementStars } from "./excitement-stars";
import { LastContactCell } from "./last-contact-cell";
import { NotesCell } from "./notes-cell";
import { RowActionsMenu } from "./row-actions-menu";

const PRIORITY_ORDER: Record<ApplicationPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const STAGE_LABELS: Record<ApplicationStage, string> = {
  saved: "Saved",
  applied: "Applied",
  phone: "Phone",
  onsite: "Onsite",
  offer: "Offer",
  rejected: "Rejected",
};

const globalFilterFn: FilterFn<ApplicationWithJob> = (row, _col, filterValue) => {
  const q = String(filterValue ?? "").trim().toLowerCase();
  if (!q) return true;
  const a = row.original;
  const hay = [a.job.title, a.job.company, a.notesMd ?? ""]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
};

type Props = {
  initial: ApplicationWithJob[];
};

export function ApplicationsTable({ initial }: Props) {
  const [data, setData] = useState<ApplicationWithJob[]>(initial);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");

  function patchRow(id: number, patch: Partial<ApplicationWithJob>) {
    setData((list) =>
      list.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  const columns = useMemo<ColumnDef<ApplicationWithJob>[]>(
    () => [
      {
        id: "job",
        accessorFn: (r) => r.job.title,
        header: ({ column }) => (
          <HeaderSort
            label="Job"
            sort={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => {
          const a = row.original;
          return (
            <Link
              href={`/jobs/${a.jobId}`}
              className="block min-w-0 text-left hover:underline"
            >
              <div className="truncate font-medium" title={a.job.title}>
                {a.job.title}
              </div>
              <div
                className="truncate text-xs text-[var(--muted-foreground)]"
                title={a.job.company}
              >
                {a.job.company}
              </div>
            </Link>
          );
        },
        enableSorting: true,
      },
      {
        id: "stage",
        accessorKey: "stage",
        header: ({ column }) => (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
              Stage
            </span>
            <select
              value={(column.getFilterValue() as string) ?? ""}
              onChange={(e) =>
                column.setFilterValue(e.target.value || undefined)
              }
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">All</option>
              {(Object.keys(STAGE_LABELS) as ApplicationStage[]).map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        ),
        cell: ({ row }) => {
          const a = row.original;
          return (
            <StageSelect
              applicationId={a.id}
              value={a.stage}
              onChanged={(stage) => patchRow(a.id, { stage })}
            />
          );
        },
        enableSorting: false,
        filterFn: (row, _col, value) => {
          if (!value) return true;
          return row.original.stage === value;
        },
      },
      {
        id: "priority",
        accessorFn: (r) => PRIORITY_ORDER[r.priority],
        header: ({ column }) => (
          <div className="flex flex-col gap-1">
            <HeaderSort
              label="Priority"
              sort={column.getIsSorted()}
              onToggle={() => column.toggleSorting()}
            />
            <select
              value={(column.getFilterValue() as string) ?? ""}
              onChange={(e) =>
                column.setFilterValue(e.target.value || undefined)
              }
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)]"
            >
              <option value="">All</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        ),
        cell: ({ row }) => {
          const a = row.original;
          return (
            <PrioritySelect
              applicationId={a.id}
              value={a.priority}
              onChanged={(priority) => patchRow(a.id, { priority })}
            />
          );
        },
        enableSorting: true,
        filterFn: (row, _col, value) => {
          if (!value) return true;
          return row.original.priority === value;
        },
      },
      {
        id: "applied",
        accessorFn: (r) =>
          r.appliedAt ? new Date(r.appliedAt).getTime() : 0,
        header: ({ column }) => (
          <HeaderSort
            label="Applied"
            sort={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) =>
          row.original.appliedAt ? (
            <span className="text-sm">
              {formatDate(row.original.appliedAt)}
            </span>
          ) : (
            <span className="text-sm text-[var(--muted-foreground)]">—</span>
          ),
        enableSorting: true,
      },
      {
        id: "lastContact",
        accessorFn: (r) =>
          r.lastContact ? new Date(r.lastContact).getTime() : 0,
        header: ({ column }) => (
          <HeaderSort
            label="Last contact"
            sort={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => {
          const a = row.original;
          return (
            <LastContactCell
              applicationId={a.id}
              value={a.lastContact}
              onChanged={(lastContact) => patchRow(a.id, { lastContact })}
            />
          );
        },
        enableSorting: true,
      },
      {
        id: "excitement",
        accessorFn: (r) => (r.excitement == null ? -1 : r.excitement),
        header: ({ column }) => (
          <HeaderSort
            label="Excitement"
            sort={column.getIsSorted()}
            onToggle={() => column.toggleSorting()}
          />
        ),
        cell: ({ row }) => {
          const a = row.original;
          return (
            <ExcitementStars
              applicationId={a.id}
              value={a.excitement}
              onChanged={(excitement) => patchRow(a.id, { excitement })}
            />
          );
        },
        enableSorting: true,
      },
      {
        id: "notes",
        accessorKey: "notesMd",
        header: () => (
          <span className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
            Notes
          </span>
        ),
        cell: ({ row }) => {
          const a = row.original;
          return (
            <NotesCell
              applicationId={a.id}
              value={a.notesMd ?? ""}
              onChanged={(notesMd) => patchRow(a.id, { notesMd })}
            />
          );
        },
        enableSorting: false,
      },
      {
        id: "actions",
        header: () => (
          <span className="sr-only">Actions</span>
        ),
        cell: ({ row }) => {
          const a = row.original;
          return (
            <RowActionsMenu
              application={a}
              onChanged={(action) => {
                if (action === "deleted") {
                  setData((list) => list.filter((r) => r.id !== a.id));
                }
              }}
            />
          );
        },
        enableSorting: false,
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const totalCount = data.length;
  const visibleCount = table.getFilteredRowModel().rows.length;

  // Columns hidden on small screens. Keep: Job / Stage / Priority / Notes / Actions
  const MOBILE_HIDDEN = new Set(["applied", "lastContact", "excitement"]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1.5">
        <Search className="h-4 w-4 text-[var(--muted-foreground)]" />
        <input
          type="text"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder="Search title, company, notes…"
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--background)]">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-[var(--border)]">
                {hg.headers.map((header) => {
                  const hideOnMobile = MOBILE_HIDDEN.has(header.column.id);
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={`px-3 py-2 align-bottom text-xs font-semibold uppercase text-[var(--muted-foreground)] ${
                        hideOnMobile ? "hidden md:table-cell" : ""
                      }`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  );
                })}
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
                    ? "No applications yet. Track a job to get started."
                    : "No applications match the current filters."}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--muted)]/30"
                >
                  {row.getVisibleCells().map((cell) => {
                    const hideOnMobile = MOBILE_HIDDEN.has(cell.column.id);
                    return (
                      <td
                        key={cell.id}
                        className={`px-3 py-2 align-middle ${
                          hideOnMobile ? "hidden md:table-cell" : ""
                        }`}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-[var(--muted-foreground)]">
        Showing {visibleCount} of {totalCount}
      </div>
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
