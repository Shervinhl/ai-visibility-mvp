/**
 * URL normalization used for comparing addresses (A8 canonical, A10 sitemap, A11 links).
 * Rules: lowercase scheme and host, drop default port, drop fragment, drop tracking parameters,
 * sort remaining query parameters, remove trailing slash except for the root path.
 * Scheme is kept: http and https are different addresses.
 */
export function normalizeUrl(input: string, trackingParams: string[], base?: string): string | null {
  let u: URL;
  try {
    u = base ? new URL(input, base) : new URL(input);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
  const tracking = new Set(trackingParams.map((t) => t.toLowerCase()));
  const kept: [string, string][] = [];
  u.searchParams.forEach((value, key) => {
    if (!tracking.has(key.toLowerCase()) && !key.toLowerCase().startsWith("utm_")) kept.push([key, value]);
  });
  kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);
  let pathname = u.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.replace(/\/+$/, "");
  if (pathname === "") pathname = "/";
  u.pathname = pathname;
  return u.toString();
}

/** Host comparison for "internal" links: ignores a leading "www.". */
export function siteHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isInternal(url: string, homepage: string): boolean {
  const a = siteHost(url);
  const b = siteHost(homepage);
  return a !== null && a === b;
}

export function originOf(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}`;
}

/** Path plus query, used for robots.txt matching. */
export function robotsPath(url: string): string {
  const u = new URL(url);
  return (u.pathname || "/") + u.search;
}
