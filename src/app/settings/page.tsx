import Link from "next/link";
import { getDiagnostics } from "@/lib/settings/diagnostics";
import type { CheckRow } from "@/lib/settings/diagnostics";
import { listSettingStates } from "@/lib/settings/runtime";
import { SettingsEditor } from "@/components/settings-editor";

export const dynamic = "force-dynamic";

function StatusDot({ status }: { status: "ok" | "warn" | "missing" }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{
        background:
          status === "ok"
            ? "var(--ok)"
            : status === "warn"
              ? "var(--warn)"
              : "var(--danger)",
      }}
      aria-label={status}
    />
  );
}

function CheckList({ rows }: { rows: CheckRow[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md overflow-hidden">
      {rows.map((r) => (
        <li key={r.key} className="px-4 py-3 bg-[var(--bg-elev)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <StatusDot status={r.status} />
                <span className="font-medium text-[14px]">{r.label}</span>
                {r.detail && (
                  <span className="text-[11px] text-[var(--fg-3)] font-mono">{r.detail}</span>
                )}
              </div>
              <div className="mt-0.5 text-[12px] text-[var(--fg-3)]">{r.description}</div>
              {r.envVars.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.envVars.map((v) => (
                    <code
                      key={v}
                      className="text-[10px] font-mono bg-[var(--bg-elev-2)] border border-[var(--border)] rounded px-1 py-0.5"
                    >
                      {v}
                    </code>
                  ))}
                </div>
              )}
            </div>
            <span
              className="text-[10px] uppercase tracking-wider font-mono shrink-0"
              style={{
                color:
                  r.status === "ok"
                    ? "var(--ok)"
                    : r.status === "warn"
                      ? "var(--warn)"
                      : "var(--fg-4)",
              }}
            >
              {r.status === "ok" ? "configured" : r.status === "warn" ? "partial" : "not set"}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function SettingsPage() {
  const [d, settingStates] = await Promise.all([getDiagnostics(), listSettingStates()]);

  return (
    <div className="space-y-10">
      <section className="rise" data-delay="1">
        <div className="section-label mb-2">vol. iii · setup</div>
        <h1 className="page-title">Settings</h1>
        <p className="subtitle mt-2">
          Configure RoleHunter without touching <code className="font-mono text-[11px]">.env</code>.
          Values you set here are stored in the database and survive container restarts.
          Need to re-run setup?{" "}
          <Link href="/welcome?force=1" className="text-[var(--accent)] hover:underline">
            Open the first-run wizard →
          </Link>
        </p>
      </section>

      <section className="rise space-y-3" data-delay="2">
        <h2 className="text-lg font-semibold tracking-tight">Runtime settings</h2>
        <p className="text-[12px] text-[var(--fg-3)]">
          API keys + provider routing. Secrets are masked on display. Saved values take
          effect on the next <code className="font-mono">docker compose restart app</code>.
        </p>
        <SettingsEditor initialStates={settingStates} />
      </section>

      <section className="rise" data-delay="2 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Profile &amp; CV</h2>
          <Link
            href="/profile"
            className="text-[12px] text-[var(--accent)] hover:underline"
          >
            Edit profile →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="card p-4 space-y-1">
            <div className="section-label">Profile</div>
            <dl className="text-sm space-y-1 mt-2">
              <Field label="Full name" value={d.profile.fullName} />
              <Field label="Email" value={d.profile.email} />
              <Field label="Location" value={d.profile.location} />
              <Field
                label="LinkedIn"
                value={d.profile.hasLinkedinUrl ? "linked" : null}
              />
            </dl>
          </div>
          <div className="card p-4 space-y-1">
            <div className="flex items-center justify-between">
              <div className="section-label">Active CV</div>
              <Link href="/cv" className="text-[11px] text-[var(--accent)] hover:underline">
                Open workshop →
              </Link>
            </div>
            <dl className="text-sm space-y-1 mt-2">
              <Field label="Title" value={d.profile.activeCvTitle} />
              <Field label="Upload dir" value={d.uploadDir} mono />
            </dl>
          </div>
        </div>
      </section>

      <section className="rise space-y-3" data-delay="3">
        <h2 className="text-lg font-semibold tracking-tight">Job sources</h2>
        <p className="text-[12px] text-[var(--fg-3)]">
          Each adapter is independent — missing keys just skip that source instead of breaking the
          fan-out.
        </p>
        <CheckList rows={d.jobSources} />
      </section>

      <section className="rise space-y-3" data-delay="4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">LLM providers</h2>
          <div className="text-[11px] text-[var(--fg-3)] font-mono">
            default: <span className="text-[var(--accent)]">{d.llmProviders.defaultProvider}</span>
          </div>
        </div>
        <CheckList rows={d.llmProviders.rows} />

        <div className="card p-4 space-y-2">
          <div className="section-label">Per-task routing</div>
          <p className="text-[11px] text-[var(--fg-3)]">
            Each task can pin to a specific provider via env. Empty = falls back to the default
            above.
          </p>
          <table className="w-full text-xs mt-2">
            <thead className="text-[10px] uppercase tracking-wider text-[var(--fg-4)]">
              <tr>
                <th className="text-left font-normal pb-1">Task</th>
                <th className="text-left font-normal pb-1">Env var</th>
                <th className="text-left font-normal pb-1">Pinned to</th>
              </tr>
            </thead>
            <tbody>
              {d.llmProviders.perTask.map((t) => (
                <tr key={t.task} className="border-t border-[var(--border)]">
                  <td className="py-1.5 font-mono">{t.task}</td>
                  <td className="py-1.5 font-mono text-[var(--fg-3)]">{t.envVar}</td>
                  <td className="py-1.5 font-mono">
                    {t.resolvedFromEnv ? (
                      <span className="text-[var(--accent)]">{t.resolvedFromEnv}</span>
                    ) : (
                      <span className="text-[var(--fg-4)]">(default)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rise space-y-3" data-delay="5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Portfolio import</h2>
          <Link
            href="/portfolio"
            className="text-[12px] text-[var(--accent)] hover:underline"
          >
            Manage portfolio →
          </Link>
        </div>
        <p className="text-[12px] text-[var(--fg-3)]">
          {d.portfolioSourceCount} source{d.portfolioSourceCount === 1 ? "" : "s"} currently
          connected. Use the Portfolio page to sync GitHub or GitLab, or add manual entries.
        </p>
        <CheckList rows={d.portfolio} />
      </section>

      <section className="rise space-y-3" data-delay="5">
        <h2 className="text-lg font-semibold tracking-tight">Company intel (v3.2)</h2>
        <p className="text-[12px] text-[var(--fg-3)]">
          Sources used by the "Should you work here?" panel on every job. Free sources
          (Wikidata, Nominatim, Clearbit) always run; Glassdoor needs an Apify actor id
          you set in env.
        </p>
        <CheckList rows={d.companyIntel} />
      </section>

      <section className="rise space-y-3" data-delay="6">
        <h2 className="text-lg font-semibold tracking-tight">Automation</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="card p-4">
            <div className="flex items-center gap-2">
              <StatusDot status={d.scheduler.enabled ? "ok" : "missing"} />
              <span className="font-medium text-sm">Scheduler</span>
            </div>
            <dl className="text-xs mt-2 space-y-1">
              <Field
                label="Status"
                value={d.scheduler.enabled ? "running" : "disabled"}
                mono
              />
              <Field label="Batch size" value={String(d.scheduler.batchSize)} mono />
              <Field label="Saved searches" value={String(d.scheduler.sources)} mono />
            </dl>
            <div className="mt-2 text-[10px] text-[var(--fg-4)]">
              Set <code className="font-mono">ENABLE_SCHEDULER=1</code> in env to start.
            </div>
            <Link
              href="/search"
              className="block mt-3 text-[12px] text-[var(--accent)] hover:underline"
            >
              Manage saved searches →
            </Link>
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2">
              <StatusDot status={d.budgets.apifyConfigured ? "ok" : "missing"} />
              <span className="font-medium text-sm">Apify budget</span>
            </div>
            <dl className="text-xs mt-2 space-y-1">
              <Field
                label="Monthly cap"
                value={`$${d.budgets.apifyMonthlyCapUsd}`}
                mono
              />
              <Field
                label="Configured"
                value={d.budgets.apifyConfigured ? "yes" : "no"}
                mono
              />
            </dl>
            <Link
              href="/api/admin/budgets"
              className="block mt-3 text-[12px] text-[var(--accent)] hover:underline"
            >
              Current spend (JSON) →
            </Link>
          </div>
        </div>
      </section>

      <section className="text-[11px] text-[var(--fg-4)] font-mono pt-6 border-t border-[var(--border)]">
        Settings are sourced from <code>.env</code>. Restart the dev server (or container) after
        changing env vars for them to take effect here.
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[10px] uppercase tracking-wider text-[var(--fg-4)]">{label}</dt>
      <dd
        className={`text-[12px] truncate ${mono ? "font-mono" : ""}`}
        style={{ color: value ? "var(--fg-2)" : "var(--fg-4)" }}
      >
        {value ?? "not set"}
      </dd>
    </div>
  );
}
