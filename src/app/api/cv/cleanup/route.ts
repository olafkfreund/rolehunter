import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { cleanupInactiveCvs } from "@/lib/repo/cv";

export const runtime = "nodejs";

const bodySchema = z.object({
  confirm: z.literal(true),
});

export const POST = wrap(async (req: Request) => {
  let body: unknown = null;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Missing confirm: true" },
      { status: 400 },
    );
  }
  const result = await cleanupInactiveCvs();
  return NextResponse.json(result);
});
