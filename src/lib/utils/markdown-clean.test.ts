import { describe, it, expect } from "vitest";
import { cleanMarkdown } from "./markdown-clean";

describe("cleanMarkdown", () => {
  it("should return empty string for empty input", () => {
    expect(cleanMarkdown("")).toBe("");
    expect(cleanMarkdown("   ")).toBe("");
  });

  it("should balance odd numbers of double asterisks in a paragraph", () => {
    const input = "**Security Clearance Requirements";
    expect(cleanMarkdown(input)).toBe("**Security Clearance Requirements**");
  });

  it("should not balance if double asterisks are already balanced", () => {
    const input = "This role requires **Security Check** clearance.";
    expect(cleanMarkdown(input)).toBe("This role requires **Security Check** clearance.");
  });

  it("should remove empty bold tags", () => {
    const input = "Paragraph one\n\n**\n\nParagraph two";
    expect(cleanMarkdown(input)).toBe("Paragraph one\n\nParagraph two");
  });

  it("should merge split bullet points on the same paragraph", () => {
    const input = "▸\nHave the right to work in the UK";
    expect(cleanMarkdown(input)).toBe("▸ Have the right to work in the UK");
  });

  it("should merge split bullet points separated by double newlines", () => {
    const input = "▸\n\nHave the right to work in the UK";
    expect(cleanMarkdown(input)).toBe("▸ Have the right to work in the UK");
  });

  it("should process multiple formatting issues together", () => {
    const input = `**About Us

**Come and be part of **TIG**

▸
Have the right to work in the UK

**`;

    const expected = `**About Us**

**Come and be part of **TIG****

▸ Have the right to work in the UK`;

    expect(cleanMarkdown(input)).toBe(expected);
  });
});
