/**
 * Optional JavaScript rendering for A3. Playwright is an optional dependency:
 * when it (or its Chromium browser) is missing, A3 is NOT_ASSESSED with the install command.
 */

export type RenderResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; kind: "NOT_INSTALLED" | "TIMEOUT" | "ERROR"; message: string };

export interface Renderer {
  /** Returns null when rendering can run, otherwise a plain-English reason including the install command. */
  probe(): Promise<string | null>;
  render(url: string): Promise<RenderResult>;
  close(): Promise<void>;
}

export const PLAYWRIGHT_INSTALL_COMMAND = "cd v2/backend && npm install playwright && npx playwright install chromium";

interface PwPage {
  goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<unknown>;
  content(): Promise<string>;
  url(): string;
  close(): Promise<void>;
}
interface PwContext {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
interface PwBrowser {
  newContext(opts: { userAgent: string; javaScriptEnabled: boolean }): Promise<PwContext>;
  close(): Promise<void>;
}
interface PwModule {
  chromium: { launch(opts: { headless: boolean }): Promise<PwBrowser> };
}

export class PlaywrightRenderer implements Renderer {
  private browser: PwBrowser | null = null;
  private context: PwContext | null = null;
  private unavailable: string | null = null;

  constructor(private readonly userAgent: string, private readonly timeoutMs: number) {}

  private async ensure(): Promise<PwContext | null> {
    if (this.context) return this.context;
    if (this.unavailable) return null;
    let pw: PwModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      pw = require("playwright") as PwModule;
    } catch {
      this.unavailable = `Playwright is not installed. Install it with: ${PLAYWRIGHT_INSTALL_COMMAND}`;
      return null;
    }
    try {
      this.browser = await pw.chromium.launch({ headless: true });
      this.context = await this.browser.newContext({ userAgent: this.userAgent, javaScriptEnabled: true });
      return this.context;
    } catch (err) {
      this.unavailable = `Chromium for Playwright is not installed or failed to start (${(err as Error).message.split("\n")[0]}). Install it with: ${PLAYWRIGHT_INSTALL_COMMAND}`;
      return null;
    }
  }

  async probe(): Promise<string | null> {
    const ctx = await this.ensure();
    return ctx ? null : this.unavailable ?? "browser unavailable";
  }

  async render(url: string): Promise<RenderResult> {
    const ctx = await this.ensure();
    if (!ctx) return { ok: false, kind: "NOT_INSTALLED", message: this.unavailable ?? "browser unavailable" };
    const page = await ctx.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: this.timeoutMs });
      return { ok: true, html: await page.content(), finalUrl: page.url() };
    } catch (err) {
      const msg = (err as Error).message.split("\n")[0];
      return { ok: false, kind: /timeout/i.test(msg) ? "TIMEOUT" : "ERROR", message: msg };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.context = null;
    this.browser = null;
  }
}

/** Renderer used when rendering is switched off: always NOT_INSTALLED with the install command. */
export class NoRenderer implements Renderer {
  async probe(): Promise<string | null> {
    return `Browser rendering is not available. Install it with: ${PLAYWRIGHT_INSTALL_COMMAND}`;
  }
  async render(): Promise<RenderResult> {
    return { ok: false, kind: "NOT_INSTALLED", message: `Browser rendering is not available. Install it with: ${PLAYWRIGHT_INSTALL_COMMAND}` };
  }
  async close(): Promise<void> {}
}
