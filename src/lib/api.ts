import { NextResponse } from "next/server";

export function errorResponse(err: unknown, fallbackStatus = 500): NextResponse {
  const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
  const status =
    /ANTHROPIC_API_KEY|GEMINI_API_KEY|No LLM provider/i.test(message) ? 412 :
    /JSEARCH/i.test(message) ? 501 :
    fallbackStatus;
  console.error("[api]", message, err instanceof Error ? err.stack : undefined);
  return NextResponse.json({ error: message }, { status });
}

export function wrap<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse> | NextResponse,
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
