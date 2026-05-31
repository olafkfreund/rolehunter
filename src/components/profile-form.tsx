"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/db/schema";
import type { Provider } from "@/lib/llm/types";
import { ProviderToggle } from "./provider-toggle";
import { CulturePrefs } from "./culture-prefs";
import { CULTURE_KEYWORDS } from "@/lib/jobs/fit-score";

const input =
  "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
const label = "text-sm font-medium";
const field = "space-y-1.5";

export function ProfileForm({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [state, setState] = useState<Profile>(initial);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [liBusy, setLiBusy] = useState(false);
  const [liErr, setLiErr] = useState<string | null>(null);
  const [liMsg, setLiMsg] = useState<string | null>(null);
  const [liProvider, setLiProvider] = useState<Provider>("claude");
  const [liAlsoCv, setLiAlsoCv] = useState(true);

  async function onLinkedInImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLiBusy(true);
    setLiErr(null);
    setLiMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("provider", liProvider);
      fd.append("alsoCreateCv", liAlsoCv ? "true" : "false");
      const res = await fetch("/api/linkedin/import-pdf", { method: "POST", body: fd });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(json?.error?.toString?.() ?? `import failed (${res.status})`);
      if (json?.profile) setState(json.profile as Profile);
      setLiMsg(
        json?.cvId
          ? `Imported. New CV saved as active (id ${json.cvId}).`
          : "Imported. Profile fields populated.",
      );
      router.refresh();
    } catch (err) {
      setLiErr(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLiBusy(false);
    }
  }

  function set<K extends keyof Profile>(k: K, v: Profile[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", "avatar");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { path?: string; error?: string };
      if (!res.ok || !json.path) throw new Error(json.error ?? "upload failed");
      set("avatarPath", json.path);
    } catch (err) {
      console.error(err);
      alert("Avatar upload failed");
    } finally {
      setAvatarBusy(false);
    }
  }

  function onSave() {
    setStatus("idle");
    startTransition(async () => {
      const { id: _id, updatedAt: _u, ...payload } = state;
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setStatus(res.ok ? "saved" : "error");
    });
  }

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-4">
        <div className="h-20 w-20 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--muted)]">
          {state.avatarPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/uploads/${state.avatarPath}`}
              alt="Profile"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-[var(--muted-foreground)]">
              no photo
            </div>
          )}
        </div>
        <label className="cursor-pointer rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]">
          {avatarBusy ? "Uploading…" : "Upload photo"}
          <input type="file" accept="image/*" className="hidden" onChange={onAvatar} />
        </label>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={field}>
          <div className={label}>Full name</div>
          <input
            className={input}
            value={state.fullName ?? ""}
            onChange={(e) => set("fullName", e.target.value)}
          />
        </div>
        <div className={field}>
          <div className={label}>Email</div>
          <input
            className={input}
            type="email"
            value={state.email ?? ""}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div className={field}>
          <div className={label}>Phone</div>
          <input
            className={input}
            value={state.phone ?? ""}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div className={field}>
          <div className={label}>Location</div>
          <input
            className={input}
            value={state.location ?? ""}
            onChange={(e) => set("location", e.target.value)}
          />
        </div>
      </section>

      <section className={field}>
        <div className={label}>Summary</div>
        <textarea
          className={`${input} h-24 resize-y`}
          value={state.summary ?? ""}
          onChange={(e) => set("summary", e.target.value)}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-[var(--border)] p-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-semibold">Home address</h3>
          <span className="text-[11px] text-[var(--muted-foreground)] font-mono">
            for commute calculations
          </span>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Geocoded on save via OpenStreetMap (free, no key). Used to show distance to each
          company's headquarters on job pages. Google Maps commute time / cost arrives in a
          follow-up.
        </p>
        <div className={field}>
          <div className={label}>Address</div>
          <input
            className={input}
            placeholder="221B Baker Street, London NW1 6XE, UK"
            value={(state as { homeAddress?: string | null }).homeAddress ?? ""}
            onChange={(e) =>
              set("homeAddress" as keyof typeof state, e.target.value as never)
            }
          />
        </div>
        {(state as { homeLat?: number | null }).homeLat != null &&
          (state as { homeLng?: number | null }).homeLng != null && (
            <div className="text-[11px] font-mono text-[var(--muted-foreground)]">
              geocoded:{" "}
              {(state as { homeLat?: number | null }).homeLat?.toFixed(4)},{" "}
              {(state as { homeLng?: number | null }).homeLng?.toFixed(4)}
            </div>
          )}
      </section>

      <section className="space-y-3 rounded-lg border border-[var(--border)] p-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-semibold">Compensation target</h3>
          <span className="text-[11px] text-[var(--muted-foreground)] font-mono">
            powers role-fit Compensation scoring
          </span>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Used to score every job's posted salary band against your target on the role-fit
          dashboard. Leave empty if you'd rather just see what each role posts.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className={field}>
            <div className={label}>Min</div>
            <input
              type="number"
              min={0}
              className={input}
              placeholder="80000"
              value={(state as { salaryTargetMin?: number | null }).salaryTargetMin ?? ""}
              onChange={(e) =>
                set(
                  "salaryTargetMin" as keyof typeof state,
                  (e.target.value === "" ? null : Number(e.target.value)) as never,
                )
              }
            />
          </div>
          <div className={field}>
            <div className={label}>Max</div>
            <input
              type="number"
              min={0}
              className={input}
              placeholder="120000"
              value={(state as { salaryTargetMax?: number | null }).salaryTargetMax ?? ""}
              onChange={(e) =>
                set(
                  "salaryTargetMax" as keyof typeof state,
                  (e.target.value === "" ? null : Number(e.target.value)) as never,
                )
              }
            />
          </div>
          <div className={field}>
            <div className={label}>Currency</div>
            <input
              className={input}
              placeholder="GBP"
              maxLength={8}
              value={
                (state as { salaryTargetCurrency?: string | null }).salaryTargetCurrency ?? ""
              }
              onChange={(e) =>
                set(
                  "salaryTargetCurrency" as keyof typeof state,
                  e.target.value.toUpperCase() as never,
                )
              }
            />
          </div>
          <div className={field}>
            <div className={label}>Period</div>
            <select
              className={input}
              value={
                (state as { salaryTargetPeriod?: string | null }).salaryTargetPeriod ?? "annual"
              }
              onChange={(e) =>
                set("salaryTargetPeriod" as keyof typeof state, e.target.value as never)
              }
            >
              <option value="annual">annual</option>
              <option value="monthly">monthly</option>
              <option value="daily">daily</option>
              <option value="hourly">hourly</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-[var(--border)] p-4">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-semibold">Culture preferences</h3>
          <span className="text-[11px] text-[var(--muted-foreground)] font-mono">
            powers role-fit Culture scoring
          </span>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Tell RoleHunter what you want, what you'd rather avoid, and your preferred work
          mode. Roles get scored against your taste rather than a generic baseline.
        </p>
        <CulturePrefs
          keywords={CULTURE_KEYWORDS.map((c) => ({
            key: c.key,
            label: c.label,
            positive: c.positive,
          }))}
          initialLikes={
            Array.isArray((state as { cultureLikes?: unknown }).cultureLikes)
              ? ((state as { cultureLikes: string[] }).cultureLikes ?? [])
              : []
          }
          initialAvoids={
            Array.isArray((state as { cultureAvoids?: unknown }).cultureAvoids)
              ? ((state as { cultureAvoids: string[] }).cultureAvoids ?? [])
              : []
          }
          initialWorkMode={
            ((state as { workModePreference?: string | null }).workModePreference as
              | "remote"
              | "hybrid"
              | "onsite"
              | "any"
              | null) ?? "any"
          }
          initialMaxOfficeDays={
            (state as { maxOfficeDaysPerWeek?: number | null }).maxOfficeDaysPerWeek ?? null
          }
          onChange={useCallback(
            (s: {
              cultureLikes: string[];
              cultureAvoids: string[];
              workModePreference: "remote" | "hybrid" | "onsite" | "any";
              maxOfficeDaysPerWeek: number | null;
            }) => {
              setState((prev) => ({
                ...prev,
                cultureLikes: s.cultureLikes as never,
                cultureAvoids: s.cultureAvoids as never,
                workModePreference: s.workModePreference as never,
                maxOfficeDaysPerWeek: s.maxOfficeDaysPerWeek as never,
              }));
            },
            [],
          )}
        />
      </section>

      <section className="space-y-4 rounded-lg border border-[var(--border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">LinkedIn</h3>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
              <input
                type="checkbox"
                checked={liAlsoCv}
                onChange={(e) => setLiAlsoCv(e.target.checked)}
              />
              Also save as new active CV
            </label>
            <ProviderToggle value={liProvider} onChange={setLiProvider} disabled={liBusy} />
            <label className="cursor-pointer rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-sm hover:bg-[var(--muted)]">
              {liBusy ? "Importing…" : "Import from LinkedIn PDF"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={onLinkedInImport}
                disabled={liBusy}
              />
            </label>
          </div>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          On linkedin.com, open your profile → <strong>More</strong> → <strong>Save to PDF</strong> → upload it here.
          Claude or Gemini will parse name, headline, About, experience, skills, and education.
        </p>
        {liErr && <div className="text-sm text-[var(--danger)]">{liErr}</div>}
        {liMsg && <div className="text-sm text-[var(--success)]">{liMsg}</div>}
        <div className={field}>
          <div className={label}>Profile URL</div>
          <input
            className={input}
            placeholder="https://www.linkedin.com/in/…"
            value={state.linkedinUrl ?? ""}
            onChange={(e) => set("linkedinUrl", e.target.value)}
          />
        </div>
        <div className={field}>
          <div className={label}>Headline</div>
          <input
            className={input}
            value={state.linkedinHeadline ?? ""}
            onChange={(e) => set("linkedinHeadline", e.target.value)}
          />
        </div>
        <div className={field}>
          <div className={label}>About</div>
          <textarea
            className={`${input} h-40 resize-y`}
            value={state.linkedinAbout ?? ""}
            onChange={(e) => set("linkedinAbout", e.target.value)}
          />
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={pending}
          className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {status === "saved" && <span className="text-sm text-[var(--success)]">Saved.</span>}
        {status === "error" && <span className="text-sm text-[var(--danger)]">Save failed.</span>}
      </div>
    </div>
  );
}
