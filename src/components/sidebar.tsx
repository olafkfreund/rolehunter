"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  SearchCheck,
  FileText,
  Send,
  Calendar,
  AlertTriangle,
  User,
  FolderGit2,
  Building2,
  Settings as SettingsIcon,
  FileType,
  Linkedin,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string; size?: number }>;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    label: "Hunt",
    items: [
      { href: "/", label: "Dashboard", Icon: LayoutDashboard },
      { href: "/jobs", label: "Jobs", Icon: Briefcase },
      { href: "/search", label: "Searches", Icon: SearchCheck },
    ],
  },
  {
    label: "Apply",
    items: [
      { href: "/applications", label: "Applications", Icon: Send },
      { href: "/interviews", label: "Interviews", Icon: Calendar },
      { href: "/gaps", label: "Gaps", Icon: AlertTriangle },
    ],
  },
  {
    label: "You",
    items: [
      { href: "/cv", label: "CV", Icon: FileText },
      { href: "/profile", label: "Profile", Icon: User },
      { href: "/portfolio", label: "Portfolio", Icon: FolderGit2 },
      { href: "/companies", label: "Companies", Icon: Building2 },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/settings", label: "Settings", Icon: SettingsIcon },
      { href: "/templates", label: "Templates", Icon: FileType },
      { href: "/linkedin-seo", label: "LinkedIn SEO", Icon: Linkedin },
    ],
  },
];

const STORAGE_KEY = "rh-sidebar-collapsed";

export function Sidebar() {
  const pathname = usePathname() || "/";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") setCollapsed(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed, hydrated]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      {/* Mobile hamburger trigger — visible only on small screens */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 rounded-md border border-[var(--border)] bg-[var(--bg)] p-2 hover:bg-[var(--bg-elev)]"
        aria-label="Open navigation"
      >
        <PanelLeftOpen size={16} />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`
          ${collapsed ? "lg:w-[60px]" : "lg:w-[200px]"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          fixed lg:sticky top-0 left-0 z-50 lg:z-30
          h-screen lg:h-[100dvh] shrink-0
          w-[230px]
          bg-[var(--bg)] lg:bg-[var(--bg)]/95 lg:backdrop-blur-md
          border-r border-[var(--border)]
          flex flex-col
          transition-[width,transform] duration-200 ease-out
        `}
      >
        {/* Wordmark */}
        <div className="px-3 py-4 border-b border-[var(--border)] flex items-center gap-2">
          <Link
            href="/"
            className="flex items-baseline gap-1 group min-w-0 flex-1"
            title="RoleHunter v3"
          >
            <span className="text-[16px] font-medium tracking-tight shrink-0">role</span>
            {!collapsed && (
              <>
                <span
                  className="text-[16px] italic font-medium truncate"
                  style={{ fontFamily: "var(--font-serif)", color: "var(--accent)" }}
                >
                  hunter
                </span>
                <span className="ml-1 text-[9px] text-[var(--fg-3)] tracking-[0.15em] uppercase font-mono shrink-0">
                  v3
                </span>
              </>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="hidden lg:inline-flex shrink-0 rounded p-1 text-[var(--fg-3)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev)]"
              aria-label="Collapse sidebar"
              title="Collapse"
            >
              <PanelLeftClose size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden rounded p-1 text-[var(--fg-3)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev)]"
            aria-label="Close navigation"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        {/* Sections */}
        <nav className="flex-1 overflow-y-auto py-2">
          {sections.map((section) => (
            <div key={section.label} className="px-2 py-2">
              {!collapsed && (
                <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.15em] text-[var(--fg-4)] font-mono">
                  {section.label}
                </div>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={`
                          group flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[13px]
                          transition-colors
                          ${
                            active
                              ? "bg-[var(--bg-elev-2)] text-[var(--fg)] font-medium"
                              : "text-[var(--fg-2)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev)]"
                          }
                        `}
                      >
                        <item.Icon
                          size={15}
                          className={`shrink-0 ${
                            active ? "text-[var(--accent)]" : "text-[var(--fg-3)]"
                          }`}
                        />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {active && !collapsed && (
                          <span
                            className="ml-auto text-[var(--accent)] text-[10px] font-mono"
                            aria-hidden
                          >
                            ●
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Expand control when collapsed */}
        {collapsed && (
          <div className="hidden lg:block p-2 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="w-full flex items-center justify-center rounded-md p-2 text-[var(--fg-3)] hover:text-[var(--fg)] hover:bg-[var(--bg-elev)]"
              aria-label="Expand sidebar"
              title="Expand"
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        )}

        {/* Footer */}
        {!collapsed && (
          <div className="px-3 py-3 border-t border-[var(--border)] text-[10px] font-mono uppercase tracking-wider text-[var(--fg-4)]">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--ok)" }}
              />
              <span>live</span>
            </div>
            <div className="mt-1 text-[9px] text-[var(--fg-4)]">self-hosted · 11 sources</div>
          </div>
        )}
      </aside>
    </>
  );
}
