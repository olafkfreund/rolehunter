import { NextResponse } from "next/server";
import { z } from "zod";
import { getVariant, updateVariantPdfPath } from "@/lib/repo/variants";
import { getProfile } from "@/lib/repo/profile";
import { renderCvHtml } from "@/lib/pdf/cv-html";
import { getAvatarDataUri } from "@/lib/pdf/avatar";
import { renderPdf } from "@/lib/pdf/render";
import { saveBinary } from "@/lib/upload";

export const runtime = "nodejs";
export const maxDuration = 120;

const postSchema = z.object({
  variantId: z.number().int().positive(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const variant = await getVariant(parsed.data.variantId);
  if (!variant) {
    return NextResponse.json({ error: "Variant not found" }, { status: 404 });
  }

  const profile = await getProfile();
  const avatarDataUri = await getAvatarDataUri(profile);
  const theme: "modern" | "classic" =
    variant.theme === "classic" ? "classic" : "modern";
  const html = renderCvHtml(
    variant.tailoredMarkdown,
    {
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      linkedinUrl: profile.linkedinUrl,
      avatarDataUri,
    },
    { theme },
  );

  const pdf = await renderPdf(html);
  const relPath = await saveBinary("cv-variant", pdf, "cv.pdf");
  await updateVariantPdfPath(variant.id, relPath);

  const pdfBlob = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
  return new NextResponse(pdfBlob, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdfBlob.size),
      "Content-Disposition": `attachment; filename="rolehunter-cv-${variant.id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
