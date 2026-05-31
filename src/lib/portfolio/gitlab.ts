// GitLab portfolio ingester — pulls a user's public projects.
// Supports gitlab.com by default; GITLAB_BASE_URL env var points at
// self-hosted instances. GITLAB_TOKEN raises rate limits + enables private.

interface GlProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  web_url: string;
  default_branch: string | null;
  topics?: string[];
  tag_list?: string[];
  star_count: number;
  forks_count: number;
  archived: boolean;
  created_at: string;
  last_activity_at: string;
  readme_url?: string | null;
}

interface GlReadmeFile {
  file_name: string;
  file_path: string;
  encoding: string;
  content_sha256?: string;
  content: string;
  ref: string;
}

export interface PortfolioRepoData {
  externalId: string;
  title: string;
  description: string;
  url: string;
  tech: string[];
  highlights: string[];
  stars: number;
  startedAt: string;
  endedAt: string | null;
  rawJson: unknown;
}

function getBase(): string {
  return process.env.GITLAB_BASE_URL || "https://gitlab.com";
}

function glHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "rolehunter-portfolio/3.1",
  };
  const token = process.env.GITLAB_TOKEN;
  if (token) h["PRIVATE-TOKEN"] = token;
  return h;
}

async function glFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: glHeaders(), cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new Error("GitLab rate limit exceeded. Set GITLAB_TOKEN env to authenticate.");
    }
    if (res.status === 404) {
      throw new Error(`GitLab 404: '${url}' not found (user may be private)`);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`GitLab auth (${res.status}): ${text}`);
    }
    throw new Error(`GitLab ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function fetchReadme(projectId: number, branch: string | null): Promise<string | null> {
  if (!branch) return null;
  // GitLab readme file path varies; try README.md then README
  for (const filename of ["README.md", "README.markdown", "README"]) {
    try {
      const url = `${getBase()}/api/v4/projects/${projectId}/repository/files/${encodeURIComponent(filename)}?ref=${encodeURIComponent(branch)}`;
      const data = await glFetch<GlReadmeFile>(url);
      if (!data.content) continue;
      if (data.encoding === "base64") {
        return Buffer.from(data.content, "base64").toString("utf-8").slice(0, 8_000);
      }
      return data.content.slice(0, 8_000);
    } catch {
      // Try next filename
    }
  }
  return null;
}

export async function fetchGitlabPortfolio(
  username: string,
  opts: { includeReadmes?: boolean; limit?: number } = {},
): Promise<PortfolioRepoData[]> {
  const includeReadmes = opts.includeReadmes ?? true;
  const limit = opts.limit ?? 100;
  if (!/^[a-zA-Z0-9._-]{1,255}$/.test(username)) {
    throw new Error(`Invalid GitLab username: '${username}'`);
  }

  const url = `${getBase()}/api/v4/users/${encodeURIComponent(username)}/projects?per_page=${Math.min(
    limit,
    100,
  )}&order_by=last_activity_at&sort=desc&simple=false`;

  const projects = await glFetch<GlProject[]>(url);

  const items: PortfolioRepoData[] = [];
  for (const p of projects) {
    if (p.archived && p.star_count === 0) continue;

    let description = p.description ?? "";
    if (includeReadmes && items.length < 30 && p.default_branch) {
      const readme = await fetchReadme(p.id, p.default_branch);
      if (readme && readme.trim().length > 0) {
        description = (description ? description + "\n\n" : "") + readme;
      }
    }

    const tech: string[] = [];
    for (const t of p.topics ?? p.tag_list ?? []) {
      if (!tech.includes(t)) tech.push(t);
    }

    items.push({
      externalId: String(p.id),
      title: p.name,
      description,
      url: p.web_url,
      tech,
      highlights: [],
      stars: p.star_count,
      startedAt: p.created_at,
      endedAt: p.archived ? p.last_activity_at : null,
      rawJson: p,
    });

    if (items.length >= limit) break;
  }

  return items;
}
