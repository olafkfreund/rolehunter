/**
 * Clean up and normalize job description markdown text:
 * - Removes isolated/empty bold markers (like "**" on its own line)
 * - Auto-closes unbalanced double asterisks (bold delimiters) within paragraphs
 * - Merges broken/split list bullet characters (like "▸", "*", etc.) that got separated by newlines
 */
export function cleanMarkdown(text: string): string {
  if (!text) return "";

  // Split into paragraphs by double newlines or single newlines that are clearly separating blocks
  const paragraphs = text.split(/\r?\n\r?\n/);
  const cleanedParagraphs = paragraphs.map((p) => {
    const trimmed = p.trim();
    if (!trimmed) return "";

    // 1. Remove empty/isolated bold markers
    if (trimmed === "**") return "";

    // 2. Count the number of "**" in this paragraph
    const count = (trimmed.match(/\*\*/g) || []).length;
    let result = trimmed;

    // If count of "**" is odd, append "**" to auto-close it
    if (count % 2 !== 0) {
      result = trimmed + "**";
    }

    // 3. Merge bullet points that got split by newlines within the paragraph
    // e.g. "* \nHave the right to work" -> "* Have the right to work"
    result = result.replace(/^([▸*•\-◦·])[\s\n]+/g, "$1 ");
    result = result.replace(/\n([▸*•\-◦·])[\s\n]+/g, "\n$1 ");

    return result;
  });

  // Merge paragraphs that are just a lone bullet with the subsequent paragraph
  const merged: string[] = [];
  for (let j = 0; j < cleanedParagraphs.length; j++) {
    const current = cleanedParagraphs[j];
    const next = cleanedParagraphs[j + 1];
    if (current && /^[▸*•\-◦·]$/.test(current.trim()) && next) {
      merged.push(current.trim() + " " + next);
      j++; // skip next since it's merged
    } else if (current !== "") {
      merged.push(current);
    }
  }

  return merged.join("\n\n");
}
