import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// Separate config file so vite.config.ts stays lean — no test-only
// plugins, no test-only deps showing up in the production build graph.
// Pulls the same @/ path alias + React SWC plugin as the main config
// so tests resolve imports identically to the app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Exclude the design-references/ folder (example code pulled in as
    // docs) and node_modules — the former imports packages we never
    // install and would blow up collection.
    exclude: ['node_modules', 'dist', 'design-references/**'],
    css: false,
    // Dummy values so the supabase client boots during test collection
    // without a real .env. We don't make network calls in these tests;
    // the client just needs ANYTHING URL-shaped + a non-empty key to
    // instantiate without throwing on import.
    env: {
      VITE_SUPABASE_URL: 'http://test.local.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
    },
  },
});
