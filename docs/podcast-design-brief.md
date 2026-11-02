# VANO Podcast design pass — 2 November 2026

Audience: listeners discovering Irish founders through clips, and founders considering an episode. Primary listener action: open the latest full conversation; guest action: choose remote or Galway and start a WhatsApp enquiry (no automatic send or booking confirmation).

Extend the existing VANO identity: Bricolage display, Plus Jakarta body, cream, navy, sage actions, restrained gold. A magazine cover composition with actual episode thumbnails replaces the empty waveform artwork. Episodes are the substance; a navy vertical-video shelf gives clips a different rhythm. Short entrance/press/image transitions, no scroll hiding, reduced-motion equivalent.

Main pages: home, episodes and four episode details, clips, about, contact, privacy and terms. Notes live in the footer; old home-help blog and service URLs permanently redirect to podcast pages. Existing operational tracking, verification, helper signup and payment-return routes stay available in the legacy shell, with noindex response headers and no marketing links. Native default home returns to its functional household/find entry. Legacy operational legal URLs remain noindex; public podcast policies use /site-privacy and /site-terms. Root sign-in callbacks are preserved through /auth. No backend/provider changes.

Verified 2 November: Spotify public show and four episode IDs/dates/durations; official YouTube Atom feed and oEmbed; original local Spotify thumbnails; Kríos official about page and founder profile links. Ganzy domain fails DNS; Jack Garvey's indexed personal site describes Leaving Cert planning, while the recorded episode description describes the US student/admissions direction. Keep these contexts separate. Instagram account provenance: local account inventory checked 23 October, not live checked today. Instagram and TikTok browser access were declined today. Do not claim verified TikTok ownership, publish an invented handle or claim all-time top-performing clips. Feature editorial picks from the real YouTube feed.

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
