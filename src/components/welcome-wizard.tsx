"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "llm" | "apify" | "profile" | "done";

interface Props {
  initialFullName: string;
  initialEmail: string;
  initialLocation: string;
}

export function WelcomeWizard({ initialFullName, initialEmail, initialLocation }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("llm");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Step 1
  const [llmProvider, setLlmProvider] = useState<"claude" | "gemini">("claude");
  const [llmKey, setLlmKey] = useState("");

  // Step 2
  const [apifyToken, setApifyToken] = useState("");
  const [glassdoorActorId, setGlassdoorActorId] = useState("");

  // Step 3
  const [fullName, setFullName] = useState(initialFullName);
  const [email, setEmail] = useState(initialEmail);
  const [location, setLocation] = useState(initialLocation);

  async function setRuntimeKey(key: string, value: string) {
    const res = await fetch("/api/settings/runtime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
  }

  async function saveLlm() {
    setErr(null);
    if (!llmKey.trim()) {
      setErr("Paste your API key, or use Skip if you'll set it later.");
      return;
    }
    setBusy(true);
    try {
      const envKey = llmProvider === "claude" ? "ANTHROPIC_API_KEY" : "GEMINI_API_KEY";
      await setRuntimeKey(envKey, llmKey.trim());
      await setRuntimeKey("DEFAULT_LLM_PROVIDER", llmProvider);
      setStep("apify");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveApify() {
    setErr(null);
    setBusy(true);
    try {
      if (apifyToken.trim()) await setRuntimeKey("APIFY_API_TOKEN", apifyToken.trim());
      if (glassdoorActorId.trim())
        await setRuntimeKey("APIFY_GLASSDOOR_ACTOR_ID", glassdoorActorId.trim());
      setStep("profile");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, location }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(
          typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
        );
      }
      setStep("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function StepHeader({ n, label }: { n: number; label: string }) {
    return (
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-[var(--accent)] font-mono text-[12px]">{`step ${n}/3`}</span>
        <h2 className="text-[20px] font-semibold tracking-tight">{label}</h2>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <section className="rise" data-delay="1">
        <div className="section-label mb-2">welcome</div>
        <h1 className="page-title">First run</h1>
        <p className="subtitle mt-2">
          Three quick steps to get RoleHunter working. All values are stored in the database
          so the container is fully configured. You can change anything later from{" "}
          <code className="font-mono text-[11px]">/settings</code>.
        </p>
      </section>

      {err && (
        <div
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          {err}
        </div>
      )}

      {step === "llm" && (
        <section className="card p-5 space-y-4 rise" data-delay="2">
          <StepHeader n={1} label="Pick an LLM provider" />
          <p className="text-[13px] text-[var(--fg-3)]">
            RoleHunter scores jobs, rewrites CV sections, and drafts cover letters via an LLM
            of your choice. Claude and Gemini both have free tiers — Claude tends to be sharper
            for structured output.
          </p>
          <div className="flex gap-2">
            {(["claude", "gemini"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setLlmProvider(p)}
                className={`px-3 py-2 text-sm rounded-md border transition-colors ${
                  llmProvider === p
                    ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--fg)]"
                    : "border-[var(--border)] text-[var(--fg-3)] hover:text-[var(--fg-2)]"
                }`}
              >
                {p === "claude" ? "Claude (Anthropic)" : "Gemini (Google)"}
              </button>
            ))}
          </div>
          <div>
            <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
              {llmProvider === "claude" ? "Anthropic API key" : "Gemini API key"}
            </label>
            <input
              type="password"
              value={llmKey}
              onChange={(e) => setLlmKey(e.target.value)}
              placeholder={llmProvider === "claude" ? "sk-ant-api03-…" : "AIza…"}
              className="input w-full mt-1 font-mono text-sm"
              autoFocus
            />
            <div className="text-[10px] text-[var(--fg-4)] mt-1">
              Get one at{" "}
              <a
                href={
                  llmProvider === "claude"
                    ? "https://console.anthropic.com"
                    : "https://aistudio.google.com/apikey"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                {llmProvider === "claude" ? "console.anthropic.com" : "aistudio.google.com/apikey"}
              </a>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep("apify")}
              className="btn btn-ghost text-sm"
            >
              Skip — set later
            </button>
            <button
              type="button"
              onClick={saveLlm}
              disabled={busy}
              className="btn btn-primary text-sm"
            >
              {busy ? "Saving…" : "Save & next"}
            </button>
          </div>
        </section>
      )}

      {step === "apify" && (
        <section className="card p-5 space-y-4 rise" data-delay="2">
          <StepHeader n={2} label="Optional: Apify for LinkedIn + Glassdoor" />
          <p className="text-[13px] text-[var(--fg-3)]">
            Apify runs on-demand scrapers for LinkedIn jobs and Glassdoor reviews. Has a
            free credit each month — typical usage costs a few cents. Skip if you'd rather
            stick to free job sources (JSearch, Adzuna, Greenhouse, Lever, Workday).
          </p>
          <div>
            <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
              Apify API token
            </label>
            <input
              type="password"
              value={apifyToken}
              onChange={(e) => setApifyToken(e.target.value)}
              placeholder="apify_api_…"
              className="input w-full mt-1 font-mono text-sm"
            />
            <div className="text-[10px] text-[var(--fg-4)] mt-1">
              Get one at{" "}
              <a
                href="https://console.apify.com/account#/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                console.apify.com
              </a>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
              Glassdoor scraper actor ID (optional)
            </label>
            <input
              value={glassdoorActorId}
              onChange={(e) => setGlassdoorActorId(e.target.value)}
              placeholder="username~glassdoor-scraper"
              className="input w-full mt-1 font-mono text-sm"
            />
            <div className="text-[10px] text-[var(--fg-4)] mt-1">
              Pick a scraper at{" "}
              <a
                href="https://apify.com/store?search=glassdoor"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent)] hover:underline"
              >
                apify.com/store?search=glassdoor
              </a>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep("llm")}
              className="btn btn-ghost text-sm"
            >
              Back
            </button>
            <button
              type="button"
              onClick={saveApify}
              disabled={busy}
              className="btn btn-primary text-sm"
            >
              {busy ? "Saving…" : apifyToken || glassdoorActorId ? "Save & next" : "Skip"}
            </button>
          </div>
        </section>
      )}

      {step === "profile" && (
        <section className="card p-5 space-y-4 rise" data-delay="2">
          <StepHeader n={3} label="Your basics" />
          <p className="text-[13px] text-[var(--fg-3)]">
            Used for cover-letter signatures and application tracking. You can add more
            (home address, LinkedIn, photo, etc.) on{" "}
            <code className="font-mono text-[11px]">/profile</code> later.
          </p>
          <div>
            <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
              Full name
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input w-full mt-1"
              autoFocus
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input w-full mt-1"
            />
          </div>
          <div>
            <label className="text-[11px] text-[var(--fg-3)] uppercase tracking-wider">
              Location
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="London, UK"
              className="input w-full mt-1"
            />
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep("apify")}
              className="btn btn-ghost text-sm"
            >
              Back
            </button>
            <button
              type="button"
              onClick={saveProfile}
              disabled={busy}
              className="btn btn-primary text-sm"
            >
              {busy ? "Saving…" : "Save & finish"}
            </button>
          </div>
        </section>
      )}

      {step === "done" && (
        <section className="card p-6 space-y-4 text-center rise" data-delay="2">
          <div className="text-[24px]">All set.</div>
          <p className="text-[13px] text-[var(--fg-3)] max-w-md mx-auto">
            One last thing — the API keys you just saved are in the database. The running
            container won't pick them up until the next restart. Run:
          </p>
          <pre className="text-[12px] font-mono bg-[var(--bg-elev)] border border-[var(--border)] rounded-md p-3 text-left inline-block">
docker compose restart app
          </pre>
          <p className="text-[12px] text-[var(--fg-3)]">
            …then head to /jobs or /search to start hunting.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                router.push("/");
                router.refresh();
              }}
              className="btn btn-primary text-sm"
            >
              Go to dashboard
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
