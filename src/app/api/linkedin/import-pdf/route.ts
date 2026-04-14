import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import { extractTextFromPdf } from "@/lib/cv/parse";
import { saveBinary } from "@/lib/upload";
import { getProvider } from "@/lib/llm";
import { updateProfile } from "@/lib/repo/profile";
import { saveCvMaster } from "@/lib/repo/cv";
import type { Provider } from "@/lib/llm/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const providerSchema = z.enum(["claude", "gemini"]).optional();

export const POST = wrap(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  const providerRaw = form.get("provider");
  const alsoCreateCvRaw = form.get("alsoCreateCv");
  const alsoCreateCv = alsoCreateCvRaw === null || alsoCreateCvRaw === "true" || alsoCreateCvRaw === "1";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "LinkedIn export must be a .pdf (More → Save to PDF on your profile)." },
      { status: 415 },
    );
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (>20MB)" }, { status: 413 });
  }

  const provider = providerSchema.parse(providerRaw || undefined) as Provider | undefined;
  const buffer = Buffer.from(await file.arrayBuffer());
  const rawText = await extractTextFromPdf(buffer);
  if (!rawText.trim()) {
    return NextResponse.json(
      { error: "Could not extract text from the PDF." },
      { status: 422 },
    );
  }

  const result = await getProvider(provider).importLinkedInPdf(rawText);

  // Update profile fields (only overwrite when the LLM returned a value).
  const profilePatch: Parameters<typeof updateProfile>[0] = {};
  const p = result.profile ?? {};
  if (p.fullName) profilePatch.fullName = p.fullName;
  if (p.email) profilePatch.email = p.email;
  if (p.phone) profilePatch.phone = p.phone;
  if (p.location) profilePatch.location = p.location;
  if (p.summary) profilePatch.summary = p.summary;
  if (p.linkedinHeadline !== undefined) profilePatch.linkedinHeadline = p.linkedinHeadline;
  if (p.linkedinAbout !== undefined) profilePatch.linkedinAbout = p.linkedinAbout;
  const updatedProfile = Object.keys(profilePatch).length > 0
    ? await updateProfile(profilePatch)
    : null;

  // Also save as a new active master CV.
  let newCvId: number | null = null;
  if (alsoCreateCv) {
    const sourcePath = await saveBinary("cv-master", buffer, file.name);
    const cv = await saveCvMaster({
      title: "From LinkedIn",
      rawMarkdown: rawText,
      parsedJson: result.cv ?? {},
      sourceFilePath: sourcePath,
    });
    newCvId = cv.id;
  }

  return NextResponse.json({
    profile: updatedProfile,
    cvId: newCvId,
    preview: result.profile,
  });
});
