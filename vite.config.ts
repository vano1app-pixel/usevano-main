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
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      // Requires src/sw.ts (workbox precache + push handlers)
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // Auto-replace the cached bundle on next visit so returning users don't
      // stay stuck on stale pre-perf builds. "prompt" needed the user to tap a
      // toast which a lot of people never do. VANO forms are short so the
      // small risk of a mid-form reload is acceptable.
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "favicon.ico"],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: "VANO - Local Gig Marketplace",
        short_name: "VANO",
        description: "Post a shift and get the work done! Connect with local students and freelancers in Galway.",
        // Non-standard but harmless; primary update signal is the SW + precache hash
        version: pwaBuildVersion,
        theme_color: "#3b82f6",
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
          // Animation libs only needed on animated pages (Landing, HirePage).
          // Split so dashboard / profile / messages users don't download them.
          animation: ["gsap", "framer-motion", "canvas-confetti"],
          // Charts only used on BusinessDashboard — no reason to ship to
          // anyone else. Recharts alone is ~400KB uncompressed.
          charts: ["recharts"],
        },
      },
    },
  },
}));
