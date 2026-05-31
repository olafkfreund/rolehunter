import { listProfiles } from "@/lib/repo/searchProfiles";
import { SearchProfilesPanel } from "@/components/search-profiles-panel";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const profiles = await listProfiles();
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Saved searches</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Profiles that fan out across job sources on a schedule. Newly-ingested
          jobs auto-score against your active CV and appear in{" "}
          <a href="/jobs" className="underline underline-offset-2 hover:text-[var(--foreground)]">/jobs</a>
          .
        </p>
      </section>
      <SearchProfilesPanel initialProfiles={profiles} />
    </div>
  );
}
