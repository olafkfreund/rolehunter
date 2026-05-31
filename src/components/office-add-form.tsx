"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  companyId: number;
}

export function OfficeAddForm({ companyId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!address.trim()) {
      setErr("Address is required");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/offices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, address }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setLabel("");
      setAddress("");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost text-xs"
      >
        + Add office
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="card p-3 space-y-2 max-w-md mt-2 inline-block"
    >
      <div className="grid sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--fg-3)]">
            Label
          </label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="London"
            className="input w-full mt-1 text-sm"
            autoFocus
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-[var(--fg-3)]">
            Address
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Canary Wharf, London E14"
            className="input w-full mt-1 font-mono text-sm"
            required
          />
        </div>
      </div>
      {err && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {err}
        </div>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary text-xs">
          {busy ? "Geocoding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setErr(null);
          }}
          className="btn btn-ghost text-xs"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
