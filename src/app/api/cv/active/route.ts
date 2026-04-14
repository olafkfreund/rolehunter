import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { getActiveCv } from "@/lib/repo/cv";

export const runtime = "nodejs";

export const GET = wrap(async () => {
  const cv = await getActiveCv();
  return NextResponse.json(cv);
});
