import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, updateProfile } from "@/lib/repo/profile";

export async function GET() {
  const p = await getProfile();
  return NextResponse.json(p);
}

const patchSchema = z.object({
  fullName: z.string().max(200).optional(),
  email: z.string().email().or(z.literal("")).optional(),
  phone: z.string().max(50).optional(),
  location: z.string().max(200).optional(),
  summary: z.string().max(4000).optional(),
  linkedinUrl: z.string().url().or(z.literal("")).optional().nullable(),
  linkedinHeadline: z.string().max(300).optional().nullable(),
  linkedinAbout: z.string().max(8000).optional().nullable(),
  avatarPath: z.string().optional().nullable(),
});

export async function PATCH(req: Request) {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const updated = await updateProfile(parsed.data);
  return NextResponse.json(updated);
}
