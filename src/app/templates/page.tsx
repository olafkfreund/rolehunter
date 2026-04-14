import { listTemplates } from "@/lib/repo/coverLetters";
import { CoverLetterTemplateEditor } from "@/components/cover-letter-template-editor";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await listTemplates();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cover Letter Templates
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Reusable tone, structure, and phrasing guidance the LLM will follow
          when generating per-application cover letters.
        </p>
      </div>
      <CoverLetterTemplateEditor templates={templates} />
    </div>
  );
}
