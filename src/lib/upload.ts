import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getEnv } from "./env";

export type UploadKind = "avatar" | "cv-master" | "cv-variant";

const SUBDIRS: Record<UploadKind, string> = {
  avatar: "avatars",
  "cv-master": "cvs-master",
  "cv-variant": "cvs-variants",
};

function uploadRoot(): string {
  return getEnv().UPLOAD_DIR;
}

export async function ensureDirs(): Promise<void> {
  const root = uploadRoot();
  await Promise.all(
    Object.values(SUBDIRS).map((d) => mkdir(join(root, d), { recursive: true })),
  );
}

function sanitizeExt(original: string, fallback: string): string {
  const m = original.toLowerCase().match(/\.([a-z0-9]{1,6})$/);
  return m ? `.${m[1]}` : fallback;
}

function guardPath(abs: string): string {
  const root = resolve(uploadRoot());
  const resolved = resolve(abs);
  if (!resolved.startsWith(root + "/") && resolved !== root) {
    throw new Error("Path escapes upload root");
  }
  return resolved;
}

export async function saveAvatar(buffer: Buffer): Promise<string> {
  await ensureDirs();
  const filename = `${randomUUID()}.webp`;
  const target = guardPath(join(uploadRoot(), SUBDIRS.avatar, filename));
  const resized = await sharp(buffer)
    .rotate()
    .resize(256, 256, { fit: "cover" })
    .webp({ quality: 85 })
    .toBuffer();
  await writeFile(target, resized);
  return `${SUBDIRS.avatar}/${filename}`;
}

export async function saveBinary(
  kind: UploadKind,
  buffer: Buffer,
  originalName: string,
): Promise<string> {
  await ensureDirs();
  const ext = sanitizeExt(originalName, ".bin");
  const filename = `${randomUUID()}${ext}`;
  const target = guardPath(join(uploadRoot(), SUBDIRS[kind], filename));
  await writeFile(target, buffer);
  return `${SUBDIRS[kind]}/${filename}`;
}

export function absoluteUploadPath(relative: string): string {
  return guardPath(join(uploadRoot(), relative));
}
