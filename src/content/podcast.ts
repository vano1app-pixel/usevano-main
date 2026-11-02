// VANO Podcast — every fact on the site lives here. Update this file, ship it.
// Numbers go live as written: only put stats Ayush can defend in front of a
// sponsor or a guest.

export const SHOW = {
  name: 'VANO Podcast',
  hosts: 'Ayush Puri & Michael Okocha',
  tagline:
    'Conversations with founders building from Ireland — the early decisions, the wrong turns, and what they’d do differently.',
  city: 'Galway, Ireland',
};

export const STATS = {
  viewsPerWeek: '~100k', // across episodes + clips — owner-provided 2026-11-02
  accounts: 3,           // clip/social accounts running
  episodesReleased: 4,
  avgLength: '1 hr 11 min',
};

// Real episodes from the show's feed (checked 2026-11-02). Add the Spotify
// episode link once pulled — `link` falls back to the show page for now.
export const EPISODES = [
  {
    n: 'EP.4',
    title: '“Betting it all on USA”',
    guest: 'Jack Garvey — Ganzy',
    topic: 'Selling to Americans from Ireland, AI tools, moving to San Francisco',
    date: 'Aug 2026',
    length: '58 min',
    link: '',
  },
  {
    n: 'EP.3',
    title: '“YOU NEED TO THINK BIGGER”',
    guest: 'Ahroon & Micheal — Kríos',
    topic: 'AI sales training out of Cork, vibe coding, mindset, books',
    date: 'Jul 2026',
    length: '1 hr 24',
    link: '',
  },
  {
    n: 'EP.2',
    title: '“Building a business at 17”',
    guest: 'Milosz Nelka',
    topic: 'Business, boxing and college — discipline from a young founder',
    date: 'Jul 2026',
    length: '1 hr 10',
    link: '',
  },
  {
    n: 'EP.1',
    title: 'VANO and Tech Startups',
    guest: 'Ayush Puri',
    topic: 'Where the idea came from, early pivots, building as a student',
    date: 'Jun 2026',
    length: '1 hr 12',
    link: '',
  },
] as const;

// spotifyShow: paste the real open.spotify.com/show/… URL here when pulled —
// every listen button and episode fallback uses it. Search URL is the safe
// stand-in until then.
export const PLATFORMS = [
  { name: 'Spotify', url: 'https://open.spotify.com/search/VANO%20Podcast', note: 'main feed' },
  { name: 'Apple Podcasts', url: 'https://podcasts.apple.com/search?term=VANO%20Podcast', note: 'subscribe' },
  { name: 'YouTube', url: '', note: 'full episodes + clips' },
  { name: 'Everywhere else', url: '', note: 'RSS → your app' },
] as const;

// Booking — €100/episode, owner call 2026-11-02 ("will increase after").
// bookingUrl: paste a Stripe Payment Link here once made (Stripe → Payment
// Links → €100) and the button charges directly. Until then bookings go to
// Ayush's WhatsApp with the details prefilled.
export const BOOKING = {
  price: '€100',
  whatsapp: '353899817111',
  stripePaymentLink: '',
};

export const CONTACT = {
  linkedin: 'https://linkedin.com/in/ayush-puri-4b88b8357',
  instagram: '',
};
