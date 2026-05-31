import Link from "next/link";
import { getProfile } from "@/lib/repo/profile";
import { CompanyPrefsForm } from "@/components/company-prefs-form";

export const dynamic = "force-dynamic";

export default async function CompanyPrefsPage() {
  const profile = await getProfile();
  return (
    <div className="space-y-6">
      <section className="rise" data-delay="1">
        <div className="section-label mb-2">vol. iii · company preferences</div>
        <h1 className="page-title">Company preferences</h1>
        <p className="subtitle mt-2">
          Tell RoleHunter what you value in an employer — these weights drive the role-fit
          dashboard's Logistics dimension and a future per-company fit score. Pair with{" "}
          <Link href="/profile" className="text-[var(--accent)] hover:underline">
            /profile
          </Link>{" "}
          (home address, salary target, culture).
        </p>
      </section>

      <div className="rise" data-delay="2">
        <CompanyPrefsForm
          initialMaxCommuteMinutes={
            (profile as { maxCommuteMinutes?: number | null }).maxCommuteMinutes ?? null
          }
          initialTransportMode={
            ((profile as { preferredTransportMode?: string | null }).preferredTransportMode as
              | "car"
              | "transit"
              | "bike"
              | "walk"
              | "any"
              | null) ?? "any"
          }
          initialBenefitPriorities={
            Array.isArray((profile as { benefitPriorities?: unknown }).benefitPriorities)
              ? ((profile as { benefitPriorities: string[] }).benefitPriorities ?? [])
              : []
          }
        />
      </div>
    </div>
  );
}
