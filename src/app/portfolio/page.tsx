import { listPortfolioItems } from "@/lib/repo/portfolio";
import { PortfolioPanel } from "@/components/portfolio-panel";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const items = await listPortfolioItems();
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Portfolio</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Your repos, blog posts, and manual entries — used to match against jobs in{" "}
          <a href="/jobs" className="underline underline-offset-2 hover:text-[var(--foreground)]">
            /jobs
          </a>{" "}
          and inject relevant projects into per-application CV tailoring (v3.1 follow-up).
        </p>
      </section>
      <PortfolioPanel initialItems={items} />
    </div>
  );
}
