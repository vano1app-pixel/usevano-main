/**
 * One-off generator for per-post OpenGraph share images (1200×630 PNG) —
 * the preview card shown when a blog post link is shared on WhatsApp,
 * Instagram, LinkedIn, X, iMessage, etc.
 *
 * Run LOCALLY only. The output PNGs are committed to public/og/blog/ and
 * served as plain static files, so there is NO build-time or runtime
 * dependency on this script or on @resvg/resvg-js:
 *
 *     npm i -D @resvg/resvg-js
 *     npx tsx scripts/generate-blog-og.ts
 *     npm un @resvg/resvg-js     # remove again — the PNGs are committed
 *
 * Re-run whenever a post title/eyebrow changes or a post is added.
 */
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BLOG_POSTS } from "../src/content/blog";

// Brand display face (also used across the site). Lives under design-references,
// which is fenced off from the build — fine to read here at generation time.
const FONT =
  "design-references/ui-ux-pro-max/.claude/skills/ui-styling/canvas-fonts/BricolageGrotesque-Regular.ttf";
const OUT = join(process.cwd(), "public/og/blog");
mkdirSync(OUT, { recursive: true });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Naive word-wrap by character budget; caps at 3 lines so the card never overflows. */
function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((`${line} ${w}`).trim().length > max && line) {
      lines.push(line.trim());
      line = w;
    } else {
      line = (`${line} ${w}`).trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

for (const post of BLOG_POSTS) {
  const lines = wrap(post.title, 26);
  // Fixed title top (well below the eyebrow) growing downward — avoids any
  // collision with the eyebrow on taller 3-line titles.
  const startY = 300;
  const titleSvg = lines
    .map(
      (l, i) =>
        `<text x="90" y="${startY + i * 72}" font-size="60" fill="#ffffff" font-family="Bricolage Grotesque">${esc(l)}</text>`,
    )
    .join("\n  ");

  const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#1a2340"/>
  <circle cx="1090" cy="90" r="240" fill="#5a8a6a" opacity="0.13"/>
  <text x="90" y="112" font-size="46" fill="#ffffff" font-family="Bricolage Grotesque" letter-spacing="2">VANO</text>
  <rect x="92" y="134" width="58" height="5" rx="2.5" fill="#7faa8a"/>
  <text x="90" y="200" font-size="26" fill="#9ec6ab" font-family="Bricolage Grotesque" letter-spacing="3">${esc(post.eyebrow.toUpperCase())}</text>
  ${titleSvg}
  <text x="90" y="575" font-size="28" fill="#ffffff" opacity="0.6" font-family="Bricolage Grotesque">vanojobs.com</text>
</svg>`;

  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    font: { fontFiles: [FONT], loadSystemFonts: true, defaultFontFamily: "Bricolage Grotesque" },
  })
    .render()
    .asPng();

  const file = join(OUT, `${post.slug}.png`);
  writeFileSync(file, png);
  console.log(`✓ ${file} (${lines.length} line title)`);
}
