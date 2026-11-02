// VANO Podcast — every fact on the site lives here. Update this file, ship it.
// Numbers go live as written: only put stats Ayush can defend in front of a
// sponsor or a guest.

export const STATS = {
  viewsPerWeek: '~100k', // across episodes + clips — owner-provided 2026-11-02
  accounts: 3,           // clip/social accounts running
  episodesReleased: 4,
};

export const EPISODES = [
  { n: 'EP.4', guest: '', topic: '', link: '' },
  { n: 'EP.3', guest: 'Ahroon & Micheal — Kríos', topic: 'AI sales training, out of Cork', link: '' },
  { n: 'EP.2', guest: '', topic: '', link: '' },
  { n: 'EP.1', guest: '', topic: '', link: '' },
] as const;

export const PLATFORMS = [
  { name: 'Spotify', url: 'https://open.spotify.com/show/vanopodcast', note: 'main feed' },
  { name: 'Apple Podcasts', url: '', note: 'subscribe' },
  { name: 'YouTube', url: '', note: 'full episodes + clips' },
  { name: 'Everywhere else', url: '', note: 'RSS → your app' },
] as const;

export const CONTACT = {
  linkedin: 'https://linkedin.com/in/ayush-puri-4b88b8357',
  instagram: '',
};
