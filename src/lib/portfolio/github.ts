// GitHub portfolio ingester — pulls a user's public repos + READMEs.
// No-auth path uses 60 req/hr rate limit; GITHUB_TOKEN env raises to 5000/hr.
//
// See doc/plans/2026-05-31-rolehunter-v3-design.md §11 v3.1.

interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
  created_at: string;
  pushed_at: string;
  default_branch: string;
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

function ghHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "rolehunter-portfolio/3.1",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders(), cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 403 && /rate limit/i.test(text)) {
      throw new Error(
        "GitHub API rate limit exceeded (60/hr without GITHUB_TOKEN). Set GITHUB_TOKEN env to raise to 5000/hr.",
      );
    }
    if (res.status === 404) {
      throw new Error(`GitHub 404: '${url}' not found`);
    }
    throw new Error(`GitHub ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function fetchReadme(fullName: string): Promise<string | null> {
  try {
    const data = await ghFetch<{ content?: string; encoding?: string }>(
      `https://api.github.com/repos/${fullName}/readme`,
    );
    if (!data.content) return null;
    if (data.encoding === "base64") {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      return decoded.slice(0, 8_000); // cap to avoid bloating DB
    }
    return data.content.slice(0, 8_000);
  } catch {
    // No README, or 404 — fine
    return null;
  }
}

export async function fetchGithubPortfolio(
  username: string,
  opts: { includeReadmes?: boolean; limit?: number } = {},
): Promise<PortfolioRepoData[]> {
  const includeReadmes = opts.includeReadmes ?? true;
  const limit = opts.limit ?? 100;
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(username)) {
    throw new Error(`Invalid GitHub username: '${username}'`);
  }

  // Sort by pushed for relevance — most recent activity first
  const repos = await ghFetch<GhRepo[]>(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&sort=pushed&direction=desc&per_page=${Math.min(limit, 100)}`,
  );

  const items: PortfolioRepoData[] = [];
  for (const repo of repos) {
    if (repo.fork) continue; // forks don't represent your work
    if (repo.archived && repo.stargazers_count === 0) continue;

    let description = repo.description ?? "";
    if (includeReadmes && items.length < 30) {
      // Cap README fetches at 30 to stay within rate limit
      const readme = await fetchReadme(repo.full_name);
      if (readme && readme.trim().length > 0) {
        description = (description ? description + "\n\n" : "") + readme;
      }
    }

    const tech: string[] = [];
    if (repo.language) tech.push(repo.language);
    for (const t of repo.topics ?? []) if (!tech.includes(t)) tech.push(t);

    items.push({
      externalId: String(repo.id),
      title: repo.name,
      description,
      url: repo.html_url,
      tech,
      highlights: [], // future: extract bullet headlines from README
      stars: repo.stargazers_count,
      startedAt: repo.created_at,
      endedAt: repo.archived ? repo.pushed_at : null,
      rawJson: repo,
    });

    if (items.length >= limit) break;
  }

  return items;
}
