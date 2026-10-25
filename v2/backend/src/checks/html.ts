import { load, CheerioAPI } from "cheerio";
import { JSDOM, VirtualConsole } from "jsdom";
import { Readability } from "@mozilla/readability";

/** Content types treated as HTML pages. Anything else is a "page type" without title/description. */
export function isHtmlContentType(contentType: string): boolean {
  return contentType === "" || contentType === "text/html" || contentType === "application/xhtml+xml";
}

export function loadHtml(html: string): CheerioAPI {
  return load(html);
}

/**
 * Text a reader sees without JavaScript: body text excluding script, style, template and svg.
 * Image alt text is deliberately excluded (A6: "text, not images").
 */
const BLOCK_TAGS =
  "address,article,aside,blockquote,dd,div,dl,dt,fieldset,figcaption,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hr,li,main,nav,ol,p,pre,section,table,tbody,td,tfoot,th,thead,tr,ul,option,label,button,summary,details";

export function visibleText(html: string): string {
  const $ = load(html);
  $("script, style, template, svg, head").remove();
  // Block elements are separate pieces of text: "<h1>A</h1><p>B</p>" reads "A B", not "AB".
  $("br").replaceWith(" ");
  $(BLOCK_TAGS).each((_, el) => {
    $(el).prepend(" ");
    $(el).append(" ");
  });
  return $("body").length ? $("body").text().replace(/\s+/g, " ").trim() : $.root().text().replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return matches ? matches.length : 0;
}

export interface MainContent {
  method: "readability" | "body-fallback";
  title: string | null;
  text: string;
  words: number;
}

/**
 * Main content via Mozilla Readability on a jsdom document (no scripts run).
 * If Readability cannot find an article, falls back to visible body text and says so.
 */
export function extractMainContent(html: string, url: string): MainContent {
  const virtualConsole = new VirtualConsole(); // swallow CSS/JS parse noise
  const dom = new JSDOM(html, { url, virtualConsole, runScripts: undefined });
  try {
    const article = new Readability(dom.window.document, { charThreshold: 0 }).parse();
    if (article && article.textContent && article.textContent.trim()) {
      const text = article.textContent.replace(/\s+/g, " ").trim();
      return { method: "readability", title: article.title ?? null, text, words: countWords(text) };
    }
  } catch {
    /* fall through */
  } finally {
    dom.window.close();
  }
  const text = visibleText(html);
  return { method: "body-fallback", title: null, text, words: countWords(text) };
}

export interface LinkInfo {
  href: string;
  resolved: string;
  text: string;
  nofollow: boolean;
}

export function extractLinks(html: string, baseUrl: string): LinkInfo[] {
  const $ = load(html);
  let base = baseUrl;
  const baseHref = $("base[href]").attr("href");
  if (baseHref) {
    try {
      base = new URL(baseHref, baseUrl).toString();
    } catch {
      /* ignore bad base */
    }
  }
  const out: LinkInfo[] = [];
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) return;
    let resolved: string;
    try {
      resolved = new URL(href, base).toString();
    } catch {
      return;
    }
    const rel = ($(el).attr("rel") ?? "").toLowerCase().split(/\s+/);
    out.push({ href, resolved, text: $(el).text().replace(/\s+/g, " ").trim(), nofollow: rel.includes("nofollow") });
  });
  return out;
}

/** Up to `radius` characters either side of the first match, for evidence. */
export function excerptAround(text: string, index: number, length: number, radius = 120): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Case-insensitive match with Unicode word boundaries ("Flow" does not match "Flowers"). */
export function wordBoundaryRegex(term: string, flags = "iu"): RegExp {
  const body = escapeRegex(term.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags);
}
