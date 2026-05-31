import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/toaster";
import { CommandPalette } from "@/components/command-palette";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Sidebar } from "@/components/sidebar";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 min-w-0 flex flex-col">
            <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-md">
              <div className="flex items-center gap-3 px-4 lg:px-6 py-2.5 max-w-[1280px] mx-auto w-full">
                {/* Spacer for the mobile hamburger trigger that's fixed top-left */}
                <div className="lg:hidden w-10" aria-hidden />
                <div className="flex-1" />
                <CommandPalette />
                <ThemeSwitcher />
              </div>
            </header>
            <main className="flex-1">
              <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-8 w-full">
                {children}
              </div>
            </main>
          </div>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
