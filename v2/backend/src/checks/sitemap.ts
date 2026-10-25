import { JSDOM } from "jsdom";
import { CheckConfig } from "../config";
import { PoliteFetcher } from "./fetcher";
import { normalizeUrl } from "./url";

export interface SitemapFileResult {
  url: string;
  depth: number;
  status: number | null;
  outcome: string;
  kind: "urlset" | "sitemapindex" | "invalid" | "unreachable" | "not-fetched";
  parseError?: string;
  urlCount: number;
  truncated: boolean;
}

export interface SitemapResult {
  /** Where sitemap locations came from. */
  discoveredFrom: "robots" | "default-location";
  /** Sitemap URLs listed in robots.txt (empty when none or robots.txt not parsed). */
  robotsSitemaps: string[];
  files: SitemapFileResult[];
  /** Normalized page URLs listed across all parsed files. */
  urls: string[];
  /** Raw page URLs in document order (for deriving key pages). */
  orderedRawUrls: string[];
  /** True when every referenced file was fetched and parsed without truncation. */
  complete: boolean;
}

export type XmlParse = { ok: true; root: string; locs: string[]; childSitemaps: string[] } | { ok: false; error: string };

/** Strict XML parse (jsdom's XML parser rejects malformed documents). */
export function parseSitemapXml(xml: string): XmlParse {
  const { window } = new JSDOM("");
  try {
    const doc = new window.DOMParser().parseFromString(xml, "application/xml");
    const err = doc.getElementsByTagName("parsererror");
    if (err.length > 0) return { ok: false, error: (err[0].textContent ?? "XML parse error").replace(/\s+/g, " ").trim().slice(0, 300) };
    const root = doc.documentElement?.localName ?? "";
    if (root !== "urlset" && root !== "sitemapindex") return { ok: false, error: `root element is <${root}>, expected <urlset> or <sitemapindex>` };
    const locs: string[] = [];
    const children: string[] = [];
    const entries = doc.getElementsByTagNameNS("*", root === "urlset" ? "url" : "sitemap");
    for (let i = 0; i < entries.length; i++) {
      const loc = Array.from(entries[i].childNodes).find((n) => (n as Element).localName === "loc") as Element | undefined;
      const value = loc?.textContent?.trim();
      if (!value) continue;
      if (root === "urlset") locs.push(value);
      else children.push(value);
    }
    return { ok: true, root, locs, childSitemaps: children };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    window.close();
  }
}

/**
 * Loads the sitemap(s): from robots.txt Sitemap: lines, or /sitemap.xml if none.
 * Follows sitemap indexes breadth-first up to cfg.sitemapMaxDepth, at most cfg.sitemapMaxFiles files,
 * and reads at most cfg.sitemapMaxUrlsPerFile URLs per file. Request budget applies.
 */
export async function loadSitemaps(fetcher: PoliteFetcher, homepage: string, robotsSitemaps: string[], cfg: CheckConfig): Promise<SitemapResult> {
  const start = robotsSitemaps.length ? robotsSitemaps : [new URL("/sitemap.xml", homepage).toString()];
  const result: SitemapResult = {
    discoveredFrom: robotsSitemaps.length ? "robots" : "default-location",
    robotsSitemaps,
    files: [],
    urls: [],
    orderedRawUrls: [],
    complete: true,
  };
  const urlSet = new Set<string>();
  const queue: { url: string; depth: number }[] = start.map((u) => ({ url: u, depth: 0 }));
  const seen = new Set<string>();
  while (queue.length) {
    const { url, depth } = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (result.files.length >= cfg.sitemapMaxFiles || depth > cfg.sitemapMaxDepth) {
      result.files.push({ url, depth, status: null, outcome: depth > cfg.sitemapMaxDepth ? "DEPTH_LIMIT" : "FILE_LIMIT", kind: "not-fetched", urlCount: 0, truncated: false });
      result.complete = false;
      continue;
    }
    const obs = await fetcher.fetchPage(url, "sitemap");
    if (obs.outcome !== "OK" || obs.status === null) {
      result.files.push({ url, depth, status: obs.status, outcome: obs.outcome, kind: "unreachable", urlCount: 0, truncated: false });
      result.complete = false;
      continue;
    }
    if (obs.status !== 200) {
      result.files.push({ url, depth, status: obs.status, outcome: `HTTP_${obs.status}`, kind: "unreachable", urlCount: 0, truncated: false });
      result.complete = false;
      continue;
    }
    const parsed = parseSitemapXml(obs.body);
    if (!parsed.ok) {
      result.files.push({ url, depth, status: obs.status, outcome: "OK", kind: "invalid", parseError: parsed.error, urlCount: 0, truncated: false });
      result.complete = false;
      continue;
    }
    if (parsed.root === "sitemapindex") {
      result.files.push({ url, depth, status: obs.status, outcome: "OK", kind: "sitemapindex", urlCount: parsed.childSitemaps.length, truncated: false });
      for (const child of parsed.childSitemaps) {
        try {
          queue.push({ url: new URL(child, url).toString(), depth: depth + 1 });
        } catch {
          /* skip malformed child loc */
        }
      }
      continue;
    }
    const truncated = parsed.locs.length > cfg.sitemapMaxUrlsPerFile;
    const locs = truncated ? parsed.locs.slice(0, cfg.sitemapMaxUrlsPerFile) : parsed.locs;
    if (truncated) result.complete = false;
    result.files.push({ url, depth, status: obs.status, outcome: "OK", kind: "urlset", urlCount: parsed.locs.length, truncated });
    for (const loc of locs) {
      const n = normalizeUrl(loc, cfg.trackingParams);
      if (n && !urlSet.has(n)) {
        urlSet.add(n);
        result.orderedRawUrls.push(loc);
      }
    }
  }
  result.urls = [...urlSet];
  return result;
}
