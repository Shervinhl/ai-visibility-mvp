import axios from "axios";
import { TextGenerator } from "../questions/generate";
import { isAllowed, parseRobots } from "../checks/robots";
import { loadHtml, visibleText } from "../checks/html";

/** Fields the AI (or page metadata) can fill. Every field is optional; missing ones are listed in notFound. */
export interface FactSuggestion {
  businessName: string;
  aliases: string[];
  whatItDoes: string;
  productCategory: string;
  products: { name: string; description: string }[];
  buyers: string[];
  locations: string[];
  contactEmail: string;
  contactPhone: string;
  contactUrl: string;
  prices: { plan: string; amount: number; currency: string; period: string; pageUrl: string }[];
}

export interface SuggestResult {
  suggestion: FactSuggestion;
  filled: string[];
  notFound: string[];
  source: "ai" | "page-metadata";
  warnings: string[];
}

export const SUGGEST_USER_AGENT = "BesigniticsVisibilityCheck/2.0 (+https://besignitics.com/visibility-check-bot)";
const TOKEN = "BesigniticsVisibilityCheck";
const MAX_TEXT = 12000;

export class SuggestError extends Error {}

export interface FetchedPage {
  url: string;
  html: string;
}

const LINK_HINT = /pric|plan|contact|about|product|feature|solution|faq|team/i;
const MAX_LINKED_PAGES = 4;

/**
 * Read the homepage plus up to four linked pages that usually hold the facts (pricing, contact, about, products).
 * robots.txt is checked before every request. Only GET, bounded time, same site only.
 */
export async function fetchForSuggest(website: string): Promise<{ pages: FetchedPage[]; warnings: string[] }> {
  let url: URL;
  try {
    url = new URL(website.trim());
  } catch {
    throw new SuggestError("Enter a full website address, for example https://www.example.com/");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SuggestError("The website address must start with http:// or https://");
  const robots = await axios
    .get(`${url.origin}/robots.txt`, { timeout: 10000, validateStatus: () => true, responseType: "text", headers: { "User-Agent": SUGGEST_USER_AGENT } })
    .catch(() => null);
  const parsedRobots = robots && robots.status === 200 ? parseRobots(String(robots.data ?? "")) : null;
  const allowed = (u: URL) => (parsedRobots ? isAllowed(parsedRobots, TOKEN, u.pathname + u.search).allowed : true);
  if (!allowed(url)) throw new SuggestError("The site's robots.txt does not allow this tool to read the homepage. Ask the site owner or fill the fields by hand.");

  const home = await axios.get(url.toString(), { timeout: 15000, maxRedirects: 3, validateStatus: () => true, responseType: "text", headers: { "User-Agent": SUGGEST_USER_AGENT, Accept: "text/html" } });
  if (home.status !== 200) throw new SuggestError(`The homepage returned HTTP ${home.status}, so it could not be read.`);
  const homeUrl = home.request?.res?.responseUrl ?? url.toString();
  const homeHtml = String(home.data ?? "");
  const pages: FetchedPage[] = [{ url: homeUrl, html: homeHtml }];
  const warnings: string[] = [];

  // Linked pages on the same site that usually hold prices, contact details and product facts.
  const base = new URL(homeUrl);
  const $home = loadHtml(homeHtml);
  const links = [...new Set(
    $home("a[href]")
      .toArray()
      .map((el) => {
        try {
          return new URL($home(el).attr("href") ?? "", base);
        } catch {
          return null;
        }
      })
      .filter((u): u is URL => !!u && u.origin === base.origin && (u.protocol === "https:" || u.protocol === "http:"))
      .filter((u) => LINK_HINT.test(u.pathname))
      .map((u) => u.origin + u.pathname)
  )].slice(0, MAX_LINKED_PAGES);

  for (const link of links) {
    const u = new URL(link);
    if (!allowed(u)) {
      warnings.push(`robots.txt does not allow reading ${u.pathname}, so it was skipped.`);
      continue;
    }
    const res = await axios.get(link, { timeout: 15000, maxRedirects: 3, validateStatus: () => true, responseType: "text", headers: { "User-Agent": SUGGEST_USER_AGENT, Accept: "text/html" } }).catch(() => null);
    if (res && res.status === 200 && String(res.headers?.["content-type"] ?? "").includes("html")) {
      pages.push({ url: link, html: String(res.data ?? "") });
    }
  }
  return { pages, warnings };
}

/** Facts that the page states directly, without any AI. Used when no AI key is configured. */
export function metadataSuggestion(html: string, finalUrl: string): FactSuggestion {
  const $ = loadHtml(html);
  const meta = (name: string) => ($(`meta[name="${name}"]`).attr("content") ?? $(`meta[property="${name}"]`).attr("content") ?? "").replace(/\s+/g, " ").trim();
  const title = ($("title").first().text() || "").replace(/\s+/g, " ").trim();
  const siteName = meta("og:site_name");
  const text = visibleText(html);
  const email = (text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) ?? [""])[0];
  const phone = (text.match(/\+?\d[\d ()\-.]{7,}\d/) ?? [""])[0].trim();
  const contactHref = $("a[href]")
    .toArray()
    .map((el) => $(el).attr("href") ?? "")
    .find((h) => /contact|about/i.test(h));
  let contactUrl = "";
  try {
    if (contactHref) contactUrl = new URL(contactHref, finalUrl).toString();
  } catch {
    contactUrl = "";
  }
  return {
    businessName: siteName || title.split(/[|\-–—]/)[0].trim(),
    aliases: [],
    whatItDoes: meta("description") || meta("og:description"),
    productCategory: "",
    products: [],
    buyers: [],
    locations: [],
    contactEmail: email,
    contactPhone: phone,
    contactUrl,
    prices: [],
  };
}

const PROMPT = (website: string, text: string) => `You are filling in a business profile from its website text.
Use ONLY facts stated in the text. If a fact is not stated, return an empty string or empty array. Do not guess.
Return ONLY a JSON object with exactly these keys:
{"businessName": string, "aliases": string[], "whatItDoes": string (one paragraph), "productCategory": string (short phrase, e.g. "AI video clipping tool"), "products": [{"name": string, "description": string}], "buyers": string[] (who the product is for), "locations": string[] (e.g. "Toronto, ON, Canada"), "contactEmail": string, "contactPhone": string, "contactUrl": string, "prices": [{"plan": string, "amount": number, "currency": string, "period": string, "pageUrl": string}]}
Website: ${website}
Website text:
"""
${text}
"""`;

/** Ask the AI to read the page. Returns null if the reply is not usable JSON. */
export function parseAiSuggestion(reply: string): Partial<FactSuggestion> | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(reply.slice(start, end + 1)) as Partial<FactSuggestion>;
  } catch {
    return null;
  }
}

const FIELD_LABELS: { key: keyof FactSuggestion; label: string }[] = [
  { key: "businessName", label: "Business name" },
  { key: "aliases", label: "Approved aliases" },
  { key: "whatItDoes", label: "What the business does" },
  { key: "productCategory", label: "Product category" },
  { key: "products", label: "Products or services" },
  { key: "buyers", label: "Buyer types" },
  { key: "locations", label: "Locations" },
  { key: "contactEmail", label: "Contact email" },
  { key: "contactPhone", label: "Contact phone" },
  { key: "contactUrl", label: "Contact page URL" },
  { key: "prices", label: "Prices or plans" },
];

function isFilled(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return typeof v === "string" && v.trim().length > 0;
}

/** Fill every field the AI or the pages can supply. Anything else is reported as not found. */
export async function suggestFacts(website: string, generator: TextGenerator | null): Promise<SuggestResult> {
  const { pages, warnings: fetchWarnings } = await fetchForSuggest(website);
  const warnings: string[] = [...fetchWarnings];
  const home = pages[0];
  const base = metadataSuggestion(home.html, home.url);
  // Contact details can appear on any page we read.
  for (const p of pages.slice(1)) {
    const extra = metadataSuggestion(p.html, p.url);
    if (!base.contactEmail && extra.contactEmail) base.contactEmail = extra.contactEmail;
    if (!base.contactPhone && extra.contactPhone) base.contactPhone = extra.contactPhone;
  }
  let suggestion: FactSuggestion = { ...base, products: [], buyers: [], locations: [], aliases: [], productCategory: "", prices: [] };
  let source: SuggestResult["source"] = "page-metadata";
  if (generator) {
    const text = pages.map((p) => `--- PAGE: ${p.url} ---\n${visibleText(p.html)}`).join("\n\n").slice(0, MAX_TEXT);
    try {
      const reply = await generator.generate(PROMPT(home.url, text));
      const ai = parseAiSuggestion(reply);
      if (ai) {
        suggestion = { ...suggestion };
        for (const { key } of FIELD_LABELS) {
          const v = ai[key];
          if (isFilled(v)) (suggestion as unknown as Record<string, unknown>)[key] = v;
        }
        source = "ai";
      } else {
        warnings.push("The AI reply could not be read, so only page details were used.");
      }
    } catch (e) {
      warnings.push(`The AI could not be reached (${(e as Error).message}), so only page details were used.`);
    }
  } else {
    warnings.push(
      `Without an AI key the tool can only read the company name, description, contact email, phone and contact page. It cannot read products, buyer types, locations or prices. Add ANTHROPIC_API_KEY (or OPENAI_API_KEY / GEMINI_API_KEY) to backend/.env and restart the backend to fill every field. Pages read: ${pages.map((p) => p.url).join(", ")}.`
    );
  }
  const filled = FIELD_LABELS.filter(({ key }) => isFilled((suggestion as unknown as Record<string, unknown>)[key])).map((f) => f.label);
  const notFound = FIELD_LABELS.filter(({ key }) => !isFilled((suggestion as unknown as Record<string, unknown>)[key])).map((f) => f.label);
  return { suggestion, filled, notFound, source, warnings };
}
