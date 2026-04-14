import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import {
  getCoverLetter,
  updateCoverLetterPdfPath,
} from "@/lib/repo/coverLetters";
import { getProfile } from "@/lib/repo/profile";
import { renderCoverLetterHtml } from "@/lib/pdf/cover-letter-html";
import { renderPdf } from "@/lib/pdf/render";
import { saveBinary } from "@/lib/upload";

export const runtime = "nodejs";
export const maxDuration = 120;

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export const POST = wrap(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id: idStr } = await ctx.params;
    const id = parseId(idStr);
    if (id === null) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const letter = await getCoverLetter(id);
    if (!letter) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const profile = await getProfile();
    const theme: "modern" | "classic" =
      letter.theme === "classic" ? "classic" : "modern";
    const html = renderCoverLetterHtml(
      letter.generatedMd,
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
    await updateCoverLetterPdfPath(letter.id, relPath);

    const pdfBlob = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
    return new NextResponse(pdfBlob, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfBlob.size),
        "Content-Disposition": `attachment; filename="rolehunter-cover-letter-${letter.id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  },
);
