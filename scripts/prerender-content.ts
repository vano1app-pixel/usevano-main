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
</style>`;

const topNav = `<nav class="top"><a href="/">Home</a> · <a href="/blog">Blog</a> · <a href="/glossary">Glossary</a> · <a href="/join">Join as helper</a></nav>`;
const siteFooter = `<footer>VANO — same-day home help in Galway &amp; Ireland. <a href="/join">Join as a helper</a> · <a href="/blog">Blog</a> · <a href="/glossary">Glossary</a></footer>`;

interface PageSpec {
  outFile: string;
  title: string; // without the " | VANO" suffix
  description: string;
  canonical: string;
  ogType: "website" | "article";
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

  const headInjection = `${PRERENDER_STYLE}\n${page.jsonLd.map(ldScript).join("\n")}\n</head>`;
  html = html.replace("</head>", headInjection);

  html = html.replace(/<div id="root">[\s\S]*?<\/div>/, `<div id="root"><div class="vano-pr">${page.rootHtml}</div></div>`);

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
${related.length ? `<section><h2>Keep reading</h2><ul class="cards">${related.map((r) => `<li><a href="/blog/${r.slug}">${escAttr(r.title)}</a><br><span>${escAttr(r.description)}</span></li>`).join("")}</ul></section>` : ""}
${siteFooter}`.trim();

  return {
    outFile: `blog/${post.slug}/index.html`,
    title: post.title,
    description: post.description,
    canonical: url,
    ogType: "article",
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
        image: `${ORIGIN}/og.png`,
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

// ── run ──────────────────────────────────────────────────────────────────────
const pages: PageSpec[] = [
  blogIndexPage(),
  glossaryIndexPage(),
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
  "> Same-day home help in Galway, Ireland. Book an ID-verified student helper for cleaning, garden, dog walks, moving, errands or tutoring — or put your home on Autopilot. Helpers earn above the Irish minimum wage (€15.30/hr net on time-based jobs); customers pay only after a helper accepts.",
  "",
  "## Blog",
  ...BLOG_POSTS.map((p) => `- [${p.title}](${ORIGIN}/blog/${p.slug}): ${p.summary}`),
  "",
  "## Glossary",
  ...GLOSSARY_TERMS.map((t) => `- [${t.term}](${ORIGIN}/glossary/${t.slug}): ${t.short}`),
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
  `✓ prerendered ${pages.length} pages + llms.txt → dist/{blog,glossary} ` +
    `(${BLOG_POSTS.length} posts, ${GLOSSARY_TERMS.length} terms + 2 index pages)`,
);
