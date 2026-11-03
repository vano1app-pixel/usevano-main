# VANO Podcast verification — 2 November 2026

Implementation is a review draft. Production has not been changed.

- TypeScript check passed after the public/operational routing split.
- Full unit suite: 34 files, 380 tests passed (`npm test -- --maxWorkers=2`).
- Latest focused podcast suite: 8 tests passed, including episode-five homepage/detail/Spotify schema checks, earlier YouTube playback controls and preserved operational routes.
- Complete production build passed; 15 public podcast pages plus a custom 404 were generated. Final rebuild follows the route and CommonJS/ESM compatibility cleanup.
- Inspected generated HTML: each of the 16 pages has one H1, title, description and canonical; every JSON-LD script parses. Sitemap has 15 URLs. No old jobs blog HTML is generated. See static-pages.json.
- Covered interactions: episode navigation, click-to-load/close player, direct listening links, clip filter/reset, sourced guest links, old-blog-to-notes routing, digital/in-person guest enquiries with a user-sent WhatsApp backup. Tests intentionally prevent external iframe network loading; actual video playback still needs browser verification.
- Existing private operational paths continue through the legacy application and get noindex response headers. Native home uses the existing household/find screen. Legacy agreement URLs remain available with noindex headers; public podcast policies use /site-privacy and /site-terms. Root sign-in callbacks retain their query/fragment on the way to /auth. No database, payment or legacy messaging-function changes. A new Vercel guest-enquiry API uses the already-configured Resend key.
- Browser origin permission denied localhost at 127.0.0.1:8091, including after the user's general permission change. No alternative browser/network workaround was used. Desktop/phone/narrow layout, keyboard/reduced-motion and actual player/destination checks remain unverified.
- Instagram and TikTok browser access was declined. Instagram @vano_podcast comes from the local account inventory checked 23 October. TikTok ownership and handle remain unresolved; none is fabricated or linked.
- Superseded check: episode five was initially a draft. At 23:41 UTC on 2 November the published Spotify show/episode metadata lists EP. 5 — "A Whiskey Born From Love" with Frank Forde, ID 0j8s4tswMxcj7ser5JdGYF, duration 2,651,413 ms. It is now the first/latest episode in the site data.
- The channel Shorts catalogue was checked on 2 November. Three selected clips now cover episodes 4 (28nOfX6ZkM4), 2 (Rp_ECuzP0ic) and 1 (jl5HQ1lnyyA); thumbnail speaker/studio appearance was matched to the original episode artwork. These are editorial picks, not a claimed all-time ranking.
- Kríos company and founder links use its official about page. Ganzy's domain did not resolve; the episode/note pages disclose this and also link Jack Garvey's own site. Current company context is separated from the recorded episode description.

Required before merge: phone 390×844, desktop 1440×900 and narrow layout review; primary-action/player and keyboard/reduced-motion checks on the preview; literal owner codeword 667. The repository's AGENTS.md requires a verified preview before production.

## Guest enquiry extension

- Form includes digital/in-person choice, guest name/email, optional business/profile/availability, episode idea and contact consent.
- Server-only destination defaults to vano1app@gmail.com. Guest email is Reply-To. Existing RESEND_API_KEY is present in the correct Vercel project's Preview and Production environments; its value was not retrieved or changed.
- Optional server overrides PODCAST_ENQUIRY_EMAIL and PODCAST_ENQUIRY_FROM are documented in .env.example. Without a verified sender override, the API falls back to the existing VANO onboarding@resend.dev sender. Provider configuration and actual inbox delivery still require a real authorised preview test; key presence alone proves neither.
- API tests mock Resend: both formats, owner destination, reply-to, complete details, idempotency, exact origins, malformed/oversized input, consent, honeypot, local rate limits, missing config, provider failure/timeout/malformed receipts. No actual emails are sent by tests.
- Form tests cover validation/focus, both formats, pending duplicate suppression, success only on valid acceptance, retained details/retry identity and complete WhatsApp backup. POST is explicit for no-JavaScript privacy. The detailed WhatsApp URL is created on click, not exposed in a DOM anchor for outbound analytics capture. PostHog replay blocks the whole enquiry subtree.
- Reviewer identified native GET leakage and PII in the backup anchor; both were fixed. Per-instance rate limiting is best effort and is not a deployment-wide quota. Idempotency survives retries while the form remains open, not a full page reload.
- Inbox delivery, preview form interaction and visual phone/desktop QA remain unverified because browser origin access is still blocked. Production remains unchanged pending these checks and the owner's literal 667.

Selected source posts:
- https://www.youtube.com/shorts/28nOfX6ZkM4 — episode 4, Jack Garvey.
- https://www.youtube.com/shorts/Rp_ECuzP0ic — episode 2, Milosz Nelka.
- https://www.youtube.com/shorts/jl5HQ1lnyyA — episode 1, Team VANO.

Latest local validation: typecheck passed; full suite passed 34 files / 380 tests; production build and 15-page static checks passed; focused lint passed. A subsequent isolated run exposed a test assertion racing React's focus effect; changed the assertion to await focus rather than checking immediately after the success DOM appeared. Final isolated rerun passed all 26 API/form tests.

Deployment packaging: API tests live under src/lib/__tests__, outside Vercel’s auto-deployed api directory. The test move passed the 26-case isolated rerun; no test handler should be deployed.

Remote build-log review caught TS2835 errors despite Vercel's Ready status: NodeNext server imports need explicit .js extensions. Fixed the enquiry and sitemap dependency chains and added tsconfig.api.json to the normal typecheck command so server imports are checked before deployment. Final corrected preview must be checked again for clean build logs.

Corrected import validation: strict NodeNext API compilation and emitted Node ESM loading passed for both enquiry and sitemap handlers. GET method guard and sitemap output were exercised locally without network/provider calls. All 34 focused podcast/form/API tests passed after the fix.

## Episode five release

Owner confirmed publication. Spotify show and individual embed metadata now list the released episode, dated 2 November 2026 (23:41 UTC), 44:11, with video. Anonymous embed playback reports AGE_UNKNOWN for this explicit episode, so availability in Spotify's listing is verified; actual authenticated playback has not been exercised. Original artwork comes from Downloads/Whiskey Born From Love.png and is copied without visual alteration. Homepage feature number/title/guest/artwork/link now follow the latest episode data. The episode list, individual page, PodcastEpisode/Series data, sitemap and llms include episode five. YouTube's full-video listing still has only episodes 1–4, so episode five opens its actual Spotify page instead of constructing a missing YouTube URL. Existing episode 1/2/4 clips stay in place while the owner prepares episode-five clips. Company context uses Frank's own public LinkedIn founder/interview listing and The Tuam Herald report, distinct from a transcript.

Sources: https://open.spotify.com/episode/0j8s4tswMxcj7ser5JdGYF ; https://ie.linkedin.com/in/frank-forde-09b759445 ; https://www.tuamherald.ie/2026/10/20/unique-whiskey-blend-tells-a-dunmore-brazilian-love-story/

Episode-five final local checks passed: normal app + strict API typecheck; full 380-test suite; focused eight-test podcast suite; full build/prerender; and 16-page static validation including the new hero, archive count, real Spotify-only player/schema, artwork, sitemap and llms. Reviewer’s stale four-conversation copy finding was fixed with a dynamic count and updated archive/About descriptions. Browser rendering and authenticated Spotify playback remain unverified under the existing browser permission block.
