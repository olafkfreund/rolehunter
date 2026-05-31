import type { Metadata } from "next";
import Link from "next/link";
import { Toaster } from "@/components/toaster";
import "./globals.css";

export const metadata: Metadata = {
  title: "RoleHunter",
  description: "AI-powered, self-hosted job matching and CV tailoring",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/jobs", label: "Jobs" },
  { href: "/search", label: "Searches" },
  { href: "/applications", label: "Applications" },
  { href: "/gaps", label: "Gaps" },
  { href: "/interviews", label: "Interviews" },
  { href: "/templates", label: "Templates" },
  { href: "/linkedin-seo", label: "LinkedIn SEO" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-[var(--border)] bg-[var(--muted)]/50 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              RoleHunter
            </Link>
            <nav className="flex gap-4 text-sm">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
