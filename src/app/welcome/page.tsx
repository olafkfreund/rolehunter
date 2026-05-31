import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/settings/runtime";
import { getProfile } from "@/lib/repo/profile";
import { WelcomeWizard } from "@/components/welcome-wizard";

export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  const sp = await searchParams;
  // If already configured and the user didn't explicitly ask for the wizard,
  // skip straight to the dashboard.
  if (!sp.force && (await isConfigured())) {
    redirect("/");
  }
  const profile = await getProfile();
  return (
    <WelcomeWizard
      initialFullName={profile.fullName ?? ""}
      initialEmail={profile.email ?? ""}
      initialLocation={profile.location ?? ""}
    />
  );
}
