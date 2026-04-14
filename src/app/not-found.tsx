import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] p-6">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        That page or record doesn&apos;t exist.
      </p>
      <Link href="/" className="text-sm text-[var(--accent)] underline">
        Back to dashboard
      </Link>
    </div>
  );
}
