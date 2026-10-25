/**
 * Flowjin site fixtures.
 *
 * IMPORTANT: these are hand-built fixtures modelled on Flowjin (an AI tool that turns long videos into
 * short clips). They are NOT captures of the live flowjin.com site: the repo had no Flowjin fixture files
 * and the live site was not reachable from the build environment. Facts the team has not confirmed
 * (location, prices) are deliberately left out of the fact list so the example run shows the
 * NOT_ASSESSED / NOT_APPLICABLE behaviour honestly. Replace with real captures when available.
 */
import { FactList } from "../../../src/facts/types";
import { FakeRoute } from "../../helpers/fakeTransport";

export const FLOWJIN = "https://www.flowjin.com";
const u = (p: string) => `${FLOWJIN}${p}`;

const nav = `<nav><a href="/">Home</a> <a href="/features">Features</a> <a href="/pricing">Pricing</a> <a href="/blog">Blog</a> <a href="/about">About</a></nav>`;
const footer = `<footer><a href="/contact">Contact us</a> <a href="/privacy">Privacy</a> <a href="/app/login" rel="nofollow">Log in</a></footer>`;

const orgJsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Flowjin",
  url: FLOWJIN,
});

const homepage = `<!doctype html><html lang="en"><head>
<title>Flowjin - Turn long videos into short clips with AI</title>
<meta name="description" content="Flowjin turns long videos and podcasts into short, captioned clips for social media using AI. Upload once, get clips in minutes.">
<link rel="canonical" href="${FLOWJIN}/">
<script type="application/ld+json">${orgJsonLd}</script>
<script src="/static/app.js" defer></script>
</head><body>
<header>${nav}<img src="/logo.png" alt="Flowjin logo"></header>
<main>
<h1>Turn long videos into viral short clips</h1>
<p>Flowjin uses AI to find the best moments in your long videos and podcasts and turns them into short clips with captions, ready for TikTok, Instagram Reels and YouTube Shorts.</p>
<p>Upload a video or paste a link. Flowjin transcribes it, picks highlight moments, adds captions and resizes for each platform.</p>
<div id="root"></div>
</main>
${footer}
</body></html>`;

const features = `<!doctype html><html><head>
<title>Features | Flowjin</title>
<link rel="canonical" href="${FLOWJIN}/features">
</head><body>${nav}
<main><h1>Features</h1>
<h2>AI highlight detection</h2><p>Flowjin scores every sentence of your transcript and suggests the moments most likely to hold attention.</p>
<h2>Automatic captions</h2><p>Burned-in captions in many languages, with styles you can edit.</p>
<h2>Resize for every platform</h2><p>One click exports vertical, square and horizontal versions.</p>
</main>${footer}</body></html>`;

// Pricing table is rendered by JavaScript: raw HTML has no plan amounts. JSON-LD has a syntax error.
const pricing = `<!doctype html><html><head>
<title>Pricing | Flowjin</title>
<meta name="description" content="Compare Flowjin plans for creators, podcasters and teams. Start free and upgrade when you need more clips.">
<link rel="canonical" href="${FLOWJIN}/pricing">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Flowjin",}</script>
</head><body>${nav}
<main><h1>Simple pricing</h1><div id="pricing-table" data-src="/api/plans"></div></main>${footer}</body></html>`;

// About page canonical points at the homepage (a common template mistake).
const about = `<!doctype html><html><head>
<title>About Flowjin</title>
<meta name="description" content="Flowjin builds AI tools that help creators and podcasters repurpose long videos into short clips for social media.">
<link rel="canonical" href="${FLOWJIN}/">
</head><body>${nav}
<main><h1>About us</h1><p>Flowjin was started to help creators get more out of every long video. Our team builds AI that finds, cuts and captions the best moments.</p></main>${footer}</body></html>`;

const contact = `<!doctype html><html><head>
<title>Contact Flowjin</title>
<meta name="description" content="Questions about Flowjin? Contact our team for support, partnerships or billing help and we will reply within one business day.">
<link rel="canonical" href="${FLOWJIN}/contact">
</head><body>${nav}
<main><h1>Contact</h1><p>Email us at <a href="mailto:support@flowjin.com">support@flowjin.com</a>.</p></main>${footer}</body></html>`;

const blogIndex = `<!doctype html><html><head><title>Blog | Flowjin</title><link rel="canonical" href="${FLOWJIN}/blog"></head><body>${nav}
<main><h1>Blog</h1><ul><li><a href="/blog/how-to-clip-a-podcast">How to clip a podcast for social media</a></li></ul></main>${footer}</body></html>`;

// Two H1s (theme heading + post title).
const blogPost = `<!doctype html><html><head>
<title>How to clip a podcast for social media | Flowjin</title>
<meta name="description" content="A step-by-step guide to turning a long podcast episode into short clips for TikTok, Reels and Shorts, with tips on hooks and captions.">
<link rel="canonical" href="${FLOWJIN}/blog/how-to-clip-a-podcast">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"How to clip a podcast for social media"}</script>
</head><body>${nav}
<h1>Flowjin Blog</h1>
<article><h1>How to clip a podcast for social media</h1>
<p>Start with the transcript. Look for moments where a guest makes a strong claim, tells a short story or answers a common question.</p>
<p>Keep clips between 20 and 60 seconds, add captions, and put the hook in the first two seconds.</p></article>${footer}</body></html>`;

const robots = `User-agent: *
Allow: /
Disallow: /app/

Sitemap: ${FLOWJIN}/sitemap.xml
`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${FLOWJIN}/</loc></url>
  <url><loc>${FLOWJIN}/features</loc></url>
  <url><loc>${FLOWJIN}/pricing</loc></url>
  <url><loc>${FLOWJIN}/about</loc></url>
  <url><loc>${FLOWJIN}/contact</loc></url>
</urlset>`;

export const flowjinRoutes: Record<string, FakeRoute> = {
  [u("/robots.txt")]: { status: 200, headers: { "content-type": "text/plain" }, body: robots },
  [u("/sitemap.xml")]: { status: 200, headers: { "content-type": "application/xml" }, body: sitemap },
  [u("/")]: { status: 200, body: homepage },
  [u("/features")]: { status: 200, body: features },
  [u("/pricing")]: { status: 200, body: pricing },
  [u("/about")]: { status: 200, body: about },
  [u("/contact")]: { status: 200, body: contact },
  [u("/blog")]: { status: 200, body: blogIndex },
  [u("/blog/how-to-clip-a-podcast")]: { status: 200, body: blogPost },
};

/** Fact list for the example. Location and prices are intentionally empty: not confirmed by the team. */
export const flowjinFacts: FactList = {
  businessName: "Flowjin",
  aliases: ["Flowjin AI", "flowjin.com"],
  website: `${FLOWJIN}/`,
  whatItDoes:
    "Flowjin is an AI tool that turns long videos and podcasts into short, captioned clips for social media platforms such as TikTok, Instagram Reels and YouTube Shorts.",
  whatItDoesPhrase: "find the best moments in your long videos",
  productCategory: "AI video clipping tool",
  products: [
    { name: "AI highlight detection", description: "Finds the strongest moments in a long video" },
    { name: "Automatic captions", description: "Adds editable burned-in captions" },
  ],
  buyers: ["podcasters", "video creators", "social media managers"],
  locations: [],
  prices: [],
  contact: { url: `${FLOWJIN}/contact`, email: "support@flowjin.com" },
  competitors: ["Opus Clip", "Descript", "Vizard", "Klap"],
  keyPages: [u("/features"), u("/pricing"), u("/about"), u("/contact"), u("/blog/how-to-clip-a-podcast")],
  usesStructuredData: true,
  nameIsCommonWord: false,
  homonyms: [],
};
