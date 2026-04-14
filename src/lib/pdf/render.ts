import { chromium, type Browser } from "playwright";

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;
let _shutdownHooked = false;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  if (_launching) return _launching;
  _launching = chromium
    .launch({ headless: true })
    .then((b) => {
      _browser = b;
      _launching = null;
      b.once("disconnected", () => {
        if (_browser === b) _browser = null;
      });
      return b;
    })
    .catch((err) => {
      _launching = null;
      throw err;
    });
  hookShutdown();
  return _launching;
}

function hookShutdown(): void {
  if (_shutdownHooked) return;
  _shutdownHooked = true;
  const shutdown = async () => {
    const b = _browser;
    _browser = null;
    if (b) {
      try {
        await b.close();
      } catch {
        /* noop */
      }
    }
  };
  process.once("beforeExit", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
  process.once("SIGINT", () => {
    void shutdown();
  });
}

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: false,
      margin: {
        top: "0.6in",
        right: "0.6in",
        bottom: "0.6in",
        left: "0.6in",
      },
    });
    return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}
