import { describe, expect, it } from "vitest";
import { z } from "zod";

const providerEnum = z.enum(["claude", "gemini"]);

const postSchema = z.object({
  applicationId: z.number().int().positive(),
  templateId: z.number().int().positive().nullable().optional(),
  provider: providerEnum,
  selectedHook: z.string().nullable().optional(),
  selectedEvidence: z.array(
    z.object({
      type: z.enum(["experience", "project"]),
      companyOrName: z.string(),
      text: z.string(),
    })
  ).nullable().optional(),
  ctaTone: z.string().nullable().optional(),
});

describe("Cover Letter POST Schema validation", () => {
  it("accepts valid minimal input", () => {
    const valid = {
      applicationId: 42,
      provider: "claude",
    };
    const result = postSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts valid full input with hook, evidence, and ctaTone", () => {
    const valid = {
      applicationId: 42,
      templateId: 12,
      provider: "gemini",
      selectedHook: "Metric hook text here...",
      selectedEvidence: [
        {
          type: "experience",
          companyOrName: "Google",
          text: "Led the migration of services to Kubernetes."
        },
        {
          type: "project",
          companyOrName: "Antigravity",
          text: "Created a state-of-the-art AI assistant."
        }
      ],
      ctaTone: "Direct & Confident"
    };
    const result = postSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid provider", () => {
    const invalid = {
      applicationId: 42,
      provider: "invalid-provider",
    };
    const result = postSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects non-positive applicationId", () => {
    const invalid = {
      applicationId: -1,
      provider: "claude",
    };
    const result = postSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid evidence type", () => {
    const invalid = {
      applicationId: 42,
      provider: "claude",
      selectedEvidence: [
        {
          type: "education", // invalid type
          companyOrName: "Stanford",
          text: "B.S. in Computer Science"
        }
      ]
    };
    const result = postSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
