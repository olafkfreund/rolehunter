// doc/scripts/capture-screenshots.mjs
// Captures screenshots of every page in RoleHunter for the docs.
// Expects the profile to already be swapped to dummy values by the caller.
// Run with: node doc/scripts/capture-screenshots.mjs
// Requires: APP_URL env (defaults to http://127.0.0.1:3000)

import { chromium } from "playwright-core";
import { mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_URL = process.env.APP_URL || "http://127.0.0.1:3000";
const OUT_DIR = process.env.OUT_DIR || join(__dirname, "..", "images");

// Try to discover an existing job id for /jobs/[id] + application id for /applications/[id]/feedback.
async function discoverIds() {
  const headers = {};
  let jobId = null;
  let applicationId = null;
  try {
    const r = await fetch(`${APP_URL}/api/jobs`, { headers });
    const jobs = await r.json();
    if (Array.isArray(jobs) && jobs.length > 0) jobId = jobs[0].id;
  } catch {}
  try {
    const r = await fetch(`${APP_URL}/api/applications`, { headers });
    const apps = await r.json();
    if (Array.isArray(apps) && apps.length > 0) applicationId = apps[0].id;
  } catch {}
  return { jobId, applicationId };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const { jobId, applicationId } = await discoverIds();
  console.log(`Using APP_URL=${APP_URL}`);
  console.log(`Discovered jobId=${jobId ?? "(none)"}  applicationId=${applicationId ?? "(none)"}`);

  const routes = [
    { path: "/", name: "01-dashboard.png" },
    { path: "/profile", name: "02-profile.png" },
    { path: "/jobs", name: "03-jobs-list.png" },
    jobId ? { path: `/jobs/${jobId}`, name: "04-job-detail.png" } : null,
    { path: "/applications", name: "05-applications-table.png" },
    { path: "/applications?view=board", name: "06-applications-board.png" },
    applicationId
      ? { path: `/applications/${applicationId}/feedback`, name: "07-application-feedback.png" }
      : null,
    { path: "/gaps", name: "08-gaps.png" },
    { path: "/interviews", name: "09-interviews.png" },
    { path: "/templates", name: "10-templates.png" },
    { path: "/linkedin-seo", name: "11-linkedin-seo.png" },
  ].filter(Boolean);

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2, // retina-ish output
    });
    const page = await ctx.newPage();

    for (const route of routes) {
      const url = `${APP_URL}${route.path}`;
      console.log(`  capturing ${route.name} ← ${url}`);
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        // give Suspense sections a moment to settle
        await page.waitForTimeout(800);
        const out = join(OUT_DIR, route.name);
        await page.screenshot({ path: out, fullPage: true });
        console.log(`    -> ${out}`);
      } catch (e) {
        console.warn(`    ! failed: ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
