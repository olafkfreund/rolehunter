import { getProfile } from "@/lib/repo/profile";
import { getActiveCv, listCvs } from "@/lib/repo/cv";
import { ProfileForm } from "@/components/profile-form";
import { CvUpload } from "@/components/cv-upload";
import { CvList } from "@/components/cv-list";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [profile, cvs, active] = await Promise.all([
    getProfile(),
    listCvs(),
    getActiveCv(),
  ]);
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Contact details and LinkedIn text used when scoring and tailoring your CV.
          </p>
        </div>
        <ProfileForm initial={profile} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Master CV</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Upload a PDF or paste markdown. The parser extracts structured data used by every match and rewrite.
          </p>
        </div>

        <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
          <div className="text-sm font-semibold">Add another CV</div>
          <CvUpload initial={active} />
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold">Your CVs</div>
          <CvList initial={cvs} />
        </div>
      </section>
    </div>
  );
}
