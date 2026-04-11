# VANO

**VANO** is a two-sided marketplace connecting **Galway businesses** with **local freelancers** — browse talent, hire for projects, and message in-app. Simple, fast, local.

**Live:** [vanojobs.com](https://vanojobs.com)

---

## How it works

### For businesses
1. Describe what you need on the **Hire** page
2. VANO matches you with the right freelancer — or browse talent yourself
3. Message, agree scope, and get started

### For freelancers
1. Sign up and build your profile (bio, skills, portfolio, rates)
2. Get found by businesses browsing the **Talent Board**
3. Message clients and get hired

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Animation | GSAP (scroll-driven), Framer Motion (micro-interactions) |
| Backend | Supabase (Auth, PostgreSQL, Storage, Edge Functions) |
| PWA | vite-plugin-pwa with custom service worker |
| Hosting | Vercel (static SPA) |
| Maps | Google Places API (optional) |

---

## Project structure

```
src/
├── pages/                  # Route-level page components
│   ├── Landing.tsx          # Homepage — hero, categories, freelancers, FAQ
│   ├── HirePage.tsx         # Business hiring flow (match or DIY)
│   ├── BrowseStudents.tsx   # Talent hub — 4 category cards
│   ├── StudentsByCategory.tsx # Filtered freelancer list by category
│   ├── StudentProfile.tsx   # Individual freelancer profile (public)
│   ├── JobDetail.tsx        # Job/gig detail + apply
│   ├── Profile.tsx          # Freelancer/business profile editor
│   ├── BusinessDashboard.tsx # Business dashboard (jobs, apps, analytics)
│   ├── Messages.tsx         # In-app messaging
│   ├── Auth.tsx             # Sign in / sign up
│   ├── ChooseAccountType.tsx # Onboarding: freelancer or business
│   ├── CompleteProfile.tsx  # Onboarding: complete profile
│   ├── BlogPost.tsx         # Release notes / blog
│   ├── Admin.tsx            # Admin moderation panel
│   ├── Privacy.tsx          # Privacy policy
│   ├── Terms.tsx            # Terms of service
│   ├── NotFound.tsx         # 404 page
│   └── UserSlugRedirect.tsx # SEO-friendly /u/:slug redirects
│
├── components/             # Reusable UI components
│   ├── ui/                  # shadcn/ui primitives (button, card, etc.)
│   ├── Navbar.tsx           # Desktop navigation bar
│   ├── MobileBottomNav.tsx  # Mobile bottom tab bar
│   ├── FreelancerPublicHeader.tsx # Freelancer profile hero banner
│   ├── StudentCard.tsx      # Freelancer card (used in browse/search)
│   ├── JobCard.tsx          # Job listing card
│   ├── ReviewForm.tsx       # Submit a review
│   ├── ReviewList.tsx       # Display reviews
│   ├── PortfolioManager.tsx # Upload/manage portfolio items
│   ├── AuthSheet.tsx        # Mobile auth bottom sheet
│   ├── WhatsAppFloatingButton.tsx # WhatsApp contact button
│   └── ...                  # Other shared components
│
├── hooks/                  # Custom React hooks
│   ├── useAuthSession.ts    # Auth state management
│   ├── useProfileCompletion.ts # Redirect if profile incomplete
│   ├── useIsAdmin.ts        # Admin role check
│   └── ...                  # Other hooks
│
├── lib/                    # Utilities and configuration
│   ├── gsapSetup.ts         # GSAP plugin registration
│   ├── contact.ts           # WhatsApp/email contact config
│   ├── slugify.ts           # URL slug generation
│   ├── freelancerProfile.ts # Freelancer data formatting
│   ├── socialLinks.ts       # Work links parsing
│   └── ...                  # Other utilities
│
├── integrations/
│   └── supabase/            # Supabase client setup
│
├── App.tsx                 # Route definitions
├── main.tsx                # Entry point
└── sw.ts                   # Service worker (PWA)
```

---

## Quick start

```sh
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

Copy `.env.example` to `.env.local` for local development.

---

## Environment variables

Set in Vercel (Settings > Environment Variables) or `.env.local` locally:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase anon/publishable key |
| `VITE_GOOGLE_MAPS_API_KEY` | No | Google Places autocomplete |
| `VITE_TEAM_CONTACT_EMAIL` | No | Team contact WhatsApp number |

`VITE_*` variables are baked in at build time — redeploy after changing them.

---

## Deployment

### Vercel (frontend)

- **Framework:** Vite
- **Build command:** `npm run build`
- **Output directory:** `dist`
- `vercel.json` handles SPA routing (rewrites to `index.html`)

### Supabase (backend)

```sh
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy
```

Set Edge Function secrets in the Supabase dashboard.

### Auth setup

- **Site URL:** `https://vanojobs.com`
- **Redirect URLs:** `https://vanojobs.com`, `https://vanojobs.com/**`, `http://localhost:8080/**`
- Enable email OTP confirmation with `{{ .Token }}` in the signup template
- Google OAuth configured via Supabase Auth providers

---

## Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Homepage |
| `/hire` | HirePage | Business hiring flow |
| `/jobs/:id` | JobDetail | View & apply to a gig |
| `/students` | BrowseStudents | Talent hub (categories) |
| `/students/:category` | StudentsByCategory | Freelancers by category |
| `/students/:id` | StudentProfile | Freelancer profile |
| `/profile` | Profile | Edit your profile |
| `/business-dashboard` | BusinessDashboard | Business dashboard |
| `/messages` | Messages | In-app messaging |
| `/auth` | Auth | Sign in / sign up |
| `/blog/vano-v1` | BlogPost | Release notes |
| `/admin` | Admin | Moderation panel |

---

## License

Private project.
