"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Flashcard as FlashcardRow } from "@/lib/db/schema";
import type { FlashcardCategory, Provider } from "@/lib/llm/types";
import { Flashcard } from "./flashcard";
import { ProviderToggle } from "./provider-toggle";

const CATEGORY_ORDER: FlashcardCategory[] = [
  "behavioral",
  "role_specific",
  "company_specific",
  "technical",
];
const CATEGORY_LABELS: Record<FlashcardCategory, string> = {
  behavioral: "Behavioral",
  role_specific: "Role-specific",
  company_specific: "Company-specific",
  technical: "Technical",
};

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function errorFrom(json: unknown, fallback: string): string {
  if (json && typeof json === "object" && "error" in json) {
    const e = (json as { error: unknown }).error;
    if (typeof e === "string") return e;
    if (e && typeof e === "object") return JSON.stringify(e);
  }
  return fallback;
}

export function FlashcardsPanel({ jobId }: { jobId: number }) {
  const [cards, setCards] = useState<FlashcardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("claude");
  const [activeTab, setActiveTab] = useState<FlashcardCategory>("behavioral");
  const [indexByCat, setIndexByCat] = useState<
    Record<FlashcardCategory, number>
  >({
    behavioral: 0,
    role_specific: 0,
    company_specific: 0,
    technical: 0,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/flashcards?jobId=${jobId}`, {
          cache: "no-store",
        });
        const json = await readJson(res);
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(errorFrom(json, "Failed to load flashcards"));
        }
        setCards(Array.isArray(json) ? (json as FlashcardRow[]) : []);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const byCategory = useMemo(() => {
    const map: Record<FlashcardCategory, FlashcardRow[]> = {
      behavioral: [],
      role_specific: [],
      company_specific: [],
      technical: [],
    };
    for (const c of cards) {
      const cat = c.category as FlashcardCategory;
      if (cat in map) {
        map[cat].push(c);
      }
    }
    return map;
  }, [cards]);

  // Pick first non-empty tab when cards load/change.
  useEffect(() => {
    if (cards.length === 0) return;
    if (byCategory[activeTab].length === 0) {
      const firstWithCards = CATEGORY_ORDER.find(
        (c) => byCategory[c].length > 0,
      );
      if (firstWithCards) setActiveTab(firstWithCards);
    }
    // Clamp indices to list length.
    setIndexByCat((prev) => {
      const next = { ...prev };
      for (const cat of CATEGORY_ORDER) {
        const len = byCategory[cat].length;
        if (len === 0) {
          next[cat] = 0;
        } else if (next[cat] >= len) {
          next[cat] = len - 1;
        }
      }
      return next;
    });
  }, [cards, byCategory, activeTab]);

  async function generate(isRegenerate: boolean) {
    if (isRegenerate) {
      if (
        !window.confirm(
          "Regenerate will delete all existing flashcards for this job and create a fresh set. Continue?",
        )
      ) {
        return;
      }
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, provider }),
      });
      const json = await readJson(res);
      if (!res.ok) {
        throw new Error(errorFrom(json, "Generation failed"));
      }
      setCards(Array.isArray(json) ? (json as FlashcardRow[]) : []);
      setIndexByCat({
        behavioral: 0,
        role_specific: 0,
        company_specific: 0,
        technical: 0,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteCard(id: number) {
    const prev = cards;
    setCards((c) => c.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/flashcards/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await readJson(res);
        throw new Error(errorFrom(json, "Delete failed"));
      }
    } catch (e) {
      setCards(prev);
      setErr(e instanceof Error ? e.message : "Delete failed");
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
        <div className="text-sm text-[var(--muted-foreground)]">
          Loading flashcards…
        </div>
      </section>
    );
  }

  if (cards.length === 0) {
    return (
      <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Interview flashcards</h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              AI-generated prep questions with STAR answers tailored to this role.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ProviderToggle
              value={provider}
              onChange={setProvider}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => generate(false)}
              disabled={busy}
              className="rounded-md bg-[var(--foreground)] px-4 py-1.5 text-sm font-medium text-[var(--background)] disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate flashcards"}
            </button>
          </div>
        </div>
        <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
          No flashcards yet. Choose a provider and click “Generate flashcards”.
        </div>
        {err && <div className="text-sm text-[var(--danger)]">{err}</div>}
      </section>
    );
  }

  function setIdx(cat: FlashcardCategory, updater: (n: number) => number) {
    setIndexByCat((prev) => {
      const len = byCategory[cat].length;
      if (len === 0) return prev;
      const raw = updater(prev[cat] ?? 0);
      const clamped = Math.max(0, Math.min(len - 1, raw));
      return { ...prev, [cat]: clamped };
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--background)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Interview flashcards</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            {cards.length} cards across {
              CATEGORY_ORDER.filter((c) => byCategory[c].length > 0).length
            }{" "}
            categories.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProviderToggle
            value={provider}
            onChange={setProvider}
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => generate(true)}
            disabled={busy}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-50"
          >
            {busy ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-[var(--danger)]">{err}</div>}

      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as FlashcardCategory)}
      >
        <Tabs.List className="flex flex-wrap gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)]/40 p-1">
          {CATEGORY_ORDER.map((cat) => {
            const count = byCategory[cat].length;
            return (
              <Tabs.Trigger
                key={cat}
                value={cat}
                disabled={count === 0}
                className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors data-[state=active]:bg-[var(--foreground)] data-[state=active]:text-[var(--background)] hover:text-[var(--foreground)] disabled:opacity-40 disabled:cursor-not-allowed data-[state=active]:hover:text-[var(--background)]"
              >
                {CATEGORY_LABELS[cat]} ({count})
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        {CATEGORY_ORDER.map((cat) => {
          const list = byCategory[cat];
          const idx = Math.min(
            indexByCat[cat],
            Math.max(0, list.length - 1),
          );
          const card = list[idx];

          return (
            <Tabs.Content key={cat} value={cat} className="mt-4 space-y-3">
              {list.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--muted)]/30 p-4 text-sm text-[var(--muted-foreground)]">
                  No cards in this category.
                </div>
              ) : card ? (
                <>
                  <Flashcard
                    question={card.question}
                    answer={card.answer}
                    category={card.category}
                    index={idx + 1}
                    total={list.length}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setIdx(cat, (n) => n - 1)}
                      disabled={idx === 0}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteCard(card.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--danger)]"
                      title="Delete this card"
                      aria-label="Delete this card"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>

                    <button
                      type="button"
                      onClick={() => setIdx(cat, (n) => n + 1)}
                      disabled={idx >= list.length - 1}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--muted)] disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : null}
            </Tabs.Content>
          );
        })}
      </Tabs.Root>

    </section>
  );
}
