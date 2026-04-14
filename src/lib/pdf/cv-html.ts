export type CvTheme = "modern" | "classic";

export interface CvHtmlProfile {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedinUrl?: string | null;
  avatarDataUri?: string | null;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderInline(text: string): string {
  // Escape first, then apply a minimal set of inline markdown:
  // **bold**, *em* / _em_, `code`, and [label](url) links.
  let out = escapeHtml(text);
  // Links: [text](url)
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, label: string, url: string) => `<a href="${url}">${label}</a>`,
  );
  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic: *text* or _text_
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>");
  // Inline code: `text`
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const parts: string[] = [];
  let listOpen = false;
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length > 0) {
      parts.push(`<p>${renderInline(paraBuf.join(" "))}</p>`);
      paraBuf = [];
    }
  };
  const closeList = () => {
    if (listOpen) {
      parts.push("</ul>");
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      closeList();
      continue;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    const h1 = line.match(/^#\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);

    if (h1) {
      flushPara();
      closeList();
      parts.push(`<h1>${renderInline(h1[1])}</h1>`);
    } else if (h2) {
      flushPara();
      closeList();
      parts.push(`<h2>${renderInline(h2[1])}</h2>`);
    } else if (h3) {
      flushPara();
      closeList();
      parts.push(`<h3>${renderInline(h3[1])}</h3>`);
    } else if (bullet) {
      flushPara();
      if (!listOpen) {
        parts.push("<ul>");
        listOpen = true;
      }
      parts.push(`<li>${renderInline(bullet[1])}</li>`);
    } else {
      closeList();
      paraBuf.push(line.trim());
    }
  }
  flushPara();
  closeList();
  return parts.join("\n");
}

/**
 * Strip a duplicate leading heading from the markdown body if the first
 * non-empty line is an H1 that matches the profile name. This avoids
 * repeating the name when the LLM included it at the top of the markdown.
 */
export function stripDuplicateNameHeading(
  md: string,
  fullName?: string | null,
): string {
  if (!fullName || !fullName.trim()) return md;
  const target = fullName.trim().toLowerCase();
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l === "") continue;
    const m = l.match(/^#\s+(.*)$/);
    if (m && m[1].trim().toLowerCase() === target) {
      const rest = lines.slice(i + 1).join("\n");
      return rest.replace(/^\s+/, "");
    }
    break;
  }
  return md;
}

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_RE = /\+?\d[\d\s\-()]{6,}/;
const LINKEDIN_RE = /linkedin\.com\/in\//i;
const SEPARATOR_ONLY_RE = /^[\s·•\-|,]+$/;

function isContactLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return true;
  if (SEPARATOR_ONLY_RE.test(trimmed)) return true;
  if (EMAIL_RE.test(trimmed)) return true;
  if (LINKEDIN_RE.test(trimmed)) return true;
  if (PHONE_RE.test(trimmed)) return true;
  return false;
}

/**
 * Strip a duplicated contact block at the top of a markdown body. Extends
 * stripDuplicateNameHeading: after dropping a matching H1, also drop any
 * leading lines that look like contact info (email / phone / linkedin /
 * separator-only lines). Stops at the first ## heading or at the first
 * blank line that follows at least one non-contact content line.
 */
export function stripDuplicateContactBlock(
  md: string,
  profile: { fullName?: string | null },
): string {
  const afterName = stripDuplicateNameHeading(md, profile.fullName ?? null);
  const lines = afterName.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  // Skip leading blank lines.
  while (i < lines.length && lines[i].trim() === "") i++;
  // Walk the leading contact-ish block and drop it.
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("##")) break;
    if (trimmed.startsWith("#")) break;
    if (isContactLine(line)) {
      i++;
      continue;
    }
    // Hit real content — stop stripping here.
    break;
  }
  const rest = lines.slice(i).join("\n");
  return rest.replace(/^\s+/, "");
}

/**
 * Scans rendered HTML and removes any <h2> section that has no substantive
 * content before the next <h2> (or end of document). Also removes a trailing
 * <hr> that may have followed the empty heading. Uses simple regex — no DOM
 * parser — because our markdownToHtml output is predictable and flat.
 */
export function stripEmptySections(html: string): string {
  const h2Re = /<h2\b[^>]*>[\s\S]*?<\/h2>/g;
  const matches: { index: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = h2Re.exec(html)) !== null) {
    matches.push({ index: m.index, end: m.index + m[0].length });
  }
  if (matches.length === 0) return html;

  // Mark which h2 sections are empty.
  const toDrop = new Set<number>();
  for (let idx = 0; idx < matches.length; idx++) {
    const start = matches[idx].end;
    const stop = idx + 1 < matches.length ? matches[idx + 1].index : html.length;
    const segment = html.slice(start, stop);
    // Strip all tags and whitespace; if nothing is left, the section is empty.
    const stripped = segment.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
    if (stripped === "") toDrop.add(idx);
  }
  if (toDrop.size === 0) return html;

  // Rebuild the string, skipping empty-section <h2>s and a trailing <hr>.
  let out = "";
  let cursor = 0;
  for (let idx = 0; idx < matches.length; idx++) {
    const { index, end } = matches[idx];
    if (!toDrop.has(idx)) continue;
    // Emit everything before this h2.
    out += html.slice(cursor, index);
    // Skip the h2 itself.
    let skipTo = end;
    // Also swallow an immediately-following <hr ...> (with optional whitespace).
    const after = html.slice(end);
    const hrMatch = after.match(/^\s*<hr\b[^>]*\/?>(\s*)/);
    if (hrMatch) skipTo = end + hrMatch[0].length;
    cursor = skipTo;
  }
  out += html.slice(cursor);
  return out;
}

function classicCss(): string {
  return `
    @page { size: Letter; margin: 0.6in; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      color: #111;
      line-height: 1.35;
      background: #ffffff;
    }
    body { max-width: 100%; }
    h1 { font-size: 16pt; margin: 0 0 4pt 0; font-weight: 700; color: #111; }
    h2 {
      font-size: 13pt;
      margin: 14pt 0 4pt 0;
      font-weight: 700;
      color: #111;
      border-bottom: 1px solid #111;
      padding-bottom: 2pt;
    }
    h3 { font-size: 11.5pt; margin: 10pt 0 2pt 0; font-weight: 700; color: #111; }
    p { margin: 0 0 6pt 0; }
    ul { margin: 2pt 0 8pt 18pt; padding: 0; }
    li { margin: 0 0 3pt 0; }
    a { color: #111; text-decoration: underline; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    code {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
    }
    .cv-header { margin-bottom: 10pt; }
    .cv-header .name { font-size: 16pt; margin: 0 0 2pt 0; }
    .cv-header .contact { font-size: 10pt; color: #111; }
  `.trim();
}

function modernCss(): string {
  return `
    @page { size: Letter; margin: 0.6in; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11pt;
      color: #111;
      line-height: 1.35;
      background: #ffffff;
    }
    body { max-width: 100%; }
    h1.name {
      color: #2563eb;
      font-size: 26pt;
      font-weight: 700;
      letter-spacing: -0.01em;
      margin: 0 0 2pt 0;
    }
    h1 { font-size: 16pt; margin: 0 0 4pt 0; font-weight: 700; color: #111; }
    h2 {
      color: #2563eb;
      font-size: 13pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid rgba(37, 99, 235, 0.18);
      padding-bottom: 3pt;
      margin-top: 14pt;
      margin-bottom: 6pt;
    }
    h3 { font-size: 11.5pt; margin: 10pt 0 2pt 0; font-weight: 700; color: #111; }
    p { margin: 0 0 6pt 0; }
    ul { margin: 2pt 0 8pt 18pt; padding: 0; }
    li { margin: 0 0 3pt 0; }
    a { color: #2563eb; text-decoration: none; }
    strong { color: #111; font-weight: 700; }
    em { font-style: italic; }
    code {
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11pt;
    }
    .header {
      position: relative;
      padding-right: 110px;
      min-height: 96px;
      margin-bottom: 10pt;
    }
    .cv-header { margin: 0; }
    .contact { font-size: 10pt; color: #555; }
    .avatar {
      position: absolute;
      top: 0.6in;
      right: 0.6in;
      width: 96px;
      height: 96px;
      border-radius: 12px;
      object-fit: cover;
      border: 1px solid rgba(0,0,0,0.08);
    }
  `.trim();
}

export function headerBlock(profile: CvHtmlProfile, theme: CvTheme): string {
  const name = profile.fullName?.trim() || "";
  const contactParts = [
    profile.email,
    profile.phone,
    profile.location,
    profile.linkedinUrl,
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);

  const nameHtml = name
    ? `<h1 class="name">${escapeHtml(name)}</h1>`
    : "";
  const contactHtml = contactParts.length
    ? `<div class="contact">${contactParts.map(escapeHtml).join(" \u00b7 ")}</div>`
    : "";

  const avatarHtml =
    theme === "modern" && profile.avatarDataUri
      ? `<img class="avatar" src="${profile.avatarDataUri}" alt="" />`
      : "";

  if (!nameHtml && !contactHtml && !avatarHtml) return "";
  const inner = `<header class="cv-header">${nameHtml}${contactHtml}</header>${avatarHtml}`;
  return `<div class="header">${inner}</div>`;
}

export function renderCvHtml(
  markdown: string,
  profile: CvHtmlProfile,
  opts?: { theme?: CvTheme },
): string {
  const theme: CvTheme = opts?.theme === "classic" ? "classic" : "modern";
  const cleaned = stripDuplicateContactBlock(markdown, {
    fullName: profile.fullName ?? null,
  });
  const rawBody = markdownToHtml(cleaned);
  const body = stripEmptySections(rawBody);
  const header = headerBlock(profile, theme);
  const css = theme === "modern" ? modernCss() : classicCss();

  return `<!doctype html><html><head><meta charset="utf-8"><title>CV</title><style>${css}</style></head><body>${header}${body}</body></html>`;
}
