# VANO Podcast verification — 2 November 2026

Implementation is a review draft. Production has not been changed.

- TypeScript check passed after the public/operational routing split.
- Full unit suite: 32 files, 352 tests passed (`npm test -- --maxWorkers=2`).
- Latest focused podcast suite: 8 tests passed, including the additional operational-route preservation and root sign-in callback checks.
- Complete production build passed; 14 public podcast pages plus a custom 404 were generated. Final rebuild follows the route and CommonJS/ESM compatibility cleanup.
- Inspected generated HTML: each of the 15 pages has one H1, title, description and canonical; every JSON-LD script parses. Sitemap has 14 URLs. No old jobs blog HTML is generated. See static-pages.json.
- Covered interactions: episode navigation, click-to-load/close player, direct listening links, clip filter/reset, sourced guest links, old-blog-to-notes routing, remote/in-person WhatsApp drafts. Tests intentionally prevent external iframe network loading; actual video playback still needs browser verification.
- Existing private operational paths continue through the legacy application and get noindex response headers. Native home uses the existing household/find screen. Legacy agreement URLs remain available with noindex headers; public podcast policies use /site-privacy and /site-terms. Root sign-in callbacks retain their query/fragment on the way to /auth. No backend, database, payment or messaging provider changes.
- Browser origin permission denied localhost at 127.0.0.1:8091, including after the user's general permission change. No alternative browser/network workaround was used. Desktop/phone/narrow layout, keyboard/reduced-motion and actual player/destination checks remain unverified.
- Instagram and TikTok browser access was declined. Instagram @vano_podcast comes from the local account inventory checked 23 October. TikTok ownership and handle remain unresolved; none is fabricated or linked.
- Spotify public metadata confirms four episodes. Episode five was still a draft in Creators when checked; it is not advertised as released.
- Four selected YouTube clips were checked in the public channel Atom feed on 2 November. They are editorial picks, not a claimed all-time ranking.
- Kríos company and founder links use its official about page. Ganzy's domain did not resolve; the episode/note pages disclose this and also link Jack Garvey's own site. Current company context is separated from the recorded episode description.

Required before merge: phone 390×844, desktop 1440×900 and narrow layout review; primary-action/player and keyboard/reduced-motion checks on the preview; literal owner codeword 667. The repository's AGENTS.md requires a verified preview before production.
