import { getActiveCv } from "@/lib/repo/cv";
import { CvWorkshop } from "@/components/cv-workshop";

export const dynamic = "force-dynamic";

export default async function CvPage() {
  const cv = await getActiveCv();
  return (
    <div className="space-y-6">
      <section className="rise" data-delay="1">
        <div className="section-label mb-2">vol. iii · cv workshop</div>
        <h1 className="page-title">
          <span>Sharpen</span>
          <span
            className="ml-3 italic font-normal text-[var(--accent)]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            the cv
          </span>
        </h1>
        <p className="subtitle mt-2">
          ATS-aware checks, gap scans, and section rewrites against your active CV. Heuristic
          tests run locally; LLM-driven suggestions use your configured provider.
        </p>
      </section>
      <div className="rise" data-delay="2">
        {cv ? (
          <CvWorkshop cv={cv} />
        ) : (
          <div className="card p-12 text-center">
            <div className="section-label mb-2">no active cv</div>
            <div className="text-[var(--fg-3)] text-sm">
              Upload one in{" "}
              <a href="/profile" className="text-[var(--accent)] hover:underline">
                /profile
              </a>{" "}
              to start the workshop.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
