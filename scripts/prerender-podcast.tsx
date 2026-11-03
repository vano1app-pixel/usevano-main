// The SAME React pages as the browser, emitted as visible static HTML for
// search/answer engines, social previews and visitors with JavaScript disabled.
import React from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import * as HelmetPackage from "react-helmet-async";
const { HelmetProvider } = (Reflect.get(HelmetPackage, "default") ||
  HelmetPackage) as typeof HelmetPackage;
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import PodcastSite from "../src/pages/PodcastSite";
import { PODCAST_PATHS } from "../src/content/podcast";
import { podcastLlms, podcastSitemap } from "../src/content/podcastDiscovery";
const template = readFileSync("dist/index.html", "utf8");
if (!template.includes("<!-- podcast-root:start -->"))
  throw new Error("Run vite build first to refresh the podcast template.");
for (const path of [...PODCAST_PATHS, "/404"]) {
  const context = {} as {
    helmet: {
      title: { toString: () => string };
      meta: { toString: () => string };
      link: { toString: () => string };
      script: { toString: () => string };
    };
  };
  const markup = renderToString(
    <HelmetProvider context={context}>
      <StaticRouter location={path}>
        <PodcastSite />
      </StaticRouter>
    </HelmetProvider>,
  );
  const helmet = context.helmet;
  let html = template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, "")
    .replace(
      /<meta\b[^>]*(?:name|property)="(?:title|description|keywords|robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g,
      "",
    )
    .replace(/<link\b[^>]*rel="canonical"[^>]*>/g, "")
    .replace(
      /<script\b[^>]*type="application\/ld\+json">[\s\S]*?<\/script>/g,
      "",
    );
  html = html.replace(
    "</head>",
    `${helmet.title.toString()}${helmet.meta.toString()}${helmet.link.toString()}${helmet.script.toString()}</head>`,
  );
  html = html.replace(
    /<!-- podcast-root:start -->[\s\S]*?<!-- podcast-root:end -->/,
    `<!-- podcast-root:start --><div id="root">${markup}</div><!-- podcast-root:end -->`,
  );
  const file = join(
    "dist",
    path === "/"
      ? "index.html"
      : path === "/404"
        ? "404.html"
        : path.slice(1) + "/index.html",
  );
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, html);
}
writeFileSync("dist/sitemap.xml", podcastSitemap());
writeFileSync("dist/llms.txt", podcastLlms());
console.log(
  `Prerendered ${PODCAST_PATHS.length} podcast pages + sitemap.xml + llms.txt (no legacy jobs articles).`,
);
