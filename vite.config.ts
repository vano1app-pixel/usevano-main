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
    host: "::",
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
      // User confirms via in-app toast so we can skipWaiting + reload cleanly
      registerType: "prompt",
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
}));
