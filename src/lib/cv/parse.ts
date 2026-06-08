import pdfParse from "pdf-parse";
import { getProvider } from "../llm";
import type { CvJson, Provider } from "../llm/types";

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
}

export async function parseCvText(rawText: string, provider?: Provider): Promise<CvJson> {
  return getProvider(provider).extractCv(rawText);
}
