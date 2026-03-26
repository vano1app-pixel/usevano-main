# VANO

**VANO** is a two-sided marketplace connecting **students and freelancers** with **local Galway businesses**—post shifts, browse talent, and hire for real projects without the noise of generic job boards.

## What it does

- **Businesses** post gigs (fixed-price work, clear deliverables) and hire freelancers.
- **Students / freelancers** build profiles, apply to jobs, message clients, and get listed on the Community board after review.
- **Local focus** — Galway and nearby; simple, fast flows for small businesses and college talent.

Built with **Vite**, **React**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, and **Supabase** (auth, Postgres, storage, Edge Functions).

## Quick start

```sh
npm i
npm run dev
```

- **Build:** `npm run build` (or `npm run vercel-build` on Vercel as a fallback)
- **Preview production build:** `npm run preview`

## Project info

**URL**: https://lovable.dev/projects/f1ba0c74-af75-4389-a8ae-60baf80911b5

## Editing the codebase

**Lovable:** open the [Lovable project](https://lovable.dev/projects/f1ba0c74-af75-4389-a8ae-60baf80911b5) and prompt for changes.

**Locally:** clone the repo, install Node.js, then `npm i` and `npm run dev`. You can also edit on GitHub or in GitHub Codespaces.

## Technologies

- Vite, TypeScript, React
- shadcn-ui, Tailwind CSS
- Supabase (Auth, database, Storage, Edge Functions)
- vite-plugin-pwa with `injectManifest` — custom service worker at `src/sw.ts` (required for the build)

## Configuration

### Google Maps (optional)

Places autocomplete uses `VITE_GOOGLE_MAPS_API_KEY` in `.env` / Vercel. Restrict the key to your domains and the Places API in Google Cloud Console.

## Deploy on Vercel + Supabase

This app is a **Vite SPA**. The database, auth, storage, and **Edge Functions** live in **Supabase** — not on Vercel. Vercel hosts the static frontend.

### 1. Environment variables (Vercel)

In [Vercel](https://vercel.com) → your project → **Settings** → **Environment Variables**, add for **Production** (and Preview if you use it):

| Name | Value |
|------|--------|
| `VITE_SUPABASE_URL` | Supabase → **Project Settings** → **API** → **Project URL** (no trailing slash) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same page → **Publishable key** (or **anon** key — same JWT) |

Optional: `VITE_SUPABASE_ANON_KEY` — only if you prefer that name (same value as publishable).  
Optional: `VITE_GOOGLE_MAPS_API_KEY`, `VITE_TEAM_CONTACT_EMAIL`.

**Important:** `VITE_*` variables are baked in at **build time**. After changing them in Vercel, trigger a **new deployment** (Redeploy).

Copy `.env.example` to `.env.local` for local development.

### 2. Supabase Auth URLs (production: vanojobs.com)

Supabase → **Authentication** → **URL configuration**:

- **Site URL:** `https://vanojobs.com` (use your Vercel URL only while testing, e.g. `https://your-app.vercel.app`)
- **Redirect URLs:** include at least:  
  `https://vanojobs.com/**`  
  `https://www.vanojobs.com/**` (if you use `www`)  
  `https://*.vercel.app/**` (optional, for preview deployments)  
  `http://localhost:8080/**` (local dev)

The app uses `window.location.origin` for sign-up and password-reset links, so the host users open **must** appear in this list or auth redirects will fail.

### 3. Edge Functions

Features like AI helpers, notifications, and email hooks call **`supabase.functions.invoke`** or `https://<ref>.supabase.co/functions/v1/...`.

Deploy functions in Supabase (not Vercel):

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy
```

Set secrets in the Supabase dashboard (**Edge Functions** → secrets) where needed.

### 4. Vercel project settings

- **Framework preset:** Vite (`vercel.json` sets `"framework": "vite"`)
- **Build command:** `npm run build` (or `vercel-build` as a fallback)
- **Output directory:** `dist`
- `vercel.json` SPA-rewrites routes to `index.html` for client-side routing.

## Custom domain (Lovable)

See [Lovable: custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain).
