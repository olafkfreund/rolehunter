import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  generateForApplication,
  listForApplication,
  listRecent,
} from "@/lib/repo/coverLetters";

export const runtime = "nodejs";
export const maxDuration = 120;

const providerEnum = z.enum(["claude", "gemini"]);

const postSchema = z.object({
  applicationId: z.number().int().positive(),
  templateId: z.number().int().positive().nullable().optional(),
  provider: providerEnum,
  selectedHook: z.string().nullable().optional(),
  selectedEvidence: z.array(z.object({
    type: z.enum(["experience", "project"]),
    companyOrName: z.string(),
    text: z.string(),
  })).nullable().optional(),
  ctaTone: z.string().nullable().optional(),
});

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  const appIdRaw = url.searchParams.get("appId");
  const limitRaw = url.searchParams.get("limit");

  if (appIdRaw) {
    const appId = Number(appIdRaw);
    if (!Number.isInteger(appId) || appId <= 0) {
      return NextResponse.json({ error: "Invalid appId" }, { status: 400 });
    }
    const letters = await listForApplication(appId);
    return NextResponse.json(letters);
  }

  let limit = 20;
  if (limitRaw) {
    const n = Number(limitRaw);
    if (Number.isInteger(n) && n > 0 && n <= 200) limit = n;
  }
  const recent = await listRecent(limit);
  return NextResponse.json(recent);
});

export const POST = wrap(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { applicationId, templateId, provider, selectedHook, selectedEvidence, ctaTone } = parsed.data;
  const letter = await generateForApplication(applicationId, {
    templateId: templateId ?? null,
    provider,
    selectedHook,
    selectedEvidence,
    ctaTone,
  });
  return NextResponse.json(letter, { status: 201 });
});
