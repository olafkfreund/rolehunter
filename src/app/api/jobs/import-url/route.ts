// POST /api/jobs/import-url — extract job posting from a public URL, ingest
// as a JobListing. Two modes:
//   { url, preview: true }  -> returns parsed fields without saving
//   { url }                 -> parses + saves + returns the new job row
//
// The "paste" source is reused; rawJson.via = "url-import" + extractionMethod
// records that this came from URL ingestion rather than text paste.

import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { importJobFromUrl } from "@/lib/jobs/url-import";
import { insertImportedFromUrl } from "@/lib/repo/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  url: z.string().url(),
  preview: z.boolean().optional().default(false),
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const { url, preview } = parsed.data;

  const imported = await importJobFromUrl(url);

  if (preview) {
    return NextResponse.json({ preview: imported });
  }

  const job = await insertImportedFromUrl({
    title: imported.title,
    company: imported.company,
    location: imported.location,
    description: imported.description,
    url: imported.url,
    postedAt: imported.postedAt,
    salaryMin: imported.salaryMin,
    salaryMax: imported.salaryMax,
    salaryCurrency: imported.salaryCurrency,
    employmentType: imported.employmentType,
    extractionMethod: imported.extractionMethod,
  });

  return NextResponse.json({ job, extractionMethod: imported.extractionMethod });
});
