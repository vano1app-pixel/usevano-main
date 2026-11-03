# VANO Podcast release verification — 3 November 2026

The owner supplied literal **667** for this release and subsequently instructed **“publish it for now”** after the unavailable browser check was explicitly explained. This is the owner’s direction to proceed with the current release while recording the unverified visual state. Real phone/desktop preview checks remain unavailable: the computer-use backend exposes no apps or browsers and reports `Sky Computer Use native pipe startup failed`, including after one supported reset. The owner has been asked to reconnect Chrome. No alternate automation or network route was used to bypass earlier browser-origin denials.

## Verified implementation and checks

- Code commit: `50f75d5e455e157c1b990cc99e1e04726ee888ee` on `Codex/podcast-design-guests`, PR 429.
- Local app and strict NodeNext API typechecks passed. Focused changed-file lint passed. Full suite: **36 files / 387 tests passed** (`npm test -- --maxWorkers=2`). Tests mock all provider sends.
- Both exact-commit cloud web CI runs passed typecheck, tests and production build. Native builds are separate checks; do not infer native behavior from the web checks.
- Local production build generated 15 public podcast pages plus a custom 404. All 16 generated pages have one H1, title, description and canonical; all JSON-LD scripts parse. Sitemap has 15 URLs; no legacy jobs blog HTML is generated. Existing public blog image assets remain available for compatibility. See static-pages.json and platform-carousel.json.
- Correct vanojobs.com Vercel preview deployment `dpl_CYNv3Pt8w9JmWzziRcbySYjoVpqS` is Ready. Full build logs show commit 50f75d5, successful prerender, both API handlers and no TypeScript/build errors. Ready is deployment metadata, not evidence of rendered UI or actual inbox delivery.
- Preview: https://vanojobscom-git-codex-podcast-d-5b68b9-vano1app-pixels-projects.vercel.app
- Unique deployment: https://vanojobs-68tmfdv9m-vano1app-pixels-projects.vercel.app

## Homepage and real distribution

The generic headline is replaced with a compact logo strip for Spotify, Apple Podcasts, YouTube, Amazon Music and Instagram. Apple was checked through its official search API: creator Ayush Puri and Michael Okocha, show id6804809081. Amazon's show page identifies the same show and current episode. RSS is Spotify's original feed. Logo SVG provenance is in public/podcast/platforms/SOURCES.txt.

Frank's original episode-five cover starts in the centre of a five-cover carousel under a new-episode badge. Previous/next, direct episode selection, keyboard arrows and horizontal swipes change the episode. Automatic rotation is opt-in, stops on manual selection/focus, pauses for mouse hover or hidden tabs, and is disabled for reduced motion. Vertical gestures preserve page scrolling. A swipe suppresses the following click. Inactive artwork selects the episode; active artwork and caption open its page. Mobile labels and touch targets have dedicated styles. Source review and component tests cover these behaviors; real device rendering is still unverified.

No genuine listener comments were available from Apple's IE/US review feeds or checked YouTube episodes/Shorts. The owner has been asked for actual comment text/post links. The conditional renderer has empty public data, so it shows no invented endorsements. Supplied comments will contain quote, platform and source post only; author names/avatars are omitted from the bundle, with generic blurred listener labels.

Instagram @vano_podcast comes from the local account inventory checked 23 October. Live Instagram/TikTok inspection was declined earlier. No unverified TikTok handle is published.

## Episodes, guests and clips

Spotify's published show and individual metadata list EP. 5 — “A Whiskey Born From Love” with Frank Forde, ID 0j8s4tswMxcj7ser5JdGYF, released 2 November at 23:41 UTC, duration 44:11, with video. Anonymous embed playback reports AGE_UNKNOWN for the explicit episode. Actual authenticated playback is unverified in this site-check session. Original artwork was copied unaltered from Downloads/Whiskey Born From Love.png. A fresh YouTube check on 3 November confirms the channel now lists episode five as pmXtzuVYctw, duration 2,651 seconds, age_limit 18 and availability needs_auth. The cover opens its real YouTube watch page directly so an age-restricted iframe is not presented. The separate Spotify listening link remains. Episode schema includes both real destinations. See episode-five-youtube.json.

Frank's company Saudade & Sláinte is sourced to his own LinkedIn founder/interview listing and The Tuam Herald's Dunmore/Brazilian story. Kríos links use its official about page. Ganzy's domain failed DNS; the page discloses this and links Jack Garvey's own site. Present company context is distinguished from recorded episode discussion.

Selected clips cover episodes 4 (28nOfX6ZkM4), 2 (Rp_ECuzP0ic) and 1 (jl5HQ1lnyyA), with visible speaker/episode labels and original thumbnails. These are editorial picks, not a claimed all-time ranking. Episode-five clips are not fabricated while the owner prepares them.

Sources: https://open.spotify.com/episode/0j8s4tswMxcj7ser5JdGYF ; https://ie.linkedin.com/in/frank-forde-09b759445 ; https://www.tuamherald.ie/2026/10/20/unique-whiskey-blend-tells-a-dunmore-brazilian-love-story/ ; https://www.krios.ie/about ; https://jackgarvey.me/

## Guest enquiries and compatibility

The contact form includes digital or in-person Galway recording, name/email, episode idea and consent, plus optional business/profile/availability. Server-only recipient defaults to vano1app@gmail.com; the guest email becomes Reply-To. Existing RESEND_API_KEY names are present for the correct project's Preview and Production environments; no secret value was retrieved or changed. Optional server overrides are documented in .env.example. Fallback sender is VANO Podcast <onboarding@resend.dev>. Sender/provider configuration and actual inbox delivery still need a specifically authorised real enquiry test; key presence alone proves neither. No real email has been sent by these checks.

API tests cover correct owner/reply-to, both recording formats, idempotency, exact origins, consent, malformed/oversized data, honeypot, best-effort per-instance rate limits, provider timeout/failure/malformed receipts and honest acceptance. Form tests cover focus/validation, duplicate suppression, retained details and retry identity, complete user-sent WhatsApp backup and success only after valid acceptance. POST is explicit to prevent no-JavaScript GET leakage. WhatsApp prefill is created on button click rather than exposed in an analytics-captured anchor. PostHog blocks the enquiry subtree. Retry identity persists while the form is open, not across a page reload.

Private operational paths retain the legacy application with noindex headers. Native home retains its existing screen, root auth callbacks retain their parameters on the way to /auth, and legacy agreement URLs remain intact. Public podcast policies use /site-privacy and /site-terms. No database, payment, legacy messaging-function, migration or production-environment edits were made. The actual Supabase workflow has a functions/workflow path filter; this frontend/API PR changes neither.

The reviewer’s native GET leakage, analytics-prefill and duplicate /clips H1 findings were fixed. API tests are outside Vercel's api auto-deployment directory. Explicit .js imports and normal strict NodeNext checks fix the server ESM packaging issue caught in earlier remote logs.

## Release authorisation and verification limits

The repository's AGENTS.md requires opening the Vercel preview and clicking the changed flow before merge. The design gate requires actual desktop 1440×900, phone 390×844 and narrow layout review, primary-action/player and keyboard/reduced-motion checks. Chrome is currently disconnected from computer use. **667 has already been supplied; no further deployment approval is needed.** The owner’s later “publish it for now” direction supersedes the unavailable visual-check gate for this release. Merge via the reviewed PR after CI, verify production through deployment status and HTTP content, and record the result. Actual phone/desktop appearance and inbox delivery remain unverified.


## Final guest-action and Ireland podcast SEO changes

The owner requested a larger green “Be a guest” action and keyword-based podcast articles before publishing. The header action now uses the existing sage green, white text, 14px desktop/13px mobile labels and 48px desktop/46px mobile minimum height. Show notes now contain three sourced guest articles, including Frank Forde, with unique introductions using Irish business podcast, podcasts in Ireland and Galway naturally. Home and notes metadata, Article Open Graph type/publication dates, Article/PodcastEpisode/Series data, visible internal links and the sitemap cover the actual content. No ranking or indexing result is claimed. Canonical URLs remain on vanojobs.com and the notes stay linked in the footer. A person’s LinkedIn profile is no longer assigned as an Organization URL in article data.
