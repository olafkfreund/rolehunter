"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import type {
  ApplicationStage,
  ApplicationWithJob,
} from "@/lib/repo/applications";
import { KanbanCard } from "./kanban-card";

type ColumnDef = {
  id: ApplicationStage;
  label: string;
  headerBg: string;
};

const COLUMNS: ColumnDef[] = [
  { id: "saved", label: "Saved", headerBg: "bg-[var(--muted)]" },
  { id: "applied", label: "Applied", headerBg: "bg-[var(--accent)]/10" },
  { id: "phone", label: "Phone", headerBg: "bg-[var(--warning)]/10" },
  { id: "onsite", label: "Onsite", headerBg: "bg-[var(--warning)]/10" },
  { id: "offer", label: "Offer", headerBg: "bg-[var(--success)]/10" },
  { id: "rejected", label: "Rejected", headerBg: "bg-[var(--danger)]/10" },
];

export function KanbanBoard({ initial }: { initial: ApplicationWithJob[] }) {
  const [apps, setApps] = useState<ApplicationWithJob[]>(initial);
  const [activeId, setActiveId] = useState<number | null>(null);
  const announcerRef = useRef<HTMLSpanElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const byStage = useMemo(() => {
    const map: Record<ApplicationStage, ApplicationWithJob[]> = {
      saved: [],
      applied: [],
      phone: [],
      onsite: [],
      offer: [],
      rejected: [],
    };
    for (const a of apps) {
      map[a.stage].push(a);
    }
    return map;
  }, [apps]);

  const activeApp = activeId != null ? apps.find((a) => a.id === activeId) : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const id = Number(active.id);
    const targetStage = String(over.id) as ApplicationStage;
    if (!COLUMNS.some((c) => c.id === targetStage)) return;

    const current = apps.find((a) => a.id === id);
    if (!current || current.stage === targetStage) return;

    const prev = apps;
    const now = new Date();
    const optimistic: ApplicationWithJob = {
      ...current,
      stage: targetStage,
      appliedAt:
        targetStage === "applied" && !current.appliedAt ? now : current.appliedAt,
      updatedAt: now,
    };
    setApps((list) => list.map((a) => (a.id === id ? optimistic : a)));

    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
      if (announcerRef.current) {
        announcerRef.current.textContent = `Moved ${current.job.title} to ${targetStage}`;
      }
    } catch {
      toast.error("Couldn't move card — reverting.");
      setApps(prev);
    }
  }

  async function handleDelete(id: number) {
    const prev = apps;
    setApps((list) => list.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/applications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`DELETE failed: ${res.status}`);
    } catch {
      toast.error("Couldn't delete application.");
      setApps(prev);
    }
  }

  async function handleNotesSave(
    id: number,
    notesMd: string,
  ): Promise<void> {
    const prev = apps;
    setApps((list) =>
      list.map((a) =>
        a.id === id ? { ...a, notesMd, updatedAt: new Date() } : a,
      ),
    );
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notesMd }),
      });
      if (!res.ok) throw new Error(`PATCH notes failed: ${res.status}`);
    } catch {
      toast.error("Couldn't save notes.");
      setApps(prev);
    }
  }

  async function handleReminderSave(
    id: number,
    reminderAt: string | null,
  ): Promise<boolean> {
    const prev = apps;
    const nextDate = reminderAt ? new Date(reminderAt) : null;
    setApps((list) =>
      list.map((a) =>
        a.id === id
          ? { ...a, reminderAt: nextDate, updatedAt: new Date() }
          : a,
      ),
    );
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderAt }),
      });
      if (!res.ok) throw new Error(`PATCH reminder failed: ${res.status}`);
      return true;
    } catch {
      toast.error("Couldn't save reminder.");
      setApps(prev);
      return false;
    }
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        <span ref={announcerRef} />
      </div>

      {/* Desktop / tablet: horizontal columns */}
      <div className="hidden md:flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            column={col}
            items={byStage[col.id]}
            onDelete={handleDelete}
            onNotesSave={handleNotesSave}
            onReminderSave={handleReminderSave}
          />
        ))}
      </div>

      {/* Mobile: vertical accordion-like stack */}
      <div className="md:hidden flex flex-col gap-4">
        {COLUMNS.map((col) => (
          <MobileColumn
            key={col.id}
            column={col}
            items={byStage[col.id]}
            onDelete={handleDelete}
            onNotesSave={handleNotesSave}
            onReminderSave={handleReminderSave}
          />
        ))}
      </div>

      <DragOverlay>
        {activeApp ? (
          <div className="rotate-1">
            <KanbanCard
              application={activeApp}
              onDelete={() => {}}
              onNotesSave={async () => {}}
              onReminderSave={async () => false}
              dragging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

type ColumnProps = {
  column: ColumnDef;
  items: ApplicationWithJob[];
  onDelete: (id: number) => Promise<void> | void;
  onNotesSave: (id: number, notesMd: string) => Promise<void>;
  onReminderSave: (id: number, reminderAt: string | null) => Promise<boolean>;
};

function Column({
  column,
  items,
  onDelete,
  onNotesSave,
  onReminderSave,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex min-w-[280px] max-w-[320px] flex-1 flex-col rounded-lg border border-[var(--border)] bg-[var(--background)] ${
        isOver ? "ring-2 ring-[var(--accent)]" : ""
      }`}
    >
      <div
        className={`flex items-center justify-between rounded-t-lg border-b border-[var(--border)] px-3 py-2 ${column.headerBg}`}
      >
        <span className="text-sm font-medium">{column.label}</span>
        <span className="rounded-full bg-[var(--background)]/60 px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
          {items.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2 min-h-[100px]">
        {items.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-[var(--border)] py-6 text-xs text-[var(--muted-foreground)]">
            Drop here
          </div>
        ) : (
          items.map((app) => (
            <DraggableCard
              key={app.id}
              application={app}
              onDelete={onDelete}
              onNotesSave={onNotesSave}
              onReminderSave={onReminderSave}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MobileColumn({
  column,
  items,
  onDelete,
  onNotesSave,
  onReminderSave,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border border-[var(--border)] bg-[var(--background)] ${
        isOver ? "ring-2 ring-[var(--accent)]" : ""
      }`}
    >
      <div
        className={`flex items-center justify-between rounded-t-lg border-b border-[var(--border)] px-3 py-2 ${column.headerBg}`}
      >
        <span className="text-sm font-medium">{column.label}</span>
        <span className="rounded-full bg-[var(--background)]/60 px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-2 min-h-[64px]">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--border)] py-4 text-center text-xs text-[var(--muted-foreground)]">
            Empty
          </div>
        ) : (
          items.map((app) => (
            <DraggableCard
              key={app.id}
              application={app}
              onDelete={onDelete}
              onNotesSave={onNotesSave}
              onReminderSave={onReminderSave}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  application,
  onDelete,
  onNotesSave,
  onReminderSave,
}: {
  application: ApplicationWithJob;
  onDelete: (id: number) => Promise<void> | void;
  onNotesSave: (id: number, notesMd: string) => Promise<void>;
  onReminderSave: (id: number, reminderAt: string | null) => Promise<boolean>;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: application.id });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-40" : ""}>
      <KanbanCard
        application={application}
        onDelete={onDelete}
        onNotesSave={onNotesSave}
        onReminderSave={onReminderSave}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
