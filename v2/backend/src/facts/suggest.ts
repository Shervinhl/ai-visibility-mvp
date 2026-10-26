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

/** Fetch one page for suggestions. Robots.txt is checked first. Only GET, one page, bounded time. */
export async function fetchForSuggest(website: string): Promise<{ finalUrl: string; html: string }> {
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
  if (robots && robots.status === 200) {
    const decision = isAllowed(parseRobots(String(robots.data ?? "")), TOKEN, url.pathname + url.search);
    if (!decision.allowed) throw new SuggestError("The site's robots.txt does not allow this tool to read the homepage. Ask the site owner or fill the fields by hand.");
  }
  const res = await axios.get(url.toString(), { timeout: 15000, maxRedirects: 3, validateStatus: () => true, responseType: "text", headers: { "User-Agent": SUGGEST_USER_AGENT, Accept: "text/html" } });
  if (res.status !== 200) throw new SuggestError(`The homepage returned HTTP ${res.status}, so it could not be read.`);
  return { finalUrl: res.request?.res?.responseUrl ?? url.toString(), html: String(res.data ?? "") };
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

/** Fill every field the AI or the page can supply. Anything else is reported as not found. */
export async function suggestFacts(website: string, generator: TextGenerator | null): Promise<SuggestResult> {
  const { finalUrl, html } = await fetchForSuggest(website);
  const base = metadataSuggestion(html, finalUrl);
  const warnings: string[] = [];
  let suggestion: FactSuggestion = { ...base, products: [], buyers: [], locations: [], aliases: [], productCategory: "", prices: [] };
  let source: SuggestResult["source"] = "page-metadata";
  if (generator) {
    try {
      const reply = await generator.generate(PROMPT(finalUrl, visibleText(html).slice(0, MAX_TEXT)));
      const ai = parseAiSuggestion(reply);
      if (ai) {
        suggestion = { ...suggestion };
        for (const { key } of FIELD_LABELS) {
          const v = ai[key];
          if (isFilled(v)) (suggestion as unknown as Record<string, unknown>)[key] = v;
        }
        source = "ai";
      } else {
        warnings.push("The AI reply could not be read, so only page metadata was used.");
      }
    } catch (e) {
      warnings.push(`The AI could not be reached (${(e as Error).message}), so only page metadata was used.`);
    }
  } else {
    warnings.push("No AI key is configured on the server, so only facts written in the page metadata were filled. Set ANTHROPIC_API_KEY (or another provider key) to let the AI read the whole page.");
  }
  const filled = FIELD_LABELS.filter(({ key }) => isFilled((suggestion as unknown as Record<string, unknown>)[key])).map((f) => f.label);
  const notFound = FIELD_LABELS.filter(({ key }) => !isFilled((suggestion as unknown as Record<string, unknown>)[key])).map((f) => f.label);
  return { suggestion, filled, notFound, source, warnings };
}
