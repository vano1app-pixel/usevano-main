import {
  CLIPS,
  EPISODES,
  NOTES,
  ORIGIN,
  PODCAST_PATHS,
  SHOW,
} from "./podcast.js";
const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
export function podcastSitemap() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PODCAST_PATHS.map((p) => `<url><loc>${xmlEscape(ORIGIN + p)}</loc><lastmod>2026-11-02</lastmod></url>`).join("\n")}\n</urlset>\n`;
}
export function podcastLlms() {
  return [
    `# ${SHOW.name}`,
    "",
    `> ${SHOW.tagline} Hosted by ${SHOW.hosts} in ${SHOW.city}.`,
    "",
    "This domain formerly hosted VANO Jobs. Its public website is now VANO Podcast. The podcast website does not offer home-help bookings or helper jobs.",
    "",
    "## Official channels",
    `- [Spotify](${SHOW.spotify})`,
    `- [YouTube: @VANO.shortz](${SHOW.youtube})`,
    `- [Instagram: @vano_podcast](${SHOW.instagram})`,
    `- [Apple Podcasts](${SHOW.apple})`,
    `- [Amazon Music](${SHOW.amazon})`,
    "",
    "## Episodes",
    ...EPISODES.map(
      (e) =>
        `- [Episode ${e.number}: ${e.title} — ${e.guest}](${ORIGIN}/episodes/${e.slug}): ${e.description} Published ${e.date}.`,
    ),
    "",
    "## Guest businesses",
    ...EPISODES.filter((e) => e.company).map(
      (e) =>
        `- ${e.company}: ${e.companyDescription} Links: ${e.links.map((l) => `[${l.label}](${l.url})`).join(", ")}`,
    ),
    "",
    "## Selected clips",
    ...CLIPS.map(
      (c) =>
        `- [${c.title}](https://www.youtube.com/shorts/${c.id}): Episode ${c.episode}, ${c.guest}. ${c.caption}`,
    ),
    "",
    "## Show notes",
    ...NOTES.map(
      (n) => `- [${n.title}](${ORIGIN}/notes/${n.slug}): ${n.description}`,
    ),
    "",
    "## Contact",
    `- [Be a guest](${ORIGIN}/contact): Discuss a remote or Galway recording with the hosts. Formats, timing, deliverables and any costs are agreed before booking.`,
    "",
    "## Accuracy",
    "Episode titles, dates and links were checked against the public Spotify show on 2 November 2026. Company details are source-linked on the episode pages. Clips are editorial picks, not an all-time ranking. No complete transcripts are published on this website. Ganzy’s website failed DNS when checked; Jack Garvey’s public site provides alternative company context.",
    "",
  ].join("\n");
}
