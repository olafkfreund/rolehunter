// LinkedIn Company Scraper via Apify. Pulls current employees + alumni for
// connection mapping. Skips silently when APIFY_API_TOKEN or
// APIFY_LINKEDIN_COMPANY_ACTOR_ID is unset.

import type { NewConnection } from "@/lib/repo/company-siblings";
import { pickStr, runApifyActor } from "./apify-base";

export interface LinkedInEmployeeRow {
  kind: "current_employee" | "alumni";
  name: string;
  headline: string | null;
  linkedinUrl: string | null;
  rawJson: Record<string, unknown>;
}

export async function lookupCompanyEmployees(
  companyName: string,
  opts: { linkedinUrl?: string | null } = {},
): Promise<LinkedInEmployeeRow[] | null> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_LINKEDIN_COMPANY_ACTOR_ID;
  if (!token || !actorId) return null;
  if (!companyName.trim()) return null;

  const input: Record<string, unknown> = {
    companies: [companyName.trim()],
    companyNames: [companyName.trim()],
    company: companyName.trim(),
    keywords: [companyName.trim()],
    maxItems: 50,
    maxResults: 50,
  };
  if (opts.linkedinUrl) {
    input.companyUrls = [opts.linkedinUrl];
    input.startUrls = [{ url: opts.linkedinUrl }];
  }

  const items = await runApifyActor<Record<string, unknown>>(actorId, token, input, {
    itemLimit: 100,
  });

  return items
    .map((r): LinkedInEmployeeRow | null => {
      const name = pickStr(r.name ?? r.fullName) ?? "";
      const linkedinUrl = pickStr(r.url ?? r.profileUrl ?? r.linkedinUrl);
      if (!name && !linkedinUrl) return null;
      const isCurrent =
        r.isCurrent === true ||
        r.current === true ||
        (typeof r.title === "string" && /\bat\s/i.test(r.title));
      return {
        kind: isCurrent ? "current_employee" : "alumni",
        name,
        headline: pickStr(r.headline ?? r.title ?? r.subtitle),
        linkedinUrl,
        rawJson: r,
      };
    })
    .filter((r): r is LinkedInEmployeeRow => r !== null);
}

export function rowsToConnections(rows: LinkedInEmployeeRow[]): NewConnection[] {
  return rows.map((r) => ({
    kind: r.kind,
    name: r.name,
    headline: r.headline,
    linkedinUrl: r.linkedinUrl,
    rawJson: r.rawJson,
  }));
}
