import { NextResponse } from "next/server";
import { hasProvider } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    providers: {
      claude: hasProvider("claude"),
      gemini: hasProvider("gemini"),
    },
    time: new Date().toISOString(),
  });
}
