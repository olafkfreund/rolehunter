import { NextResponse } from "next/server";
import { z } from "zod";
import { wrap } from "@/lib/api";
import {
  generateForApplication,
  updateCoverLetterPdfPath,
} from "@/lib/repo/coverLetters";
import { getProfile } from "@/lib/repo/profile";
import { renderCoverLetterHtml } from "@/lib/pdf/cover-letter-html";
import { renderPdf } from "@/lib/pdf/render";
import { saveBinary } from "@/lib/upload";

export const runtime = "nodejs";
export const maxDuration = 180;

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

const bodySchema = z.object({
  provider: z.enum(["claude", "gemini"]).optional(),
  templateId: z.number().int().positive().optional(),
});

export const POST = wrap(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const rawBody = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { provider, templateId } = parsed.data;

    // generateForApplication throws if application is missing; translate to 404.
    let newLetter;
    try {
      newLetter = await generateForApplication(id, {
        templateId: templateId ?? null,
        provider: provider ?? "claude",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Application \d+ not found/i.test(msg)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }

    const profile = await getProfile();
    const theme: "modern" | "classic" =
      newLetter.theme === "classic" ? "classic" : "modern";
    const html = renderCoverLetterHtml(
      newLetter.generatedMd,
      {
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        linkedinUrl: profile.linkedinUrl,
      },
      { theme },
    );

    const pdf = await renderPdf(html);
    const relPath = await saveBinary("cv-variant", pdf, "cover-letter.pdf");
    await updateCoverLetterPdfPath(newLetter.id, relPath);

    const pdfBlob = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
    return new NextResponse(pdfBlob, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfBlob.size),
        "Content-Disposition": `attachment; filename="rolehunter-cover-letter-${newLetter.id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
