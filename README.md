# VANO

**VANO** is same-day home help in Galway — book a trusted, ID-verified student for cleaning, groceries, garden work, dog walks, moving and more. Book one job in seconds, or put the house on **autopilot** with a monthly plan.

**Live:** [vanojobs.com](https://vanojobs.com)

---

## How it works

### For households
1. Tap a category on the homepage, drop your phone number and Eircode
2. A verified student nearby accepts — you pay only then (card, Apple Pay, Google Pay)
3. Track the booking live, rate your helper after

### House Autopilot (the flagship offer)
Tick the jobs you never want to think about again — cleaning, groceries, garden, bins — and one trusted helper handles them weekly. Two modes: **ongoing monthly** (subscription) or **while I'm away** (one-off cover for a trip). 10% bundle discount on 3+ services.

### For helpers (students)
1. Apply on **/join** with photo, categories and area
2. Get screened, then receive nearby job offers by SMS/push
3. Accept, complete the job, get paid

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Animation | Framer Motion (micro-interactions), GSAP available |
| Backend | Supabase (Auth, PostgreSQL, Storage, Edge Functions) |
| Payments | Stripe Checkout (pay-after-accept, subscriptions, escrow) |
| PWA | vite-plugin-pwa with custom service worker |
| Hosting | Vercel (static SPA) |
| Maps | Google Places API (optional), Nominatim fallback |

---

## Project structure

```
src/
├── pages/                   # Route-level page components
│   ├── HouseholdHome.tsx     # Homepage — hero booking card, House Autopilot, trust sections
│   ├── BookingFlow.tsx       # Multi-step booking flow (/book/:category)
│   ├── TrackBooking.tsx      # Live booking tracking (/track/:bookingId)
│   ├── JoinAsHelper.tsx      # Helper application
│   ├── StudentDashboard.tsx  # Helper dashboard — job offers, earnings
│   ├── StudentJobDetail.tsx  # Helper job detail + accept
│   ├── StudentAccount.tsx    # Helper account settings
│   ├── HelperPublicProfile.tsx # Public helper profile (/helpers/:id)
│   ├── HouseholdAdmin.tsx    # Admin — dispatch, bookings, helpers
│   ├── Auth.tsx              # Sign in / sign up
│   ├── Privacy.tsx / Terms.tsx / NotFound.tsx
│
├── components/
│   ├── ui/                   # shadcn/ui primitives
│   └── household/            # Homepage + booking components
│       ├── HeroSection.tsx    # Dark hero with booking card
│       ├── CategoryGrid.tsx   # Category cards + quick-book bottom sheet
│       ├── AutopilotBuilder.tsx # Tick-the-jobs subscription builder
│       ├── HomePlans.tsx      # Autopilot section + business/gift offers
│       └── ...                # Reviews, helpers carousel, FAQ, ticker, nav, footer
│
├── hooks/                   # useAuthSession, useHelperCount, …
├── lib/                     # bookingMemory, contact, cities, referral, …
├── integrations/supabase/   # Supabase client setup
├── App.tsx                  # Route definitions
├── main.tsx                 # Entry point
└── sw.ts                    # Service worker (PWA)

supabase/
├── functions/               # Edge functions — checkout, dispatch, notifications, crons
└── migrations/              # Database schema
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

# Tests / lint / types
npm test && npm run lint && npm run typecheck
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

Set Edge Function secrets (Stripe keys, etc.) in the Supabase dashboard.

### Auth setup

- **Site URL:** `https://vanojobs.com`
- **Redirect URLs:** `https://vanojobs.com`, `https://vanojobs.com/**`, `http://localhost:8080/**`
- Enable email OTP confirmation with `{{ .Token }}` in the signup template
- Google OAuth configured via Supabase Auth providers

---

## Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` and `/home` | HouseholdHome | Homepage — book help, House Autopilot |
| `/book/:category` | BookingFlow | Multi-step booking |
| `/track/:bookingId` | TrackBooking | Live booking status |
| `/join` | JoinAsHelper | Helper application |
| `/student-dashboard` | StudentDashboard | Helper job offers + earnings |
| `/student-job/:bookingId` | StudentJobDetail | Helper job detail + accept |
| `/student-account` | StudentAccount | Helper account |
| `/helpers/:id` | HelperPublicProfile | Public helper profile |
| `/household-admin` | HouseholdAdmin | Admin dispatch panel |
| `/auth` | Auth | Sign in / sign up |

---

## License

Private project.
