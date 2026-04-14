import { NextResponse } from "next/server";
import { z } from "zod";
import { extractTextFromPdf, parseCvText } from "@/lib/cv/parse";
import { saveBinary } from "@/lib/upload";
import { getActiveCv, saveCvMaster } from "@/lib/repo/cv";
import type { Provider } from "@/lib/llm/types";
import { wrap } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

export const GET = wrap(async () => {
  const cv = await getActiveCv();
  return NextResponse.json(cv);
});

const providerSchema = z.enum(["claude", "gemini"]).optional();

export const POST = wrap(async (req: Request) => {
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const providerRaw = form.get("provider");
    const title = String(form.get("title") ?? "My CV");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const provider = providerSchema.parse(providerRaw || undefined) as Provider | undefined;

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.toLowerCase().split(".").pop() ?? "";

    let rawText: string;
    if (ext === "pdf") {
      rawText = await extractTextFromPdf(buffer);
    } else if (["md", "txt", "markdown"].includes(ext)) {
      rawText = buffer.toString("utf8");
    } else {
      return NextResponse.json(
        { error: "Unsupported file type (use .pdf, .md, or .txt)" },
        { status: 415 },
      );
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: "Could not extract any text from file" }, { status: 422 });
    }

    const sourcePath = await saveBinary("cv-master", buffer, file.name);
    const parsed = await parseCvText(rawText, provider);
    const cv = await saveCvMaster({
      title,
      rawMarkdown: rawText,
      parsedJson: parsed,
      sourceFilePath: sourcePath,
    });
    return NextResponse.json(cv);
  }

  // JSON fallback: paste raw markdown/text.
  const body = await req.json();
  const schemaJson = z.object({
    rawMarkdown: z.string().min(10),
    title: z.string().max(200).default("My CV"),
    provider: providerSchema,
  });
  const parsed = schemaJson.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const extracted = await parseCvText(parsed.data.rawMarkdown, parsed.data.provider);
  const cv = await saveCvMaster({
    title: parsed.data.title,
    rawMarkdown: parsed.data.rawMarkdown,
    parsedJson: extracted,
  });
  return NextResponse.json(cv);
});
