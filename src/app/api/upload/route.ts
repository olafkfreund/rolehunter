import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAvatar, saveBinary, type UploadKind } from "@/lib/upload";
import { updateProfile } from "@/lib/repo/profile";

const kindSchema = z.enum(["avatar", "cv-master", "cv-variant"]);

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const kindRaw = form.get("kind");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  const kindParsed = kindSchema.safeParse(kindRaw);
  if (!kindParsed.success) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const kind: UploadKind = kindParsed.data;

  const MAX_BYTES = 15 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (>15MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (kind === "avatar") {
    const relPath = await saveAvatar(buffer);
    await updateProfile({ avatarPath: relPath });
    return NextResponse.json({ path: relPath });
  }

  const relPath = await saveBinary(kind, buffer, file.name);
  return NextResponse.json({ path: relPath, name: file.name, size: file.size });
}
