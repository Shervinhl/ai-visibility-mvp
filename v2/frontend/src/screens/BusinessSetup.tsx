import { useEffect, useState } from "react";
import { api, BusinessDetail, errorText, FactList, fmtDate } from "../api";
import { Notice, Section } from "../components/ui";

interface Form {
  businessName: string;
  aliases: string;
  website: string;
  whatItDoes: string;
  whatItDoesPhrase: string;
  productCategory: string;
  products: string;
  buyers: string;
  locations: string;
  serviceArea: string;
  prices: string;
  contactUrl: string;
  contactEmail: string;
  contactPhone: string;
  competitors: string;
  keyPages: string;
  usesStructuredData: boolean;
  nameIsCommonWord: boolean;
  homonyms: string;
}

type TextKey = Exclude<keyof Form, "usesStructuredData" | "nameIsCommonWord">;

/** Fields that must be filled before the fact list can be saved. The contact rule is in validate(). */
const REQUIRED: TextKey[] = ["businessName", "website", "whatItDoes", "productCategory", "buyers"];

const EMPTY: Form = {
  businessName: "",
  aliases: "",
  website: "",
  whatItDoes: "",
  whatItDoesPhrase: "",
  productCategory: "",
  products: "",
  buyers: "",
  locations: "",
  serviceArea: "",
  prices: "",
  contactUrl: "",
  contactEmail: "",
  contactPhone: "",
  competitors: "",
  keyPages: "",
  usesStructuredData: true,
  nameIsCommonWord: false,
  homonyms: "",
};

interface SuggestResponse {
  suggestion: {
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
  };
  filled: string[];
  notFound: string[];
  source: "ai" | "page-metadata";
  warnings: string[];
}

const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
const cells = (line: string) => line.split("|").map((x) => x.trim());

const isUrl = (s: string) => {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

function toForm(f: FactList): Form {
  return {
    businessName: f.businessName,
    aliases: f.aliases.join("\n"),
    website: f.website,
    whatItDoes: f.whatItDoes,
    whatItDoesPhrase: f.whatItDoesPhrase ?? "",
    productCategory: f.productCategory,
    products: f.products.map((p) => `${p.name} | ${p.description}`).join("\n"),
    buyers: f.buyers.join("\n"),
    locations: f.locations.join("\n"),
    serviceArea: f.serviceArea ?? "",
    prices: f.prices.map((p) => [p.plan, p.amount, p.currency, p.period, p.pageUrl ?? ""].join(" | ")).join("\n"),
    contactUrl: f.contact.url ?? "",
    contactEmail: f.contact.email ?? "",
    contactPhone: f.contact.phone ?? "",
    competitors: f.competitors.join("\n"),
    keyPages: f.keyPages.join("\n"),
    usesStructuredData: f.usesStructuredData ?? true,
    nameIsCommonWord: f.nameIsCommonWord ?? false,
    homonyms: (f.homonyms ?? []).map((h) => `${h.name} | ${h.contextTerms.join(", ")}`).join("\n"),
  };
}

/** Problems per field. Empty object = the form can be saved. */
function validate(f: Form): Partial<Record<TextKey, string>> {
  const e: Partial<Record<TextKey, string>> = {};
  if (!f.businessName.trim()) e.businessName = "Required: the business name.";
  if (!f.website.trim()) e.website = "Required: the homepage address.";
  else if (!isUrl(f.website)) e.website = "Enter a full address, for example https://www.example.com/";
  if (!f.whatItDoes.trim()) e.whatItDoes = "Required: one paragraph about what the business does.";
  if (!f.productCategory.trim()) e.productCategory = "Required: the product category, for example “AI video clipping tool”.";
  if (lines(f.buyers).length === 0) e.buyers = "Required: at least one buyer type.";
  if (!f.contactUrl.trim() && !f.contactEmail.trim() && !f.contactPhone.trim()) {
    e.contactUrl = "Required: a contact page URL, email or phone (at least one).";
  } else if (f.contactUrl.trim() && !isUrl(f.contactUrl)) {
    e.contactUrl = "Enter a full URL, for example https://www.example.com/contact";
  }
  if (f.contactEmail.trim() && !isEmail(f.contactEmail)) e.contactEmail = "Enter a valid email address.";
  const badKey = lines(f.keyPages).findIndex((u) => !isUrl(u));
  if (badKey >= 0) e.keyPages = `Line ${badKey + 1} is not a full URL.`;
  const badPrice = lines(f.prices).findIndex((l) => {
    const [plan, amount, currency, period] = cells(l);
    return !plan || !Number.isFinite(Number((amount ?? "").replace(/[^0-9.]/g, ""))) || !currency || !period;
  });
  if (badPrice >= 0) e.prices = `Line ${badPrice + 1} needs: plan | amount | currency | period | page URL`;
  return e;
}

function toFacts(f: Form): FactList {
  const prices = lines(f.prices).map((l) => {
    const [plan, amount, currency, period, pageUrl] = cells(l);
    const n = Number((amount ?? "").replace(/[^0-9.]/g, ""));
    return { plan: plan ?? "", amount: n, currency: (currency ?? "").toUpperCase(), period: period ?? "", ...(pageUrl ? { pageUrl } : {}) };
  });
  return {
    businessName: f.businessName.trim(),
    aliases: lines(f.aliases),
    website: f.website.trim(),
    whatItDoes: f.whatItDoes.trim(),
    ...(f.whatItDoesPhrase.trim() ? { whatItDoesPhrase: f.whatItDoesPhrase.trim() } : {}),
    productCategory: f.productCategory.trim(),
    products: lines(f.products).map((l) => {
      const [name, description] = cells(l);
      return { name: name ?? "", description: description ?? "" };
    }),
    buyers: lines(f.buyers),
    locations: lines(f.locations),
    ...(f.serviceArea.trim() ? { serviceArea: f.serviceArea.trim() } : {}),
    prices,
    contact: {
      ...(f.contactUrl.trim() ? { url: f.contactUrl.trim() } : {}),
      ...(f.contactEmail.trim() ? { email: f.contactEmail.trim() } : {}),
      ...(f.contactPhone.trim() ? { phone: f.contactPhone.trim() } : {}),
    },
    competitors: lines(f.competitors),
    keyPages: lines(f.keyPages),
    usesStructuredData: f.usesStructuredData,
    nameIsCommonWord: f.nameIsCommonWord,
    homonyms: lines(f.homonyms).map((l) => {
      const [name, terms] = cells(l);
      return { name: name ?? "", contextTerms: (terms ?? "").split(",").map((t) => t.trim()).filter(Boolean) };
    }),
  };
}

/** Fill only the fields that are still empty, so anything the user typed is kept. */
function fillEmpty(f: Form, s: SuggestResponse["suggestion"]): Form {
  const next = { ...f };
  const put = (k: TextKey, v: string) => {
    if (!next[k].trim() && v.trim()) next[k] = v;
  };
  put("businessName", s.businessName);
  put("aliases", s.aliases.join("\n"));
  put("whatItDoes", s.whatItDoes);
  put("productCategory", s.productCategory);
  put("products", s.products.map((p) => `${p.name} | ${p.description}`).join("\n"));
  put("buyers", s.buyers.join("\n"));
  put("locations", s.locations.join("\n"));
  put("prices", s.prices.map((p) => [p.plan, p.amount, p.currency, p.period, p.pageUrl].join(" | ")).join("\n"));
  put("contactUrl", s.contactUrl);
  put("contactEmail", s.contactEmail);
  put("contactPhone", s.contactPhone);
  return next;
}

function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-label="required">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export default function BusinessSetup({ detail, reviewer, onSaved }: { detail: BusinessDetail | null; reviewer: string; onSaved: (id: string) => Promise<void> }) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<TextKey, boolean>>>({});

  useEffect(() => {
    setForm(detail ? toForm(detail.factList.content) : EMPTY);
    setMsg(null);
    setSubmitted(false);
    setTouched({});
  }, [detail]);

  const errors = validate(form);
  /** A problem is shown in red once the user has left the field or tried to save. */
  const showError = (k: TextKey) => (submitted || !!touched[k]) && !!errors[k];
  const borderFor = (k: TextKey) => (showError(k) ? "input border-red-500 ring-1 ring-red-500 focus:border-red-500" : "input");
  const errText = (k: TextKey) => (showError(k) ? errors[k] : undefined);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const touch = (k: TextKey) => setTouched((t) => ({ ...t, [k]: true }));

  const text = (k: TextKey, rows?: number, placeholder?: string) =>
    rows ? (
      <textarea className={`${borderFor(k)} font-mono text-xs`} rows={rows} placeholder={placeholder} value={form[k]} onChange={(e) => set(k, e.target.value as never)} onBlur={() => touch(k)} aria-invalid={showError(k)} />
    ) : (
      <input className={borderFor(k)} placeholder={placeholder} value={form[k]} onChange={(e) => set(k, e.target.value as never)} onBlur={() => touch(k)} aria-invalid={showError(k)} />
    );

  const fillFromWebsite = async () => {
    if (!form.website.trim() || !isUrl(form.website)) {
      setTouched((t) => ({ ...t, website: true }));
      setMsg({ kind: "error", text: "Enter the homepage address first, for example https://www.example.com/." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post<SuggestResponse>("/facts/suggest", { website: form.website.trim() });
      setForm((f) => fillEmpty(f, data.suggestion));
      const from = data.source === "ai" ? "the AI reading your site" : "the page details (no AI key is set)";
      const missing = data.notFound.length ? ` Still empty, please enter: ${data.notFound.join(", ")}.` : "";
      const warn = data.warnings.length ? ` ${data.warnings.join(" ")}` : "";
      setMsg({ kind: "info", text: `Filled ${data.filled.length} field(s) from ${from}. Fields you had already typed were kept. You can change any field.${missing}${warn}` });
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setSubmitted(true);
    const problems = validate(form);
    if (Object.keys(problems).length) {
      setMsg({ kind: "error", text: "Fix the fields with a red border. Required fields are marked *." });
      return;
    }
    if (reviewer.trim().length < 2) {
      setMsg({ kind: "error", text: "Enter your name at the top (it is recorded as the approver of this fact list)." });
      return;
    }
    const facts = toFacts(form);
    setBusy(true);
    try {
      if (detail) {
        const { data } = await api.put<{ factListVersion: number }>(`/businesses/${detail.business.id}/fact-list`, { facts, approvedBy: reviewer });
        setMsg({ kind: "info", text: `Saved as fact list version ${data.factListVersion}. Earlier results stay linked to the version they used.` });
        await onSaved(detail.business.id);
      } else {
        const { data } = await api.post<{ business: { id: string } }>("/businesses", { facts, approvedBy: reviewer });
        setMsg({ kind: "info", text: "Business created with fact list version 1." });
        await onSaved(data.business.id);
      }
    } catch (e) {
      setMsg({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const req = (k: TextKey) => REQUIRED.includes(k);
  const contactErr = errText("contactUrl") ?? errText("contactEmail");

  return (
    <Section
      title={detail ? `Business setup: ${detail.business.name}` : "Business setup: new business"}
      subtitle={detail ? `Current fact list version ${detail.factList.version}, approved by ${detail.factList.approvedBy} on ${fmtDate(detail.factList.approvedAt)}. Saving creates a new version.` : "Fill in the business profile. It is stored as a versioned fact list that every check and AI answer is compared with."}
      actions={
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={busy} onClick={fillFromWebsite}>
            Fill all fields from my website
          </button>
          <button className="btn" disabled={busy} onClick={save}>
            {detail ? "Save as new version" : "Create business"}
          </button>
        </div>
      }
    >
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <p className="text-sm text-slate-500">
        Fields marked <span className="text-red-600">*</span> are required. Fields with a problem have a red border.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="font-semibold">Profile</h3>
          <Field label="Business name" required={req("businessName")} error={errText("businessName")}>
            {text("businessName")}
          </Field>
          <Field label="Approved aliases" hint="One per line: short names, product names, common misspellings.">{text("aliases", 3)}</Field>
          <Field label="Website (homepage URL)" required={req("website")} error={errText("website")}>
            {text("website", undefined, "https://www.example.com/")}
          </Field>
          <Field label="What the business does" required={req("whatItDoes")} hint="One paragraph." error={errText("whatItDoes")}>
            {text("whatItDoes", 4)}
          </Field>
          <Field label="Short phrase from your site" hint="3 to 10 words copied from your homepage that say what you do. Used by check A6.">{text("whatItDoesPhrase")}</Field>
          <Field label="Product category" required={req("productCategory")} hint='Used in generated questions, e.g. "AI video clipping tool".' error={errText("productCategory")}>
            {text("productCategory")}
          </Field>
          <Field label="Products or services" hint="Up to 10, one per line: Name | one-line description">{text("products", 4)}</Field>
          <Field label="Buyer types" required={req("buyers")} hint="One per line." error={errText("buyers")}>
            {text("buyers", 3)}
          </Field>
        </div>
        <div className="card space-y-3">
          <h3 className="font-semibold">Facts to check</h3>
          <Field label="Locations" hint='One per line, e.g. "Toronto, ON, Canada". The first part is treated as the city.'>{text("locations", 2)}</Field>
          <Field label="Service area">{text("serviceArea")}</Field>
          <Field label="Prices or plans" hint="One per line: Plan | amount | currency | period | page URL that lists it. Leave empty if you list no prices." error={errText("prices")}>
            {text("prices", 3, "Pro | 29 | USD | month | https://www.example.com/pricing")}
          </Field>
          <div className="space-y-1">
            <span className="label">
              Contact (at least one) <span className="text-red-600">*</span>
            </span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Field label="Contact page URL" error={contactErr && !errText("contactEmail") ? contactErr : undefined}>{text("contactUrl")}</Field>
              <Field label="Contact email" error={errText("contactEmail")}>{text("contactEmail")}</Field>
              <Field label="Contact phone">{text("contactPhone")}</Field>
            </div>
          </div>
          <Field label="Competitors" hint="Optional, up to 10, one per line.">{text("competitors", 3)}</Field>
          <Field label="Key pages" hint="Up to 20 URLs, one per line. If empty, key pages come from the sitemap." error={errText("keyPages")}>
            {text("keyPages", 5)}
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.usesStructuredData} onChange={(e) => set("usesStructuredData", e.target.checked)} />
            This business type uses structured data (uncheck to mark check A12 as not applicable)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.nameIsCommonWord} onChange={(e) => set("nameIsCommonWord", e.target.checked)} />
            Our name is a common word (unanchored mentions go to human review)
          </label>
          <Field label="Other organizations with the same name" hint="Optional, one per line: Name | words that point to them (comma separated)">{text("homonyms", 2)}</Field>
        </div>
      </div>
      {detail && (
        <div className="card text-sm">
          <h3 className="mb-2 font-semibold">Fact list versions</h3>
          <ul className="space-y-1">
            {detail.factListVersions.map((v) => (
              <li key={v.version}>
                v{v.version} · approved by {v.approvedBy} · {fmtDate(v.approvedAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
