/**
 * Static prerender for the blog + glossary.
 *
 * The app is a client-rendered Vite SPA, which means search engines that DO
 * run JavaScript (Google) can read it, but most AI crawlers (GPTBot,
 * PerplexityBot, ClaudeBot, Bytespider…) cannot — they read the raw HTML
 * only. This script runs AFTER `vite build` and writes a real static HTML
 * file for every blog post and glossary term, with:
 *   • page-specific <title>, description, canonical + Open Graph tags
 *   • the article/term JSON-LD (BlogPosting / DefinedTerm) inline
 *   • the full article text baked into #root so crawlers read every word
 *
 * It does this by cloning the built dist/index.html (which already carries
 * the hashed JS/CSS asset tags), so each prerendered page still boots the
 * full React app for human visitors — React simply re-renders #root on load.
 *
 * Vercel serves these static files for direct hits / crawlers because the
 * SPA catch-all rewrite in vercel.json is "afterFiles" (filesystem wins).
 *
 * Run via `npm run build` (chained) or `npm run prerender` on its own.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BLOG_POSTS, type BlogPost } from "../src/content/blog";
import { GLOSSARY_TERMS, type GlossaryTerm } from "../src/content/glossary";
import { SERVICE_LANDINGS, type ServiceLandingContent } from "../src/content/services";
import { FAQS } from "../src/components/household/faqData";

const DIST = join(process.cwd(), "dist");
const TEMPLATE_PATH = join(DIST, "index.html");
const ORIGIN = (process.env.VITE_SITE_URL || "https://vanojobs.com").replace(/\/+$/, "");

const template = readFileSync(TEMPLATE_PATH, "utf-8");
if (!template.includes('<div id="root">')) {
  throw new Error("prerender: dist/index.html has no #root — did `vite build` run first?");
}

// ── small helpers ───────────────────────────────────────────────────────────
const escAttr = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON-LD with <script>-breakout chars neutralised. */
const ldScript = (obj: unknown): string =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" });

const PRERENDER_STYLE = `<style id="vano-prerender-style">
.vano-pr{max-width:760px;margin:0 auto;padding:32px 20px;font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;line-height:1.65;color:#1f2937}
.vano-pr h1{font-size:2rem;line-height:1.2;margin:.4rem 0 1rem;color:#1a2340}
.vano-pr h2{font-size:1.4rem;margin:2rem 0 .5rem;color:#1a2340}
.vano-pr a{color:inherit;text-decoration:underline;text-decoration-color:rgba(26,35,64,.28);text-underline-offset:2px}
.vano-pr a:hover{color:#3a6b4f;text-decoration-color:#5a8a6a}
.vano-pr .eyebrow{text-transform:uppercase;letter-spacing:.06em;font-size:.8rem;font-weight:600;color:#3a6b4f;margin:0}
.vano-pr .meta{color:#6b7280;font-size:.9rem;margin:.25rem 0 1rem}
.vano-pr .summary{background:#f1f5f1;border-left:3px solid #5a8a6a;padding:.7rem 1rem;border-radius:.4rem;margin:1rem 0}
.vano-pr nav.crumbs,.vano-pr nav.top{font-size:.85rem;color:#6b7280;margin-bottom:1rem}
.vano-pr ul.cards{list-style:none;padding:0}
.vano-pr ul.cards li{margin:0 0 1.1rem}
.vano-pr footer{margin-top:3rem;border-top:1px solid #e5e7eb;padding-top:1rem;font-size:.85rem;color:#6b7280}
.vano-pr .faq{margin-top:2rem;border-bottom:1px solid #e5e7eb}
.vano-pr details{border-top:1px solid #e5e7eb}
.vano-pr summary{cursor:pointer;font-weight:600;padding:.7rem 0}
.vano-pr details>p{margin:0 0 .8rem;color:#374151}
</style>`;

const topNav = `<nav class="top"><a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/glossary">Glossary</a> · <a href="/join">Join as helper</a></nav>`;
const serviceLinks = SERVICE_LANDINGS.map((s) => `<a href="/${s.slug}">${escAttr(s.name)} in Galway</a>`).join(" · ");
const siteFooter = `<footer>VANO — same-day home help in Galway &amp; Ireland. ${serviceLinks} · <a href="/join">Join as a helper</a> · <a href="/blog">Blog</a> · <a href="/glossary">Glossary</a></footer>`;

interface PageSpec {
  outFile: string;
  title: string; // without the " | VANO" suffix
  description: string;
  canonical: string;
  ogType: "website" | "article";
  /** Absolute URL of the page's share image; falls back to the default og.png. */
  image?: string;
  jsonLd: unknown[];
  rootHtml: string;
}

/** Apply a page's metadata + body to the built shell and write it out. */
function emit(page: PageSpec): void {
  const fullTitle = `${page.title} | VANO`;
  let html = template;

  const sub = (re: RegExp, value: string) => {
    html = html.replace(re, (_m, p1: string, p2: string) => `${p1}${escAttr(value)}${p2}`);
  };

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escAttr(fullTitle)}</title>`);
  sub(/(<meta name="description" content=")[^"]*(")/, page.description);
  sub(/(<link rel="canonical" href=")[^"]*(")/, page.canonical);
  sub(/(<meta property="og:type" content=")[^"]*(")/, page.ogType);
  sub(/(<meta property="og:url" content=")[^"]*(")/, page.canonical);
  sub(/(<meta property="og:title" content=")[^"]*(")/, fullTitle);
  sub(/(<meta property="og:description" content=")[^"]*(")/, page.description);
  sub(/(<meta name="twitter:title" content=")[^"]*(")/, fullTitle);
  sub(/(<meta name="twitter:description" content=")[^"]*(")/, page.description);
  if (page.image) {
    sub(/(<meta property="og:image" content=")[^"]*(")/, page.image);
    sub(/(<meta name="twitter:image" content=")[^"]*(")/, page.image);
  }

  // The prerendered body is SEO scaffolding for crawlers that can't run JS.
  // Real browsers boot React, which re-renders #root — but for the ~100ms
  // between HTML paint and React mounting, the browser would PAINT this static
  // page first, then swap it for the app: a jarring "bounce to a different
  // page" (most visible on the homepage, static light SEO → navy hero).
  //
  // Fix: mark the fallback `hidden` so JS browsers never paint it (React clears
  // #root on mount regardless), while a <noscript> rule reveals it when
  // scripting is OFF. The markup stays in the raw HTML either way, so non-JS
  // crawlers (GPTBot, ClaudeBot, PerplexityBot…) still read every word.
  const noscriptReveal = `<noscript><style>.vano-pr[hidden]{display:block!important}</style></noscript>`;
  const headInjection = `${PRERENDER_STYLE}\n${noscriptReveal}\n${page.jsonLd.map(ldScript).join("\n")}\n</head>`;
  html = html.replace("</head>", headInjection);

  html = html.replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root"><div class="vano-pr" hidden>${page.rootHtml}</div></div>`);

  const outPath = join(DIST, page.outFile);
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, html, "utf-8");
}

// ── blog ─────────────────────────────────────────────────────────────────────
function blogPostPage(post: BlogPost): PageSpec {
  const url = `${ORIGIN}/blog/${post.slug}`;
  const related = post.related
    .map((s) => BLOG_POSTS.find((p) => p.slug === s))
    .filter((p): p is BlogPost => Boolean(p));

  const rootHtml = `
${topNav}
<article>
<nav class="crumbs"><a href="/">Home</a> / <a href="/blog">Blog</a></nav>
<p class="eyebrow">${escAttr(post.eyebrow)}</p>
<h1>${escAttr(post.title)}</h1>
<p class="meta">${fmtDate(post.datePublished)} · ${post.readingMins} min read · By ${escAttr(post.author)}</p>
<p class="summary"><strong>Quick answer:</strong> ${escAttr(post.summary)}</p>
${post.bodyHtml}
</article>
${post.faqs.length ? `<section class="faq"><h2>Frequently asked questions</h2>${post.faqs.map((f) => `<details><summary>${escAttr(f.q)}</summary><p>${escAttr(f.a)}</p></details>`).join("")}</section>` : ""}
${related.length ? `<section><h2>Keep reading</h2><ul class="cards">${related.map((r) => `<li><a href="/blog/${r.slug}">${escAttr(r.title)}</a><br><span>${escAttr(r.description)}</span></li>`).join("")}</ul></section>` : ""}
${siteFooter}`.trim();

  return {
    outFile: `blog/${post.slug}/index.html`,
    title: post.title,
    description: post.description,
    canonical: url,
    ogType: "article",
    image: `${ORIGIN}/og/blog/${post.slug}.png`,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.datePublished,
        dateModified: post.dateModified,
        author: { "@type": "Organization", name: "VANO", url: `${ORIGIN}/` },
        publisher: {
          "@type": "Organization",
          name: "VANO",
          logo: { "@type": "ImageObject", url: `${ORIGIN}/pwa-512x512.png` },
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        image: `${ORIGIN}/og/blog/${post.slug}.png`,
        keywords: post.keywords,
        articleSection: post.tags,
        inLanguage: "en-IE",
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${ORIGIN}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
      ...(post.faqs.length
        ? [
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: post.faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ]
        : []),
      ...(post.howTo && post.howTo.length
        ? [
            {
              "@context": "https://schema.org",
              "@type": "HowTo",
              name: post.title,
              description: post.summary,
              step: post.howTo.map((s, i) => ({
                "@type": "HowToStep",
                position: i + 1,
                name: s.name,
                text: s.text,
              })),
            },
          ]
        : []),
    ],
    rootHtml,
  };
}

function blogIndexPage(): PageSpec {
  const posts = [...BLOG_POSTS].sort((a, b) => +new Date(b.datePublished) - +new Date(a.datePublished));
  const description =
    "Tips, guides and honest takes on flexible student work, fair pay and same-day home help in Galway — from the team at Vano.";
  const rootHtml = `
${topNav}
<p class="eyebrow">The Vano Blog</p>
<h1>Flexible student work, fair pay &amp; home help in Galway</h1>
<p>${description}</p>
<ul class="cards">
${posts.map((p) => `<li><a href="/blog/${p.slug}">${escAttr(p.title)}</a><br><span>${escAttr(p.description)}</span></li>`).join("\n")}
</ul>
${siteFooter}`.trim();

  return {
    outFile: "blog/index.html",
    title: "Vano Blog — Student Work, Fair Pay & Home Help in Galway",
    description,
    canonical: `${ORIGIN}/blog`,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Blog",
        "@id": `${ORIGIN}/blog`,
        name: "Vano Blog",
        description,
        url: `${ORIGIN}/blog`,
        inLanguage: "en-IE",
        publisher: { "@type": "Organization", name: "VANO", url: `${ORIGIN}/` },
        blogPost: posts.map((p) => ({
          "@type": "BlogPosting",
          headline: p.title,
          url: `${ORIGIN}/blog/${p.slug}`,
          datePublished: p.datePublished,
          dateModified: p.dateModified,
        })),
      },
    ],
    rootHtml,
  };
}

// ── glossary ───────────────────────────────────────────────────────────────
function glossaryTermPage(term: GlossaryTerm): PageSpec {
  const url = `${ORIGIN}/glossary/${term.slug}`;
  const related = term.related
    .map((s) => GLOSSARY_TERMS.find((t) => t.slug === s))
    .filter((t): t is GlossaryTerm => Boolean(t));

  const rootHtml = `
${topNav}
<article>
<nav class="crumbs"><a href="/">Home</a> / <a href="/glossary">Glossary</a></nav>
<p class="eyebrow">${escAttr(term.category)}</p>
<h1>${escAttr(term.term)}</h1>
<p class="meta">${escAttr(term.short)}</p>
${term.bodyHtml}
</article>
${related.length ? `<section><h2>Related terms</h2><ul class="cards">${related.map((r) => `<li><a href="/glossary/${r.slug}">${escAttr(r.term)}</a></li>`).join("")}</ul></section>` : ""}
${siteFooter}`.trim();

  return {
    outFile: `glossary/${term.slug}/index.html`,
    title: `${term.term} — Vano Glossary`,
    description: term.short,
    canonical: url,
    ogType: "article",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "DefinedTerm",
        name: term.term,
        description: term.short,
        url,
        inDefinedTermSet: { "@type": "DefinedTermSet", name: "Vano Glossary", url: `${ORIGIN}/glossary` },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Glossary", item: `${ORIGIN}/glossary` },
          { "@type": "ListItem", position: 3, name: term.term, item: url },
        ],
      },
    ],
    rootHtml,
  };
}

function glossaryIndexPage(): PageSpec {
  const terms = [...GLOSSARY_TERMS].sort((a, b) => a.term.localeCompare(b.term));
  const description =
    "Plain-English definitions of the words you'll see around Vano — from pay-after-accept and Vano Pay to ATU, Eircode and Ireland's minimum wage — each explained in Vano terms.";
  const rootHtml = `
${topNav}
<p class="eyebrow">Glossary</p>
<h1>Every Vano term, in plain English</h1>
<p>${description}</p>
<ul class="cards">
${terms.map((t) => `<li><a href="/glossary/${t.slug}">${escAttr(t.term)}</a><br><span>${escAttr(t.short)}</span></li>`).join("\n")}
</ul>
${siteFooter}`.trim();

  return {
    outFile: "glossary/index.html",
    title: "Vano Glossary — Home Help & Student Work Terms, Explained",
    description,
    canonical: `${ORIGIN}/glossary`,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "DefinedTermSet",
        "@id": `${ORIGIN}/glossary`,
        name: "Vano Glossary",
        description,
        url: `${ORIGIN}/glossary`,
        inLanguage: "en-IE",
        hasDefinedTerm: terms.map((t) => ({
          "@type": "DefinedTerm",
          name: t.term,
          description: t.short,
          url: `${ORIGIN}/glossary/${t.slug}`,
        })),
      },
    ],
    rootHtml,
  };
}

// ── service landing pages (/cleaning-galway …) ─────────────────────────────
function servicePage(s: ServiceLandingContent): PageSpec {
  const url = `${ORIGIN}/${s.slug}`;
  const others = SERVICE_LANDINGS.filter((o) => o.slug !== s.slug);

  const rootHtml = `
${topNav}
<article>
<nav class="crumbs"><a href="/">Home</a> / ${escAttr(s.name)}</nav>
<p class="eyebrow">${escAttr(s.priceLabel)} · Galway · same-day</p>
<h1>${escAttr(s.h1)}</h1>
<p class="summary">${escAttr(s.intro)}</p>
<p><strong>${escAttr(s.priceLabel)}</strong> — ${escAttr(s.priceDetail)} <a href="/">Book now</a> — no payment until a helper accepts, money-back guarantee.</p>
<h2>What's included</h2>
<ul>${s.included.map((i) => `<li>${escAttr(i)}</li>`).join("")}</ul>
${s.body.map((b) => `<h2>${escAttr(b.heading)}</h2><p>${escAttr(b.text)}</p>`).join("\n")}
</article>
<section class="faq"><h2>Common questions</h2>${s.faqs.map((f) => `<details><summary>${escAttr(f.q)}</summary><p>${escAttr(f.a)}</p></details>`).join("")}</section>
<section><h2>More help in Galway</h2><ul class="cards">${others.map((o) => `<li><a href="/${o.slug}">${escAttr(o.title)}</a></li>`).join("")}</ul></section>
${siteFooter}`.trim();

  return {
    outFile: `${s.slug}/index.html`,
    title: s.title,
    description: s.description,
    canonical: url,
    ogType: "website",
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        name: `${s.name} — VANO`,
        description: s.description,
        serviceType: s.name,
        areaServed: { "@type": "City", name: "Galway", address: { "@type": "PostalAddress", addressCountry: "IE" } },
        provider: { "@type": "LocalBusiness", name: "VANO", url: `${ORIGIN}/` },
        offers: { "@type": "Offer", price: String(s.fromPriceEuro), priceCurrency: "EUR", url },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: s.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: s.name, item: url },
        ],
      },
    ],
    rootHtml,
  };
}

// ── homepage + /join ─────────────────────────────────────────────────────────
// The SPA shell's <head> already carries the right meta + LocalBusiness
// JSON-LD, but its #root is empty apart from a noscript stub — AI crawlers
// that don't run JS (GPTBot, PerplexityBot, ClaudeBot…) read nothing, even
// though robots.txt explicitly invites them. Bake the real copy in; React
// re-renders #root on load for human visitors, same as the blog pages.
function homePage(): PageSpec {
  const rootHtml = `
${topNav}
<h1>Hire a local student for help at home</h1>
<p class="summary">VANO matches you with an ID-verified local student for your home jobs in Galway — cleaning, laundry, dog walks and garden help. Same-day, from €15. You see your helper's name, photo and rating; your card is only ever charged the small booking fee, and only when a helper accepts. Money-back guarantee on the fee.</p>
<h2>What you can book</h2>
<ul class="cards">
${SERVICE_LANDINGS.map((s) => `<li><a href="/${s.slug}">${escAttr(s.name)} in Galway</a> — ${escAttr(s.priceLabel)}<br><span>${escAttr(s.description)}</span></li>`).join("\n")}
</ul>
<h2>How it works</h2>
<ul>
<li><strong>1. Say what you need</strong> — pick a job, add your phone and address. Takes about 30 seconds; no account needed.</li>
<li><strong>2. A verified student accepts</strong> — you see their name, photo and rating; your card is charged the small VANO booking fee only when they accept.</li>
<li><strong>3. Track it live, pay them directly</strong> — follow your helper on a live map, then pay them directly when the job's done (Revolut or cash). They keep 100% of the job price.</li>
</ul>
<h2>Why people trust VANO</h2>
<ul>
<li>Look for the blue ✓ — VANO Verified helpers have passed student-email and photo-ID checks</li>
<li>Every helper passes a free photo-ID check before their first job</li>
<li>You see exactly who's coming before any money moves</li>
<li>Money-back guarantee on the booking fee if it's not right</li>
</ul>
<section class="faq"><h2>Frequently asked questions</h2>${FAQS.map((f) => `<details><summary>${escAttr(f.q)}</summary><p>${escAttr(f.a)}</p></details>`).join("")}</section>
<p>Students: <a href="/join">earn money as a VANO helper</a> — flexible same-day jobs that pay above minimum wage after fees.</p>
${siteFooter}`.trim();

  return {
    outFile: "index.html",
    title: "Hire a local student for help at home — same-day in Galway",
    description:
      "Hire a trusted local student for cleaning, garden, dog walks, laundry & more. Same-day in Galway, from €15 — only charged when a helper accepts.",
    canonical: `${ORIGIN}/`,
    ogType: "website",
    jsonLd: [
      // LocalBusiness/WebSite already live in the static head — only the FAQ
      // schema (normally injected at runtime by react-helmet) needs baking.
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
    rootHtml,
  };
}

function joinPage(): PageSpec {
  const rootHtml = `
${topNav}
<h1>Earn money as a student helper in Galway — keep 100%</h1>
<p class="summary">Pick up same-day home help jobs near you — laundry runs, dog walks, cleaning and garden work. Customers pay you directly and you keep 100% of the job price (€18/hour on timed jobs), working only when it suits your timetable.</p>
<h2>How it works</h2>
<ul>
<li><strong>Join free in a few minutes</strong> — a short form with your photo and student details, then confirm your email with a 6-digit code and your account is live.</li>
<li><strong>One free ID check unlocks jobs</strong> — a 2-minute photo-ID check (free, via Stripe). Customers are promised every helper is ID-verified, so job offers only go out once you've passed it.</li>
<li><strong>Accept jobs near you</strong> — offers arrive by WhatsApp, text and your dashboard; take only the ones that suit you.</li>
<li><strong>Get paid on the spot</strong> — the customer pays you directly when the job's done (Revolut or cash) and you keep 100%. VANO's small booking fee is paid by the customer, never taken from your earnings.</li>
<li><strong>Optional blue tick</strong> — €2/month keeps the ✓ VANO Verified badge on your name and bumps you up the offer list. Cancel anytime; you never pay to get work.</li>
</ul>
<h2>What jobs pay</h2>
<ul>
<li>Time-based work (cleaning, garden) is priced at €18/hour — you keep the full €18, well above the Irish minimum wage.</li>
<li>Flat-rate errands (laundry €30 a bag, dog walks €15–20) are priced per task so a short job is still worth your trip.</li>
</ul>
<p><a href="/join">Apply now at vanojobs.com/join</a> — free to join, and job offers start as soon as your email and free ID check are done (both take minutes).</p>
${siteFooter}`.trim();

  return {
    outFile: "join/index.html",
    title: "Earn €18/hr as a student helper in Galway — keep 100%",
    description:
      "Same-day home help jobs near you — cleaning, laundry, dog walks & garden. €18/hr on timed jobs, customers pay you directly, you keep 100%. Join free.",
    canonical: `${ORIGIN}/join`,
    ogType: "website",
    jsonLd: [],
    rootHtml,
  };
}

// ── run ──────────────────────────────────────────────────────────────────────
const pages: PageSpec[] = [
  homePage(),
  joinPage(),
  blogIndexPage(),
  glossaryIndexPage(),
  ...SERVICE_LANDINGS.map(servicePage),
  ...BLOG_POSTS.map(blogPostPage),
  ...GLOSSARY_TERMS.map(glossaryTermPage),
];

for (const page of pages) emit(page);

// llms.txt — an emerging convention (llmstxt.org) that gives answer engines a
// clean, curated Markdown map of the site. Generated from the same content so
// it never drifts. Served as a static file at /llms.txt.
const llmsTxt = [
  "# VANO",
  "",
  "> Hire a local student for help at home — same-day in Galway, Ireland, from €15. Cleaning, laundry, garden help, dog walks and errands by ID-verified students. Booking is free: the card is only charged VANO's small booking fee when a helper accepts, and the customer pays the helper directly when the job's done — helpers keep 100% (€18/hr on timed jobs, above the Irish minimum wage).",
  "",
  "## Blog",
  ...BLOG_POSTS.map((p) => `- [${p.title}](${ORIGIN}/blog/${p.slug}): ${p.summary}`),
  "",
  "## Glossary",
  ...GLOSSARY_TERMS.map((t) => `- [${t.term}](${ORIGIN}/glossary/${t.slug}): ${t.short}`),
  "",
  "## Services",
  ...SERVICE_LANDINGS.map((s) => `- [${s.title}](${ORIGIN}/${s.slug}): ${s.description}`),
  "",
  "## Key pages",
  `- [Book same-day home help](${ORIGIN}/)`,
  `- [Join as a helper](${ORIGIN}/join)`,
  `- [Terms of Service](${ORIGIN}/terms)`,
  `- [Privacy Policy](${ORIGIN}/privacy)`,
  "",
].join("\n");
writeFileSync(join(DIST, "llms.txt"), llmsTxt, "utf-8");

console.log(
  `✓ prerendered ${pages.length} pages + llms.txt → dist ` +
    `(home, join, ${SERVICE_LANDINGS.length} service pages, ${BLOG_POSTS.length} posts, ${GLOSSARY_TERMS.length} terms + 2 index pages)`,
);
