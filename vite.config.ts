import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };
/** Changes every production build so the web app manifest and precache revision update */
const pwaBuildVersion =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.BUILD_ID ||
  `${pkg.version}-${Date.now()}`;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    // design-references/ is a docs folder with example code that imports
    // packages we never install. Excluding it from the dev watcher +
    // dep-optimizer keeps the console clean.
    fs: { deny: ["design-references/**"] },
  },
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{ts,tsx}"],
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // Requires src/sw.ts (workbox precache + push handlers)
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // "prompt" surfaces the PwaUpdateToast (src/components/PwaUpdateToast.tsx)
      // when a new SW is detected. Switched back from "autoUpdate" because:
      //   1. The SW (src/sw.ts) only skip-waits on receiving SKIP_WAITING — it
      //      was already designed for prompt mode; autoUpdate left the toast
      //      component dead-code and the SW behaviour mismatched.
      //   2. autoUpdate replaces the bundle on the next *visit*, but users who
      //      keep a tab open (a real pattern for this app's mobile users) keep
      //      running stale JS forever. After multi-Google-account hang fix
      //      (#109) we need users to actually pick up new code.
      // autoUpdate (was "prompt"): the prompt relied on users tapping an
      // "Update" toast, so anyone who missed it stayed on a stale cached build
      // — deploys looked like they "weren't going live". autoUpdate + the
      // skipWaiting in src/sw.ts applies a new deploy automatically on next load.
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "favicon.ico"],
      injectManifest: {
        // Precache only the essentials. The previous "**/*.{...,png,...}" glob
        // pulled every category PNG from /public into the precache (cat-*.png
        // are 700–860KB each, ~4MB total) so first-visit users paid for assets
        // they only ever see if they tap into the hire flow. Keep the JS/CSS
        // shell + the PWA icons + favicons + OG image in the precache; let the
        // browser fetch category images on demand (they're already responsive
        // <picture> sources with webp variants and loading="lazy").
        globPatterns: [
          "**/*.{js,css,html,woff2}",
          "favicon.*",
          "pwa-*.png",
          "og.png",
        ],
        // Above the workbox default (~2MB) so the JS shell isn't dropped when
        // the entry chunk grows; still small enough to keep first install
        // under a few hundred KB on a fresh device.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: "VANO — Same-day home help",
        short_name: "VANO",
        description: "Book a trusted local helper in minutes — shopping, cleaning, garden, dog walks, moving & more. Same-day across Ireland.",
        // Non-standard but harmless; primary update signal is the SW + precache hash
        version: pwaBuildVersion,
        // Matches the navy <meta name="theme-color"> in index.html
        theme_color: "#1a2340",
        background_color: "#f5f0e8",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Raise the warning limit: our biggest chunk (the app bundle) is still
    // close to 600KB. The real improvement comes from the manualChunks below,
    // which split vendor code so browsers can cache it across deploys.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          // Core framework — rarely changes, huge caching win on repeat visits.
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          // Supabase client is heavy and used everywhere — cache it separately.
          supabase: ["@supabase/supabase-js"],
          // Animation libs only needed on animated pages — split so dashboard /
          // profile / messages users don't download them.
          animation: ["framer-motion", "canvas-confetti"],
        },
      },
    },
  },
}));
