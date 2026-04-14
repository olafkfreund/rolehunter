"use client";

import { useMemo, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Plus } from "lucide-react";
import { ProviderToggle } from "@/components/provider-toggle";
import type { LinkedinScan, Profile } from "@/lib/db/schema";
import type { Provider } from "@/lib/llm/types";

const input =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const label = "text-sm font-medium";

function scoreColor(score: number): { fg: string; bg: string; label: string } {
  if (score >= 80) return { fg: "var(--success)", bg: "var(--success)", label: "Strong" };
  if (score >= 60) return { fg: "var(--warning)", bg: "var(--warning)", label: "Okay" };
  return { fg: "var(--danger)", bg: "var(--danger)", label: "Weak" };
}

function ScoreGauge({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  const { fg, label: tier } = scoreColor(s);
  const r = 54;
  const c = 2 * Math.PI * r;
  const off = c - (s / 100) * c;
  return (
    <div className="flex items-center gap-4">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={fg}
          strokeWidth="12"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
        <text
          x="70"
          y="76"
          textAnchor="middle"
          fontSize="32"
          fontWeight="700"
          fill="var(--foreground)"
        >
          {s}
        </text>
      </svg>
      <div>
        <div className="text-sm text-[var(--muted-foreground)]">Score</div>
        <div className="text-lg font-semibold" style={{ color: fg }}>
          {tier}
        </div>
      </div>
    </div>
  );
}

function CopyBox({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--muted)]"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-md bg-[var(--muted)]/40 p-3 text-sm">
        {text}
      </pre>
    </div>
  );
}

function KeywordChips({ coverage }: { coverage: Record<string, boolean> }) {
  const entries = Object.entries(coverage);
  if (entries.length === 0) {
    return <div className="text-sm text-[var(--muted-foreground)]">No keywords returned.</div>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {entries.map(([kw, present]) => (
        <span
          key={kw}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            present
              ? "border border-[var(--success)]/40 bg-[var(--success)]/15 text-[var(--success)]"
              : "border border-[var(--border)] bg-[var(--muted)]/40 text-[var(--muted-foreground)]"
          }`}
        >
          {present ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {kw}
        </span>
      ))}
    </div>
  );
}

export function LinkedinScanner({
  profile,
  recent,
}: {
  profile: Profile;
  recent: LinkedinScan[];
}) {
  const [headline, setHeadline] = useState(profile.linkedinHeadline ?? "");
  const [about, setAbout] = useState(profile.linkedinAbout ?? "");
  const [targetRole, setTargetRole] = useState("");
  const [provider, setProvider] = useState<Provider>("claude");
  const [scan, setScan] = useState<LinkedinScan | null>(null);
  const [scans, setScans] = useState<LinkedinScan[]>(recent);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const coverage = useMemo<Record<string, boolean>>(() => {
    if (!scan) return {};
    const raw = scan.keywordCoverage as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return Object.fromEntries(
        Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, Boolean(v)]),
      );
    }
    return {};
  }, [scan]);

  function loadScan(s: LinkedinScan) {
    setScan(s);
    setTargetRole(s.targetRole);
    setProvider(s.provider);
    if (s.rewrittenHeadline) setHeadline(s.rewrittenHeadline);
    if (s.rewrittenAbout) setAbout(s.rewrittenAbout);
  }

  function onScan() {
    setError(null);
    if (!targetRole.trim()) {
      setError("Target role is required.");
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/linkedin/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: targetRole.trim(),
          provider,
          headline: headline.trim() ? headline : undefined,
          about: about.trim() ? about : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Scan failed.");
        return;
      }
      const row = json as unknown as LinkedinScan;
      setScan(row);
      setScans((prev) => [row, ...prev].slice(0, 10));
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        <section className="space-y-4 rounded-lg border border-[var(--border)] p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <div className={label}>Target role</div>
              <input
                className={input}
                placeholder="e.g. Senior DevOps Engineer"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <ProviderToggle value={provider} onChange={setProvider} disabled={pending} />
              <button
                onClick={onScan}
                disabled={pending}
                className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-50"
              >
                {pending ? "Scanning…" : "Scan"}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className={label}>Current headline</div>
            <textarea
              className={`${input} h-20 resize-y ${!headline ? "italic text-[var(--muted-foreground)]" : ""}`}
              placeholder="Paste your LinkedIn headline…"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className={label}>Current about</div>
            <textarea
              className={`${input} h-40 resize-y ${!about ? "italic text-[var(--muted-foreground)]" : ""}`}
              placeholder="Paste your LinkedIn about section…"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
          </div>

          {error && <div className="text-sm text-[var(--danger)]">{error}</div>}
        </section>

        {scan && (
          <section className="space-y-5 rounded-lg border border-[var(--border)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ScoreGauge score={scan.score} />
              <div className="text-right text-xs text-[var(--muted-foreground)]">
                <div>
                  Target: <span className="font-medium text-[var(--foreground)]">{scan.targetRole}</span>
                </div>
                <div>Provider: {scan.provider}</div>
                <div>{new Date(scan.createdAt).toLocaleString()}</div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Keyword coverage</h3>
              <KeywordChips coverage={coverage} />
            </div>

            {scan.suggestionsMd && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Suggestions</h3>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{scan.suggestionsMd}</ReactMarkdown>
                </div>
              </div>
            )}

            {(scan.rewrittenHeadline || scan.rewrittenAbout) && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {scan.rewrittenHeadline && (
                  <CopyBox title="Rewritten headline" text={scan.rewrittenHeadline} />
                )}
                {scan.rewrittenAbout && (
                  <CopyBox title="Rewritten about" text={scan.rewrittenAbout} />
                )}
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="space-y-3">
        <h3 className="text-sm font-semibold">Recent scans</h3>
        {scans.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No scans yet.</p>
        ) : (
          <ul className="space-y-2">
            {scans.map((s) => {
              const { fg } = scoreColor(s.score);
              return (
                <li key={s.id}>
                  <button
                    onClick={() => loadScan(s)}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-2.5 text-left text-sm transition-colors hover:bg-[var(--muted)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{s.targetRole}</span>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ color: fg, border: `1px solid ${fg}` }}
                      >
                        {s.score}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                      <span>{s.provider}</span>
                      <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
