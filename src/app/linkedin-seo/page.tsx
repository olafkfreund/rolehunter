import { getProfile } from "@/lib/repo/profile";
import { listRecentScans } from "@/lib/repo/linkedin";
import { LinkedinScanner } from "@/components/linkedin-scanner";

export const dynamic = "force-dynamic";

export default async function LinkedinSeoPage() {
  const [profile, recent] = await Promise.all([getProfile(), listRecentScans(10)]);
  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">LinkedIn SEO</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Score your current headline and about text against a target role. Get keyword coverage,
          rewrite suggestions, and ready-to-paste drafts.
        </p>
      </section>
      <LinkedinScanner profile={profile} recent={recent} />
    </div>
  );
}
