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

const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
const cells = (line: string) => line.split("|").map((x) => x.trim());

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

function toFacts(f: Form): { facts: FactList; problems: string[] } {
  const problems: string[] = [];
  const prices = lines(f.prices).map((l, i) => {
    const [plan, amount, currency, period, pageUrl] = cells(l);
    const n = Number((amount ?? "").replace(/[^0-9.]/g, ""));
    if (!plan || !Number.isFinite(n) || !currency || !period) problems.push(`Price line ${i + 1} needs: plan | amount | currency | period | page URL`);
    return { plan: plan ?? "", amount: n, currency: (currency ?? "").toUpperCase(), period: period ?? "", ...(pageUrl ? { pageUrl } : {}) };
  });
  const facts: FactList = {
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
  return { facts, problems };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export default function BusinessSetup({ detail, reviewer, onSaved }: { detail: BusinessDetail | null; reviewer: string; onSaved: (id: string) => Promise<void> }) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    setForm(detail ? toForm(detail.factList.content) : EMPTY);
    setMsg(null);
  }, [detail]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (k: keyof Form, rows?: number, placeholder?: string) =>
    rows ? (
      <textarea className="input font-mono text-xs" rows={rows} placeholder={placeholder} value={form[k] as string} onChange={(e) => set(k, e.target.value as never)} />
    ) : (
      <input className="input" placeholder={placeholder} value={form[k] as string} onChange={(e) => set(k, e.target.value as never)} />
    );

  const save = async () => {
    const { facts, problems } = toFacts(form);
    if (problems.length) {
      setMsg({ kind: "error", text: problems.join(". ") });
      return;
    }
    if (reviewer.trim().length < 2) {
      setMsg({ kind: "error", text: "Enter your name at the top (it is recorded as the approver of this fact list)." });
      return;
    }
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

  return (
    <Section
      title={detail ? `Business setup: ${detail.business.name}` : "Business setup: new business"}
      subtitle={detail ? `Current fact list version ${detail.factList.version}, approved by ${detail.factList.approvedBy} on ${fmtDate(detail.factList.approvedAt)}. Saving creates a new version.` : "Fill in the business profile. It is stored as a versioned fact list that every check and AI answer is compared with."}
      actions={
        <button className="btn" disabled={busy} onClick={save}>
          {detail ? "Save as new version" : "Create business"}
        </button>
      }
    >
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="font-semibold">Profile</h3>
          <Field label="Business name">{text("businessName")}</Field>
          <Field label="Approved aliases" hint="One per line: short names, product names, common misspellings.">{text("aliases", 3)}</Field>
          <Field label="Website (homepage URL)">{text("website", undefined, "https://www.example.com/")}</Field>
          <Field label="What the business does" hint="One paragraph.">{text("whatItDoes", 4)}</Field>
          <Field label="Short phrase from your site" hint="3 to 10 words copied from your homepage that say what you do. Used by check A6.">{text("whatItDoesPhrase")}</Field>
          <Field label="Product category" hint='Used in generated questions, e.g. "AI video clipping tool".'>{text("productCategory")}</Field>
          <Field label="Products or services" hint="Up to 10, one per line: Name | one-line description">{text("products", 4)}</Field>
          <Field label="Buyer types" hint="One per line.">{text("buyers", 3)}</Field>
        </div>
        <div className="card space-y-3">
          <h3 className="font-semibold">Facts to check</h3>
          <Field label="Locations" hint='One per line, e.g. "Toronto, ON, Canada". The first part is treated as the city.'>{text("locations", 2)}</Field>
          <Field label="Service area">{text("serviceArea")}</Field>
          <Field label="Prices or plans" hint="One per line: Plan | amount | currency | period | page URL that lists it. Leave empty if you list no prices.">{text("prices", 3, "Pro | 29 | USD | month | https://www.example.com/pricing")}</Field>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Field label="Contact page URL">{text("contactUrl")}</Field>
            <Field label="Contact email">{text("contactEmail")}</Field>
            <Field label="Contact phone">{text("contactPhone")}</Field>
          </div>
          <Field label="Competitors" hint="Optional, up to 10, one per line.">{text("competitors", 3)}</Field>
          <Field label="Key pages" hint="Up to 20 URLs, one per line. If empty, key pages come from the sitemap.">{text("keyPages", 5)}</Field>
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
