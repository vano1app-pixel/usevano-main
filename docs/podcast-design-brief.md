# VANO Podcast design pass — 2 November 2026

Audience: listeners discovering Irish founders through clips, and founders considering an episode. Primary listener action: open the latest full conversation; guest action: choose digital or in person in Galway, describe the episode and submit an email enquiry to Ayush. WhatsApp is a user-sent backup; an enquiry does not confirm a booking.

Extend the existing VANO identity: Bricolage display, Plus Jakarta body, cream, navy, sage actions, restrained gold. A magazine cover composition with actual episode thumbnails replaces the empty waveform artwork. Episodes are the substance; a navy vertical-video shelf gives clips a different rhythm. Short entrance/press/image transitions, no scroll hiding, reduced-motion equivalent.

Main pages: home, episodes and five episode details, clips, about, contact, privacy and terms. Notes live in the footer; old home-help blog and service URLs permanently redirect to podcast pages. Existing operational tracking, verification, helper signup and payment-return routes stay available in the legacy shell, with noindex response headers and no marketing links. Native default home returns to its functional household/find entry. Legacy operational legal URLs remain noindex; public podcast policies use /site-privacy and /site-terms. Root sign-in callbacks are preserved through /auth. Guest enquiries use a new Vercel API route and the existing Resend email service key; no database, payment or legacy edge-function changes.

Verified 2 November: Spotify public show and five episode IDs/dates/durations (episode five released at 23:41 UTC); official YouTube Atom feed and oEmbed; original local Spotify thumbnails; Kríos official about page and founder profile links. Ganzy domain fails DNS; Jack Garvey's indexed personal site describes Leaving Cert planning, while the recorded episode description describes the US student/admissions direction. Keep these contexts separate. Instagram account provenance: local account inventory checked 23 October, not live checked today. Instagram and TikTok browser access were declined today. Do not claim verified TikTok ownership, publish an invented handle or claim all-time top-performing clips. Feature editorial picks from the real YouTube feed.

Source URLs:
- https://open.spotify.com/show/033DSDTDi7S8VOd5mSBl0W
- https://www.youtube.com/feeds/videos.xml?channel_id=UCeiyIuW05Y6moyRISpO8_4A
- https://www.youtube.com/@VANO.shortz
- https://www.krios.ie/about
- https://www.linkedin.com/in/ahroon-santhosh/
- https://www.linkedin.com/in/michael-sweeney-heffernan-589155354
- https://jackgarvey.me/
- https://ie.linkedin.com/company/kr%C3%ADos

Scope diff: src/content/podcast.ts, src/pages/Podcast.tsx, new PodcastSite routing/layout/stylesheet, App web/native split, SEOHead defaults, index metadata, podcast prerender/sitemap/llms generation, robots, Vercel legacy redirects, manifest copy, public artwork and QA. No main merge or production deployment without 667.

Guest form extension: a familiar labelled form beside a short explanation of what happens next. Required: format, name, reply email, episode idea and contact consent. Business, website and availability are optional. Preserve input after failure, disable repeat submission, reuse an idempotency key on retry, and acknowledge only an actual provider acceptance. Server validation, exact-origin checks, honeypot and warm-instance limits protect the email endpoint. No-JavaScript POST avoids putting personal details in a URL; a plain WhatsApp link offers an alternative. Block the enquiry subtree from PostHog replay and generate the detailed WhatsApp draft only on button click.

The updated clip shelf uses published Shorts from episodes 4, 2 and 1, with visible episode/guest attribution. Kríos episode 3 remains prominently available as a full conversation; no unverified excerpt or clip ID has been invented.

Episode-five update: feature Frank Forde’s newly published "A Whiskey Born From Love" with its original artwork and direct Spotify video/listening link. Latest feature copy now comes from episode data. No episode-five YouTube video or clips are invented while the owner clips the recording.
