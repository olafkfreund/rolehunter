import { NextResponse } from "next/server";
import { wrap } from "@/lib/api";
import { getRuntimeSetting } from "@/lib/settings/runtime";

export const runtime = "nodejs";

export const GET = wrap(async (req: Request) => {
  const url = new URL(req.url);
  let baseUrl = url.searchParams.get("baseUrl") || "";
  
  if (!baseUrl) {
    baseUrl = (await getRuntimeSetting("OLLAMA_BASE_URL")) || "http://localhost:11434";
  }

  // Ensure url ends with no trailing slash
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json({ error: `Ollama returned status ${res.status}` });
    }

    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = data.models?.map((m) => m.name) || [];
    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json({
      error: `Could not connect to Ollama at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`
    });
  }
});
