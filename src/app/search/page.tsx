import { listProfiles } from "@/lib/repo/searchProfiles";
import { SearchProfilesPanel } from "@/components/search-profiles-panel";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const profiles = await listProfiles();
  return (
    <div className="space-y-6">
      <section className="rise" data-delay="1">
        <div className="section-label mb-2">vol. iii · saved searches</div>
        <h1 className="page-title">
          <span>Profiles</span>
          <span
            className="ml-3 text-[var(--fg-4)] font-normal"
            style={{ fontFamily: "var(--font-sans)", fontSize: "0.5em", verticalAlign: "middle" }}
          >
            <span className="mono">{profiles.length}</span>
          </span>
        </h1>
        <p className="subtitle mt-2">
          Profiles that fan out across job sources on a schedule. Newly-ingested
          jobs auto-score against your active CV and appear in{" "}
          <a
            href="/jobs"
            className="text-[var(--fg-2)] hover:text-[var(--accent)] underline underline-offset-2 decoration-[var(--border-hi)]"
          >
            /jobs
          </a>
          .
        </p>
      </section>
      <div className="rise" data-delay="2">
        <SearchProfilesPanel initialProfiles={profiles} />
      </div>
    </div>
  );
}
