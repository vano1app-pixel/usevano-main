// Public sources and verification limits: docs/podcast-design-brief.md.
export const ORIGIN = "https://vanojobs.com";
export const SHOW = {
  name: "VANO Podcast",
  hosts: "Ayush Puri & Michael Okocha",
  city: "Galway, Ireland",
  tagline:
    "Conversations with founders building from Ireland. The early decisions, the wrong turns, and what they’d do differently.",
  spotify: "https://open.spotify.com/show/033DSDTDi7S8VOd5mSBl0W",
  youtube: "https://www.youtube.com/@VANO.shortz",
  instagram: "https://www.instagram.com/vano_podcast/",
};
export const BOOKING = { whatsapp: "353899817111" };
export const CONTACT = {
  linkedin: "https://www.linkedin.com/in/ayush-puri-4b88b8357/",
};
export const PLATFORMS = [
  {
    name: "Spotify",
    url: SHOW.spotify,
    handle: "VANO Podcast",
    note: "Listen to the full conversations",
  },
  {
    name: "YouTube",
    url: SHOW.youtube,
    handle: "@VANO.shortz",
    note: "Watch episodes & short clips",
  },
  {
    name: "Instagram",
    url: SHOW.instagram,
    handle: "@vano_podcast",
    note: "Follow the show",
  },
];
export type GuestLink = { label: string; url: string };
export type Episode = {
  number: number;
  slug: string;
  title: string;
  guest: string;
  company?: string;
  date: string;
  length: string;
  duration: string;
  spotifyId: string;
  youtubeId: string;
  image: string;
  description: string;
  topics: string[];
  companyDescription?: string;
  links: GuestLink[];
  sources: GuestLink[];
};
export const EPISODES: Episode[] = [
  {
    number: 4,
    slug: "jack-garvey-ganzy",
    title: "Betting it all on USA",
    guest: "Jack Garvey",
    company: "Ganzy",
    date: "2026-08-24",
    length: "58 min",
    duration: "PT58M12S",
    spotifyId: "3sJHxzaGcY8VC0ZYgvQYQ0",
    youtubeId: "VtugPHTEOXo",
    image: "/podcast/ep04.jpg",
    description:
      "Jack Garvey joins Ayush and Michael to talk about building Ganzy, selling to Americans from Ireland, AI tools and the pull of San Francisco.",
    topics: [
      "Selling into the US",
      "AI & second brains",
      "Student life & admissions",
      "Moving to San Francisco",
    ],
    companyDescription:
      "Jack is the founder of Ganzy. In this conversation, he describes a student product spanning study, sport and college admissions. His public founder profile describes Ganzy as a platform for Leaving Cert planning, using real exam data. Explore his work and the direction behind the episode below.",
    links: [
      { label: "Ganzy · ganzy.ie", url: "https://ganzy.ie" },
      { label: "Jack Garvey · founder website", url: "https://jackgarvey.me/" },
    ],
    sources: [
      {
        label: "Original episode on Spotify",
        url: "https://open.spotify.com/episode/3sJHxzaGcY8VC0ZYgvQYQ0",
      },
      { label: "Jack’s public founder profile", url: "https://jackgarvey.me/" },
    ],
  },
  {
    number: 3,
    slug: "krios-ahroon-michael",
    title: "You need to think bigger",
    guest: "Ahroon Santhosh & Michael Sweeney Heffernan",
    company: "Kríos",
    date: "2026-07-27",
    length: "1 hr 24 min",
    duration: "PT1H24M50S",
    spotifyId: "30uFSwmdO6rmQDSgJz7fyT",
    youtubeId: "Xx-27DEZGzI",
    image: "/podcast/ep03.jpg",
    description:
      "The CEO and CTO of Kríos join the show from Cork for a conversation about ambition, vibe coding, creativity, books and building with AI.",
    topics: [
      "AI sales training",
      "Vibe coding",
      "Mindset & ambition",
      "Books & creativity",
    ],
    companyDescription:
      "Kríos builds AI roleplay and coaching for door-to-door sales teams. Based in Cork under Heloria Labs, its team includes CEO Ahroon Santhosh, CTO Michael Sweeney Heffernan and go-to-market lead Abraham Kurian. Ahroon and Michael are the two guests in this episode.",
    links: [
      { label: "Kríos · krios.ie", url: "https://www.krios.ie/" },
      {
        label: "Ahroon Santhosh · LinkedIn",
        url: "https://www.linkedin.com/in/ahroon-santhosh/",
      },
      {
        label: "Michael Sweeney Heffernan · LinkedIn",
        url: "https://www.linkedin.com/in/michael-sweeney-heffernan-589155354",
      },
      {
        label: "Kríos · LinkedIn",
        url: "https://ie.linkedin.com/company/kr%C3%ADos",
      },
    ],
    sources: [
      {
        label: "Original episode on Spotify",
        url: "https://open.spotify.com/episode/30uFSwmdO6rmQDSgJz7fyT",
      },
      {
        label: "Kríos · official team and company details",
        url: "https://www.krios.ie/about",
      },
    ],
  },
  {
    number: 2,
    slug: "milosz-nelka-business-at-17",
    title: "Building a business at 17",
    guest: "Milosz Nelka",
    date: "2026-07-15",
    length: "1 hr 10 min",
    duration: "PT1H10M7S",
    spotifyId: "32VJeQVWnjK1sg4YT241E5",
    youtubeId: "p2t0pcmo-HA",
    image: "/podcast/ep02.jpg",
    description:
      "A young entrepreneur from Cork on the habits and discipline behind balancing business, boxing and college while working towards bigger goals.",
    topics: [
      "Starting young",
      "Discipline & habits",
      "Boxing",
      "Business & college",
    ],
    links: [],
    sources: [
      {
        label: "Original episode on Spotify",
        url: "https://open.spotify.com/episode/32VJeQVWnjK1sg4YT241E5",
      },
    ],
  },
  {
    number: 1,
    slug: "vano-and-tech-startups",
    title: "VANO and tech startups",
    guest: "Ayush Puri",
    date: "2026-06-24",
    length: "1 hr 12 min",
    duration: "PT1H12M41S",
    spotifyId: "3nfizITYLmvT1w55LiDF7h",
    youtubeId: "_4a5ArpjuU8",
    image: "/podcast/ep01.jpg",
    description:
      "The first conversation. Ayush introduces the original VANO venture, its early pivots and the experience of building a startup as a student in Galway.",
    topics: [
      "The original VANO story",
      "Early pivots",
      "Student founders",
      "Building from Galway",
    ],
    links: [{ label: "Ayush Puri · LinkedIn", url: CONTACT.linkedin }],
    sources: [
      {
        label: "Original episode on Spotify",
        url: "https://open.spotify.com/episode/3nfizITYLmvT1w55LiDF7h",
      },
    ],
  },
];
// Editorial picks, checked against the public VANO.shorts feed on 2026-11-02.
// These are real published clips, not an all-time performance ranking.
export const CLIPS = [
  {
    id: "28nOfX6ZkM4",
    title: "Committing to your own path.",
    topic: "Founder mindset",
    caption:
      "Following society’s plan feels safe. Committing to your own path is the scary part.",
    date: "2026-11-01",
  },
  {
    id: "aNnQ5Cof6m8",
    title: "Three books. A different way to think.",
    topic: "Books & strategy",
    caption:
      "Three books worth reading if you want to think better about strategy.",
    date: "2026-10-30",
  },
  {
    id: "KpWCeDt3b5g",
    title: "Nobody warns you about selling.",
    topic: "Building a business",
    caption:
      "Nobody warns you how hard selling really is until you’re the one doing it.",
    date: "2026-10-31",
  },
  {
    id: "6B9SOdKJoHY",
    title: "Who gets to build now?",
    topic: "AI & making things",
    caption:
      "You don’t need a team of engineers anymore. AI lets anyone build the product.",
    date: "2026-11-01",
  },
];
export const NOTES = [
  {
    slug: "jack-garvey-ganzy",
    title: "Meet Jack Garvey, founder of Ganzy",
    description:
      "The founder and business behind episode four: Ganzy, selling into America and building from Ireland.",
    episode: 4,
  },
  {
    slug: "krios-founders",
    title: "Meet the Kríos team from Cork",
    description:
      "Ahroon Santhosh and Michael Sweeney Heffernan on the VANO Podcast, with links to their AI sales-training company.",
    episode: 3,
  },
];
export const PODCAST_PATHS = [
  "/",
  "/episodes",
  ...EPISODES.map((e) => `/episodes/${e.slug}`),
  "/clips",
  "/about",
  "/contact",
  "/notes",
  ...NOTES.map((n) => `/notes/${n.slug}`),
  "/site-privacy",
  "/site-terms",
];
export const episodeUrl = (e: Episode) =>
  `https://open.spotify.com/episode/${e.spotifyId}`;
export const formatDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Dublin",
  });
export const contactUrl = (format: string) =>
  `https://wa.me/${BOOKING.whatsapp}?text=${encodeURIComponent(`Hi VANO Podcast — I’d like to discuss a ${format} episode. My name and business: `)}`;
export function episodeSchema(e: Episode) {
  return {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    "@id": `${ORIGIN}/episodes/${e.slug}#episode`,
    name: e.title,
    description: e.description,
    episodeNumber: e.number,
    datePublished: e.date,
    timeRequired: e.duration,
    url: `${ORIGIN}/episodes/${e.slug}`,
    image: `${ORIGIN}${e.image}`,
    sameAs: [episodeUrl(e), `https://www.youtube.com/watch?v=${e.youtubeId}`],
    partOfSeries: {
      "@id": `${ORIGIN}/#show`,
      "@type": "PodcastSeries",
      name: SHOW.name,
    },
    about: e.company
      ? { "@type": "Organization", name: e.company, url: e.links[0].url }
      : undefined,
  };
}
export function seriesSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "PodcastSeries",
    "@id": `${ORIGIN}/#show`,
    name: SHOW.name,
    url: ORIGIN + "/",
    description: SHOW.tagline,
    inLanguage: "en-IE",
    image: ORIGIN + "/podcast/show.jpg",
    author: [
      { "@type": "Person", name: "Ayush Puri", sameAs: CONTACT.linkedin },
      { "@type": "Person", name: "Michael Okocha" },
    ],
    locationCreated: { "@type": "Place", name: SHOW.city },
    sameAs: [SHOW.spotify, SHOW.youtube, SHOW.instagram],
    episode: EPISODES.map(episodeSchema),
  };
}
