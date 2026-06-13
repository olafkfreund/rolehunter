// Bundesagentur für Arbeit (Jobsuche) adapter — Germany's federal employment
// agency. Public REST endpoint, authenticated with a fixed/public client key
// header (no per-user key needed).
//
// List:   /pc/v4/jobs?was={query}&wo={location}&size={n}
// Detail: /pc/v3/jobdetails/{base64(refnr)}  — for the description body
//
// The list endpoint omits descriptions, so each result gets a bounded detail
// fetch (like the SmartRecruiters adapter). See epic #111.

import { classifyAtsError, htmlToText } from "./ats-shared";
import { SourcePermanentError, SourceTransientError } from "./errors";
import type { JobSource, RawJob, RemoteMode, SearchParams } from "./types";

const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
const API_KEY = "jobboerse-jobsuche"; // public client id, not a secret
const HEADERS = { "X-API-Key": API_KEY, Accept: "application/json" };

interface BaArbeitsort {
  ort?: string;
  region?: string;
  land?: string;
}

interface BaAngebot {
  beruf?: string;
  titel?: string;
  refnr?: string;
  arbeitsort?: BaArbeitsort;
  arbeitgeber?: string;
  aktuelleVeroeffentlichungsdatum?: string;
}

interface BaListResponse {
  stellenangebote?: BaAngebot[];
}

interface BaDetail {
  stellenangebotsBeschreibung?: string;
  homeofficemoeglich?: boolean;
}

function locationRaw(a: BaArbeitsort | undefined): string | undefined {
  if (!a) return undefined;
  const parts = [a.ort, a.region, a.land].filter((s): s is string => !!s && s.length > 0);
  return parts.length ? Array.from(new Set(parts)).join(", ") : undefined;
}

export function createBundesagenturAdapter(): JobSource {
  return {
    id: "bundesagentur",
    displayName: "Bundesagentur für Arbeit (DE)",
    available: async () => ({ ok: true }),
    costEstimate: () => 0,
    search: async (params: SearchParams, signal: AbortSignal): Promise<RawJob[]> => {
      try {
        const qs = new URLSearchParams({ size: String(params.maxResults) });
        if (params.query) qs.set("was", params.query);
        if (params.location) qs.set("wo", params.location);

        const listRes = await fetch(`${BASE}/pc/v4/jobs?${qs.toString()}`, {
          signal,
          cache: "no-store",
          headers: HEADERS,
        });
        if (!listRes.ok) {
          const text = await listRes.text().catch(() => "");
          if (listRes.status === 401 || listRes.status === 403) {
            throw new SourcePermanentError(`Bundesagentur auth (${listRes.status}): ${text}`);
          }
          throw new SourceTransientError(`Bundesagentur ${listRes.status}: ${text || listRes.statusText}`);
        }
        const list = (await listRes.json()) as BaListResponse;

        const collected: RawJob[] = [];
        for (const a of list.stellenangebote ?? []) {
          if (!a.refnr || (!a.titel && !a.beruf)) continue;
          if (signal.aborted) throw new SourcePermanentError("aborted mid-Bundesagentur");

          // Detail fetch for the description body.
          let description = "";
          let remoteMode: RemoteMode | undefined;
          const b64 = Buffer.from(a.refnr).toString("base64");
          const detailRes = await fetch(
            `${BASE}/pc/v3/jobdetails/${encodeURIComponent(b64)}`,
            { signal, cache: "no-store", headers: HEADERS },
          );
          if (detailRes.ok) {
            const detail = (await detailRes.json()) as BaDetail;
            description = detail.stellenangebotsBeschreibung
              ? htmlToText(detail.stellenangebotsBeschreibung)
              : "";
            if (detail.homeofficemoeglich === true) remoteMode = "hybrid";
          }

          collected.push({
            externalId: a.refnr,
            title: a.titel || a.beruf || "",
            company: a.arbeitgeber ?? "",
            location: { raw: locationRaw(a.arbeitsort) },
            remoteMode,
            description,
            postedAt: a.aktuelleVeroeffentlichungsdatum,
            url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(a.refnr)}`,
            rawSource: a,
          });
          if (collected.length >= params.maxResults) break;
        }
        return collected.slice(0, params.maxResults);
      } catch (err) {
        classifyAtsError(err, "bundesagentur.search");
      }
    },
  };
}
