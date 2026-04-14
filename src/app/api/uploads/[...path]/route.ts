import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import { absoluteUploadPath } from "@/lib/upload";

const MIME: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!path?.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const abs = absoluteUploadPath(path.join("/"));
    const st = await stat(abs);
    if (!st.isFile()) throw new Error("Not a file");
    const data = await readFile(abs);
    const mime = MIME[extname(abs).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(st.size),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
