// GET /api/settings/runtime  -> list every editable setting with masked value
// POST /api/settings/runtime -> { key, value } write (empty value deletes row)

import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  EDITABLE_KEYS,
  KEY_META,
  listSettingStates,
  setRuntimeSetting,
  type EditableKey,
} from "@/lib/settings/runtime";

export const runtime = "nodejs";

export const GET = wrap(async () => {
  const states = await listSettingStates();
  return NextResponse.json({ states });
});

const bodySchema = z.object({
  key: z.enum(EDITABLE_KEYS as unknown as [string, ...string[]]),
  value: z.string().max(2_000),
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
  const { key, value } = parsed.data as { key: EditableKey; value: string };

  const validator = KEY_META[key].validate;
  const trimmed = value.trim();
  if (trimmed && validator) {
    const err = validator(trimmed);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  await setRuntimeSetting(key, trimmed);
  return NextResponse.json({ key, saved: true, requiresRestart: true });
});
