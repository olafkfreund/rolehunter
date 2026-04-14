import { redirect } from "next/navigation";

export default function LegacyKanbanPage() {
  redirect("/applications?view=board");
}
