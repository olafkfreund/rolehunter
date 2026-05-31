import { listPortfolioItems, listSources } from "@/lib/repo/portfolio";
import { PortfolioPanel } from "@/components/portfolio-panel";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const [items, sources] = await Promise.all([listPortfolioItems(), listSources()]);
  return (
    <div className="space-y-6">
      <section className="rise" data-delay="1">
        <div className="section-label mb-2">vol. iii · portfolio</div>
        <h1 className="page-title">
          <span>Portfolio</span>
          <span
            className="ml-3 text-[var(--fg-4)] font-normal"
            style={{ fontFamily: "var(--font-sans)", fontSize: "0.5em", verticalAlign: "middle" }}
          >
            <span className="mono">{items.length}</span>
          </span>
        </h1>
        <p className="subtitle mt-2">
          Repos, projects, skills, and roles that prove what you can do — pulled from GitHub and
          GitLab, plus any manual entries. Used for per-job CV tailoring and gap analysis.
        </p>
      </section>
      <div className="rise" data-delay="2">
        <PortfolioPanel initialItems={items} initialSources={sources} />
      </div>
    </div>
  );
}
