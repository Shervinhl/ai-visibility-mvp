/**
 * Business fact list (Part B1). Stored as a versioned, immutable record.
 * Every AI answer check (Part C) and checks A6, A7, A12 compare against this list.
 */

export interface PriceFact {
  plan: string;
  /** Numeric amount, e.g. 19 or 19.99. Use 0 for a free plan. */
  amount: number;
  /** ISO 4217 code, e.g. USD, CAD. */
  currency: string;
  /** e.g. "month", "year", "one-time". */
  period: string;
  /** The page that lists this price (needed for A7). */
  pageUrl?: string;
}

export interface ProductFact {
  name: string;
  description: string;
}

export interface ContactFact {
  /** Contact page URL. Enough on its own. */
  url?: string;
  email?: string;
  phone?: string;
}

export interface Homonym {
  /** Name of the other organization with the same or similar name. */
  name: string;
  /** Words that indicate the answer is about the other organization (e.g. "plumbing", "Ohio"). */
  contextTerms: string[];
}

export interface FactList {
  businessName: string;
  /** Short names, product names, common misspellings that count as a mention. */
  aliases: string[];
  /** Homepage URL. Required: checks start here. */
  website: string;
  /** One paragraph. */
  whatItDoes: string;
  /**
   * A short phrase (3 to 10 words) that describes what the business does, exactly as written on the site.
   * Used by A6 to confirm "what you do" is real text. If missing, that part of A6 is NOT_ASSESSED.
   */
  whatItDoesPhrase?: string;
  /** Product category used in question generation, e.g. "AI video clipping tool". */
  productCategory: string;
  products: ProductFact[];
  /** One line per buyer type. */
  buyers: string[];
  /** Locations, e.g. "Toronto, ON, Canada". The first comma part is treated as the city. */
  locations: string[];
  serviceArea?: string;
  prices: PriceFact[];
  contact: ContactFact;
  competitors: string[];
  /** Up to 20 URLs. If empty, key pages come from the sitemap. */
  keyPages: string[];
  /** Client confirmation for A12. false = this business type does not use structured data. Default true. */
  usesStructuredData?: boolean;
  /** Set true if the business name is a common word (e.g. "Notion", "Flow"); unanchored mentions go to review. */
  nameIsCommonWord?: boolean;
  /** Other organizations with the same name. Mentions near their context terms are AMBIGUOUS. */
  homonyms?: Homonym[];
}

export interface FactValidationIssue {
  field: string;
  problem: string;
}

const MAX_PRODUCTS = 10;
const MAX_COMPETITORS = 10;

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validates a fact list. Returns an empty array when valid. maxKeyPages comes from config. */
export function validateFactList(input: unknown, maxKeyPages: number): FactValidationIssue[] {
  const issues: FactValidationIssue[] = [];
  if (typeof input !== "object" || input === null) return [{ field: "(root)", problem: "must be an object" }];
  const f = input as Partial<FactList>;
  const req = (field: keyof FactList, ok: boolean, problem: string) => {
    if (!ok) issues.push({ field, problem });
  };
  req("businessName", typeof f.businessName === "string" && f.businessName.trim().length > 0, "required");
  req("website", isHttpUrl(f.website), "must be an http(s) URL");
  req("whatItDoes", typeof f.whatItDoes === "string" && f.whatItDoes.trim().length > 0, "required (one paragraph)");
  req("productCategory", typeof f.productCategory === "string" && f.productCategory.trim().length > 0, "required");
  req("aliases", Array.isArray(f.aliases) && f.aliases.every((a) => typeof a === "string"), "must be a list of strings");
  req("buyers", Array.isArray(f.buyers) && f.buyers.length > 0 && f.buyers.every((b) => typeof b === "string" && b.trim() !== ""), "at least one buyer type");
  req("locations", Array.isArray(f.locations) && f.locations.every((l) => typeof l === "string"), "must be a list of strings");
  req("competitors", Array.isArray(f.competitors) && f.competitors.length <= MAX_COMPETITORS, `list of up to ${MAX_COMPETITORS}`);
  req("keyPages", Array.isArray(f.keyPages) && f.keyPages.length <= maxKeyPages && f.keyPages.every(isHttpUrl), `list of up to ${maxKeyPages} http(s) URLs`);
  req(
    "products",
    Array.isArray(f.products) && f.products.length <= MAX_PRODUCTS && f.products.every((p) => p && typeof p.name === "string" && typeof p.description === "string"),
    `list of up to ${MAX_PRODUCTS} {name, description}`
  );
  req(
    "prices",
    Array.isArray(f.prices) &&
      f.prices.every((p) => p && typeof p.plan === "string" && typeof p.amount === "number" && Number.isFinite(p.amount) && typeof p.currency === "string" && typeof p.period === "string" && (p.pageUrl === undefined || isHttpUrl(p.pageUrl))),
    "list of {plan, amount (number), currency, period, pageUrl?}"
  );
  req("contact", typeof f.contact === "object" && f.contact !== null, "required object {url?, email?, phone?}");
  if (f.contact && typeof f.contact === "object") {
    if (f.contact.url !== undefined && !isHttpUrl(f.contact.url)) issues.push({ field: "contact.url", problem: "must be an http(s) URL" });
  }
  if (f.homonyms !== undefined) {
    req("homonyms", Array.isArray(f.homonyms) && f.homonyms.every((h) => h && typeof h.name === "string" && Array.isArray(h.contextTerms)), "list of {name, contextTerms[]}");
  }
  return issues;
}

/** Applies defaults so downstream code never sees undefined lists. */
export function normalizeFactList(f: FactList): FactList {
  return {
    ...f,
    businessName: f.businessName.trim(),
    aliases: (f.aliases ?? []).map((a) => a.trim()).filter(Boolean),
    products: f.products ?? [],
    buyers: (f.buyers ?? []).map((b) => b.trim()).filter(Boolean),
    locations: (f.locations ?? []).map((l) => l.trim()).filter(Boolean),
    prices: f.prices ?? [],
    contact: f.contact ?? {},
    competitors: (f.competitors ?? []).map((c) => c.trim()).filter(Boolean),
    keyPages: f.keyPages ?? [],
    homonyms: f.homonyms ?? [],
    usesStructuredData: f.usesStructuredData ?? true,
    nameIsCommonWord: f.nameIsCommonWord ?? false,
  };
}
