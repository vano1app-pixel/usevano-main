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
  apple: "https://podcasts.apple.com/ie/podcast/vano-podcast/id6804809081",
  amazon:
    "https://music.amazon.com/podcasts/f35fd03a-4570-4d5b-b708-32d37c1cd6c1/vano-podcast",
  feed: "https://anchor.fm/s/11429ec5c/podcast/rss",
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
    note: "Watch & listen",
    icon: "spotify",
  },
  {
    name: "Apple Podcasts",
    url: SHOW.apple,
    handle: "VANO Podcast",
    note: "Listen to the show",
    icon: "applepodcasts",
  },
  {
    name: "YouTube",
    url: SHOW.youtube,
    handle: "@VANO.shortz",
    note: "Episodes & clips",
    icon: "youtube",
  },
  {
    name: "Amazon Music",
    url: SHOW.amazon,
    handle: "VANO Podcast",
    note: "Listen to the show",
    icon: "amazonmusic",
  },
  {
    name: "Instagram",
    url: SHOW.instagram,
    handle: "@vano_podcast",
    note: "Clips & updates",
    icon: "instagram",
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
  youtubeId?: string;
  companyUrl?: string;
  image: string;
  description: string;
  topics: string[];
  companyDescription?: string;
  links: GuestLink[];
  sources: GuestLink[];
};
export const EPISODES: Episode[] = [
  {
    number: 5,
    slug: "frank-forde-whiskey-born-from-love",
    title: "A Whiskey Born From Love",
    guest: "Frank Forde",
    company: "Saudade & Sláinte",
    date: "2026-11-02",
    length: "44 min",
    duration: "PT44M11S",
    spotifyId: "0j8s4tswMxcj7ser5JdGYF",
    image: "/podcast/ep05.png",
    description:
      "Frank Forde joins VANO Podcast to discuss building Saudade & Sláinte Irish Whiskey: the Irish-Brazilian love story behind the brand, its target market, marketing, pricing and the challenges of starting a whiskey business.",
    topics: [
      "The story behind the brand",
      "Irish & Brazilian culture",
      "Finding a target market",
      "Marketing & pricing",
    ],
    companyDescription:
      "Saudade & Sláinte is the Irish whiskey venture founded by Dunmore native Frank Forde with Galway partners Gareth Carrick and Mark Kavanagh. The brand brings together Frank’s Irish roots and his Brazilian wife Joecy’s culture. Frank’s own profile describes his VANO conversation as a founder interview about the brand, its market and building the company.",
    links: [
      {
        label: "Frank Forde · LinkedIn",
        url: "https://ie.linkedin.com/in/frank-forde-09b759445",
      },
    ],
    sources: [
      {
        label: "Original episode on Spotify",
        url: "https://open.spotify.com/episode/0j8s4tswMxcj7ser5JdGYF",
      },
      {
        label: "Frank’s founder profile & VANO interview details",
        url: "https://ie.linkedin.com/in/frank-forde-09b759445",
      },
      {
        label: "The Tuam Herald · the story behind the brand",
        url: "https://www.tuamherald.ie/2026/10/20/unique-whiskey-blend-tells-a-dunmore-brazilian-love-story/",
      },
    ],
  },
  {
    number: 4,
    slug: "jack-garvey-ganzy",
    title: "Betting it all on USA",
    guest: "Jack Garvey",
    company: "Ganzy",
    companyUrl: "https://ganzy.ie",
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
    companyUrl: "https://www.krios.ie/",
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
// Published Shorts checked against @VANO.shortz's catalogue on 2026-11-02.
// Guest/episode attribution checked against the original episode artwork.
// A varied editorial selection, not an all-time performance ranking.
export const CLIPS = [
  {
    id: "28nOfX6ZkM4",
    title: "Committing to your own path.",
    topic: "Founder mindset",
    caption: "Jack Garvey on choosing your own direction.",
    episode: 4,
    guest: "Jack Garvey · Ganzy",
  },
  {
    id: "Rp_ECuzP0ic",
    title: "How an AI agency began.",
    topic: "Building a business",
    caption: "Milosz Nelka on how his AI agency came about.",
    episode: 2,
    guest: "Milosz Nelka",
  },
  {
    id: "jl5HQ1lnyyA",
    title: "Create value first.",
    topic: "Building a business",
    caption:
      "A moment from our first conversation about creating value for people.",
    episode: 1,
    guest: "Ayush Puri · Team VANO",
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
    sameAs: [
      episodeUrl(e),
      ...(e.youtubeId
        ? [`https://www.youtube.com/watch?v=${e.youtubeId}`]
        : []),
    ],
    partOfSeries: {
      "@id": `${ORIGIN}/#show`,
      "@type": "PodcastSeries",
      name: SHOW.name,
    },
    about: e.company
      ? { "@type": "Organization", name: e.company, url: e.companyUrl }
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
    sameAs: [
      SHOW.spotify,
      SHOW.apple,
      SHOW.youtube,
      SHOW.amazon,
      SHOW.instagram,
    ],
    episode: EPISODES.map(episodeSchema),
  };
}

export type ListenerComment = {
  quote: string;
  platform: string;
  sourceUrl: string;
};
// Only genuine supplied/verified comments belong here. Do not store author
// names or avatars in the public bundle; a CSS blur alone is not redaction.
export const LISTENER_COMMENTS: ListenerComment[] = [];
