// Shared MCP client helper used by indeed-mcp and dice-mcp adapters.
//
// Supports two transports (env-driven):
//   stdio — spawn the MCP server as a subprocess; rarely needed in production
//   http  — connect to a long-running MCP server via Streamable HTTP
//
// One Client instance is cached per source-id per process. Connect is lazy on
// first call. Connection lives for the process lifetime.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §5.5.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SourcePermanentError, SourceTransientError } from "./errors";

export type McpTransportKind = "stdio" | "http";

export interface McpConfig {
  transport: McpTransportKind;
  /** For http transport */
  url?: string;
  /** Bearer token sent as Authorization header (http transport only) */
  token?: string;
  /** For stdio transport: command to spawn (e.g. "uvx" or "npx") */
  command?: string;
  /** stdio command args */
  args?: string[];
  /** Extra env passed to the spawned subprocess (stdio only) */
  env?: Record<string, string>;
}

const clientCache = new Map<string, Client>();

export function readMcpConfigFromEnv(prefix: string): McpConfig | null {
  const transport = (process.env[`${prefix}_TRANSPORT`] ?? "").toLowerCase();
  if (transport !== "stdio" && transport !== "http") return null;

  if (transport === "http") {
    const url = process.env[`${prefix}_URL`];
    if (!url) return null;
    return {
      transport,
      url,
      token: process.env[`${prefix}_TOKEN`] || undefined,
    };
  }

  // stdio
  const command = process.env[`${prefix}_CMD`];
  if (!command) return null;
  const argsRaw = process.env[`${prefix}_ARGS`] ?? "";
  return {
    transport,
    command,
    args: argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [],
  };
}

async function newTransport(config: McpConfig) {
  if (config.transport === "http") {
    if (!config.url) throw new SourcePermanentError("MCP http transport missing URL");
    const url = new URL(config.url);
    const requestInit: RequestInit = config.token
      ? { headers: { Authorization: `Bearer ${config.token}` } }
      : {};
    return new StreamableHTTPClientTransport(url, { requestInit });
  }
  if (!config.command) {
    throw new SourcePermanentError("MCP stdio transport missing CMD");
  }
  return new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: config.env,
  });
}

export async function getMcpClient(sourceId: string, config: McpConfig): Promise<Client> {
  const cached = clientCache.get(sourceId);
  if (cached) return cached;

  const client = new Client(
    { name: `rolehunter-${sourceId}`, version: "3.0.0" },
    { capabilities: {} },
  );
  const transport = await newTransport(config);
  try {
    await client.connect(transport);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SourceTransientError(`MCP connect failed for '${sourceId}': ${msg}`, {
      cause: err,
    });
  }
  clientCache.set(sourceId, client);
  return client;
}

/**
 * Extract JSON-shaped text content from an MCP tool-call result.
 * Falls back to concatenating all text content if no JSON parses.
 */
export function extractMcpText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as { content?: Array<{ type?: string; text?: string }> };
  const texts = (r.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string);
  return texts.join("\n");
}

export function tryParseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Try fenced-code-block extraction (some MCP servers wrap JSON in ```json ... ```)
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
