import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { absoluteUploadPath } from "@/lib/upload";

/**
 * Loads the profile avatar, normalises it to a 96x96 WebP, and returns a
 * data URI suitable for embedding into Playwright-rendered HTML (no network
 * fetch needed). Returns null when there is no avatar or when anything goes
 * wrong — the PDF pipeline must never fail because of a missing avatar.
 */
export async function getAvatarDataUri(profile: {
  avatarPath?: string | null;
}): Promise<string | null> {
  const rel = profile.avatarPath;
  if (!rel || rel.trim() === "") return null;
  try {
    const abs = absoluteUploadPath(rel);
    const buf = await readFile(abs);
    const out = await sharp(buf)
      .resize(96, 96, { fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
    return `data:image/webp;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
