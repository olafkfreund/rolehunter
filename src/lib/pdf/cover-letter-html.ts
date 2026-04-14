import {
  escapeHtml,
  markdownToHtml,
  stripDuplicateContactBlock,
} from "./cv-html";

export type CoverLetterTheme = "modern" | "classic";

export interface CoverLetterProfile {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
}

function classicCss(): string {
  return `
    @page { size: Letter; margin: 0.75in; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #111;
      line-height: 1.45;
      background: #ffffff;
    }
    body { max-width: 100%; }
    h1 { font-size: 15pt; margin: 0 0 4pt 0; font-weight: 700; color: #111; }
    h2 { font-size: 12.5pt; margin: 12pt 0 4pt 0; font-weight: 700; color: #111; }
    h3 { font-size: 11.5pt; margin: 10pt 0 2pt 0; font-weight: 700; color: #111; }
    p { margin: 0 0 8pt 0; }
    ul { margin: 4pt 0 8pt 18pt; padding: 0; }
    li { margin: 0 0 3pt 0; }
    a { color: #111; text-decoration: underline; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    .letter-header { margin-bottom: 14pt; }
    .letter-header .name { font-size: 15pt; margin: 0 0 2pt 0; }
    .letter-header .contact { font-size: 10pt; color: #111; }
  `.trim();
}

function modernCss(): string {
  return `
    @page { size: Letter; margin: 0.75in; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11pt;
      color: #111;
      line-height: 1.45;
      background: #ffffff;
    }
    body { max-width: 100%; }
    h1 { font-size: 15pt; margin: 0 0 4pt 0; font-weight: 700; color: #111; }
    h2 { font-size: 12.5pt; margin: 12pt 0 4pt 0; font-weight: 700; color: #2563eb; }
    h3 { font-size: 11.5pt; margin: 10pt 0 2pt 0; font-weight: 700; color: #111; }
    p { margin: 0 0 8pt 0; }
    ul { margin: 4pt 0 8pt 18pt; padding: 0; }
    li { margin: 0 0 3pt 0; }
    a { color: #2563eb; text-decoration: none; }
    strong { font-weight: 700; color: #111; }
    em { font-style: italic; }
    .letter-header {
      margin-bottom: 14pt;
      padding-bottom: 6pt;
      border-bottom: 1px solid rgba(37, 99, 235, 0.18);
    }
    .letter-header .name {
      font-size: 22pt;
      font-weight: 700;
      color: #2563eb;
      letter-spacing: -0.01em;
      margin: 0 0 2pt 0;
    }
    .letter-header .contact { font-size: 10pt; color: #555; }
  `.trim();
}

function headerBlock(profile: CoverLetterProfile): string {
  const name = profile.fullName?.trim() || "";
  const contactParts = [
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedinUrl,
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);

  const header = name ? `<h1 class="name">${escapeHtml(name)}</h1>` : "";
  const contact = contactParts.length
    ? `<div class="contact">${contactParts.map(escapeHtml).join(" \u00b7 ")}</div>`
    : "";

  if (!header && !contact) return "";
  return `<header class="letter-header">${header}${contact}</header>`;
}

/**
 * Renders a cover-letter PDF HTML document. Uses the same markdown →
 * HTML pipeline as the CV renderer (imported from cv-html.ts) but with
 * letter-specific layout (airier margins, paragraph-first). EU norm:
 * no avatar on cover letters — only on CVs.
 */
export function renderCoverLetterHtml(
  markdown: string,
  profile: CoverLetterProfile,
  opts?: { theme?: CoverLetterTheme },
): string {
  const theme: CoverLetterTheme = opts?.theme === "classic" ? "classic" : "modern";
  const cleaned = stripDuplicateContactBlock(markdown, {
    fullName: profile.fullName ?? null,
  });
  const body = markdownToHtml(cleaned);
  const header = headerBlock(profile);
  const css = theme === "modern" ? modernCss() : classicCss();

  return `<!doctype html><html><head><meta charset="utf-8"><title>Cover Letter</title><style>${css}</style></head><body>${header}${body}</body></html>`;
}
