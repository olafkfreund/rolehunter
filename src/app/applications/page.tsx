import { listApplicationsWithJob } from "@/lib/repo/applications";
import { ApplicationsHeader } from "@/components/applications/applications-header";
import { ApplicationsTable } from "@/components/applications/applications-table";
import { AddApplicationButton } from "@/components/add-application-button";
import { KanbanBoard } from "@/components/kanban-board";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "board" ? "board" : "table";
  const apps = await listApplicationsWithJob();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Track your pipeline as a table or a board.
        </p>
      </div>
      <ApplicationsHeader initialView={view} />
      {view === "table" ? (
        <ApplicationsTable initial={apps} />
      ) : (
        <>
          <AddApplicationButton />
          <KanbanBoard initial={apps} />
        </>
      )}
    </div>
  );
}
