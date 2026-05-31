import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/toaster";
import { CommandPalette } from "@/components/command-palette";
import { ThemeSwitcher } from "@/components/theme-switcher";
import "./globals.css";

// Editorial display serif — optical-sized so headings render with intent at every size.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RoleHunter — Editorial Terminal",
  description:
    "Self-hosted job-hunt automation. 11 sources, ranked feed, CV-tailored applications.",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/search", label: "Searches" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/cv", label: "CV" },
  { href: "/applications", label: "Applications" },
  { href: "/interviews", label: "Interviews" },
  { href: "/gaps", label: "Gaps" },
  { href: "/profile", label: "Profile" },
];

const overflow = [
  { href: "/settings", label: "Settings" },
  { href: "/companies", label: "Companies" },
  { href: "/templates", label: "Templates" },
  { href: "/linkedin-seo", label: "LinkedIn SEO" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen">
        <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-5 py-3">
            {/* Editorial wordmark — Fraunces italic ampersand-style */}
            <Link href="/" className="flex items-baseline gap-1 shrink-0 group">
              <span className="text-[18px] font-medium tracking-tight">role</span>
              <span
                className="text-[18px] italic font-medium"
                style={{ fontFamily: "var(--font-serif)", color: "var(--accent)" }}
              >
                hunter
              </span>
              <span className="ml-1 text-[10px] text-[var(--fg-3)] tracking-[0.15em] uppercase font-mono">
                v3
              </span>
            </Link>

            <nav className="flex items-center gap-1 text-[13px] flex-1 overflow-x-auto">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-2 py-1 text-[var(--fg-2)] hover:text-[var(--fg)] transition-colors whitespace-nowrap rounded-sm"
                >
                  {n.label}
                </Link>
              ))}
              <span className="vrule" />
              {overflow.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-2 py-1 text-[var(--fg-3)] hover:text-[var(--fg)] transition-colors whitespace-nowrap text-[12px]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            {/* Command-palette trigger — Cmd+K */}
            <CommandPalette />
            <ThemeSwitcher />
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-5 py-8">{children}</main>
        <footer className="mx-auto max-w-[1280px] px-5 py-6 mt-12 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-[11px] text-[var(--fg-4)] font-mono uppercase tracking-wider">
            <span>self-hosted · single-user · 11 sources</span>
            <span>
              <span className="dot ok" /> live
            </span>
          </div>
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
