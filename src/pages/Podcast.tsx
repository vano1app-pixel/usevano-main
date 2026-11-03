import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Play,
  X,
  Headphones,
} from "lucide-react";
import GuestEnquiryForm from "@/components/podcast/GuestEnquiryForm";
import { SEOHead } from "@/components/SEOHead";
import {
  CLIPS,
  CONTACT,
  EPISODES,
  NOTES,
  ORIGIN,
  PLATFORMS,
  SHOW,
  episodeSchema,
  episodeUrl,
  formatDate,
  seriesSchema,
  type Episode,
} from "@/content/podcast";

export const External = ({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={className}
  >
    {children}
  </a>
);
export function PodcastMeta({
  title,
  description,
  path = "/",
  jsonLd,
  noindex = false,
}: {
  title: string;
  description: string;
  path?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}) {
  return (
    <SEOHead
      title={title}
      description={description}
      url={ORIGIN + path}
      image={ORIGIN + "/podcast/og-podcast.png"}
      keywords="VANO Podcast, Irish founder podcast, Galway, entrepreneurship, Ayush Puri, Michael Okocha, Kríos, Ganzy"
      jsonLd={jsonLd}
      noindex={noindex}
    />
  );
}
export const Wave = () => (
  <span className="vp-wave" aria-hidden="true">
    {Array.from({ length: 13 }, (_, i) => (
      <i
        key={i}
        style={{
          height: `${8 + Math.abs(Math.sin(i * 1.8)) * 20}px`,
          animationDelay: `${i * 45}ms`,
        }}
      />
    ))}
  </span>
);
export function EpisodeCard({ episode: e }: { episode: Episode }) {
  return (
    <article className="vp-episode">
      <Link
        to={`/episodes/${e.slug}`}
        className="vp-art"
        aria-label={`Episode ${e.number}: ${e.title}`}
      >
        <img
          src={e.image}
          alt={`${e.guest}, VANO Podcast episode ${e.number}`}
          width="1280"
          height="720"
          loading="lazy"
        />
        <span className="vp-play">
          <Play size={18} fill="currentColor" />
        </span>
      </Link>
      <div className="vp-meta">
        EP. {String(e.number).padStart(2, "0")}
        <span>{e.length}</span>
      </div>
      <h3>
        <Link to={`/episodes/${e.slug}`}>{e.title}</Link>
      </h3>
      <p>
        {e.guest}
        {e.company && ` · ${e.company}`}
      </p>
      <Link to={`/episodes/${e.slug}`} className="vp-text-link">
        Episode & guest links <ArrowUpRight size={15} />
      </Link>
    </article>
  );
}
export function ClipShelf({ full = false }: { full?: boolean }) {
  const [filter, setFilter] = useState("All");
  const Heading = full ? "h1" : "h2";
  const visible = CLIPS.filter(
    (c) =>
      filter === "All" ||
      (filter === "Mindset"
        ? c.topic === "Founder mindset"
        : c.topic !== "Founder mindset"),
  );
  return (
    <section className={`vp-clips ${full ? "vp-clips-full" : ""}`} id="clips">
      <div className="vp-wrap">
        <div className="vp-section-top">
          <div>
            <p className="vp-kicker">
              A little less scrolling. A little more substance.
            </p>
            <Heading>
              {full ? "The short version." : "Big ideas. Short cuts."}
            </Heading>
          </div>
          {!full && (
            <Link to="/clips" className="vp-text-link">
              Explore the clips <ArrowUpRight size={17} />
            </Link>
          )}
        </div>
        <p className="vp-section-intro">
          A few of our favourite moments from the conversations. Pick one and
          watch it on YouTube.
        </p>
        {full && (
          <div className="vp-filters" aria-label="Filter clips">
            {["All", "Mindset", "Building & ideas"].map((f) => (
              <button
                type="button"
                key={f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        )}
        <div className="vp-clip-grid">
          {visible.map((c, i) => (
            <External
              key={c.id}
              href={`https://www.youtube.com/shorts/${c.id}`}
              className="vp-clip"
            >
              <div className="vp-clip-image">
                <img
                  src={`/podcast/clip-${c.id}.jpg`}
                  alt=""
                  width="480"
                  height="360"
                  loading="lazy"
                />
                <span className="vp-clip-number">0{i + 1} / SELECTED</span>
                <span className="vp-play">
                  <Play size={21} fill="currentColor" />
                </span>
              </div>
              <div className="vp-clip-copy">
                <span>
                  EP. {String(c.episode).padStart(2, "0")} / {c.guest}
                </span>
                <h3>{c.title}</h3>
                <p>
                  Watch clip <ArrowUpRight size={14} />
                </p>
              </div>
            </External>
          ))}
        </div>
        <div className="vp-clip-bottom">
          <span>Selected moments. Full conversations always available.</span>
          <External href={`${SHOW.youtube}/shorts`}>
            More on @VANO.shortz <ArrowUpRight size={16} />
          </External>
        </div>
      </div>
    </section>
  );
}
export function Platforms() {
  return (
    <section className="vp-platforms vp-wrap">
      <p className="vp-kicker">The full story. Your favourite format.</p>
      <div className="vp-platform-grid">
        {PLATFORMS.map((p, i) => (
          <External key={p.name} href={p.url} className="vp-platform">
            <span className="vp-platform-index">0{i + 1}</span>
            <div>
              <h3>{p.name}</h3>
              <p>{p.handle}</p>
              <small>{p.note}</small>
            </div>
            <ArrowUpRight size={23} />
          </External>
        ))}
      </div>
    </section>
  );
}
export function GuestInvite() {
  return (
    <section className="vp-invite vp-wrap">
      <div>
        <p className="vp-kicker">Pull up a chair.</p>
        <h2>
          Building something?
          <br />
          Let’s talk about it.
        </h2>
      </div>
      <div>
        <p>
          Tell us what you’re working on. Record remotely or join us in Galway.
          Start a conversation about your episode, your business and the clips
          that come from it.
        </p>
        <Link to="/contact" className="vp-button">
          Be a guest <ArrowUpRight size={18} />
        </Link>
        <small>Talk to the hosts. Agree the details together.</small>
      </div>
    </section>
  );
}
export function HostSection() {
  return (
    <section className="vp-hosts vp-wrap">
      <div>
        <p className="vp-kicker">Two hosts. Plenty of questions.</p>
        <h2>
          Curiosity is
          <br />
          the whole point.
        </h2>
      </div>
      <div>
        <p className="vp-host-intro">
          We’re Ayush Puri and Michael Okocha. From Galway, we sit down with
          founders to hear how they think, what they’re making and what it took
          to get here.
        </p>
        <div className="vp-host-names">
          <div>
            <span>01 / CO-HOST</span>
            <h3>Ayush Puri</h3>
            <External href={CONTACT.linkedin}>
              Connect on LinkedIn <ArrowUpRight size={14} />
            </External>
          </div>
          <div>
            <span>02 / CO-HOST</span>
            <h3>Michael Okocha</h3>
            <p>VANO Podcast · Galway</p>
          </div>
        </div>
      </div>
    </section>
  );
}
export default function Podcast() {
  const e = EPISODES[0];
  return (
    <>
      <PodcastMeta
        title="VANO Podcast — founders, on the record"
        description={`${SHOW.tagline} Hosted by ${SHOW.hosts} in Galway. Listen to episodes, watch clips and meet the guests.`}
        jsonLd={seriesSchema()}
      />
      <section className="vp-hero vp-wrap">
        <div className="vp-hero-copy">
          <p className="vp-kicker">
            <span className="vp-dot" /> FROM GALWAY, IRELAND
          </p>
          <h1>
            Founders,
            <br />
            on the
            <br />
            <em>record.</em>
          </h1>
          <p className="vp-hero-description">
            The big bets. The early mistakes.
            <br />
            The people figuring it out as they go.
          </p>
          <div className="vp-hero-actions">
            <Link className="vp-button" to={`/episodes/${e.slug}`}>
              <Play size={16} fill="currentColor" /> Start with the latest
            </Link>
            <a href="#episodes" className="vp-text-link">
              All episodes <ArrowDown size={16} />
            </a>
          </div>
          <p className="vp-hero-hosts">With Ayush Puri & Michael Okocha</p>
        </div>
        <div className="vp-hero-feature">
          <div className="vp-feature-label">
            <Wave />
            <span>NEW EPISODE</span>
            <span>EP. {String(e.number).padStart(2, "0")}</span>
          </div>
          <Link to={`/episodes/${e.slug}`} className="vp-feature-image">
            <img
              src={e.image}
              alt={`${e.guest} on episode ${e.number}: ${e.title}`}
              width="1280"
              height="720"
              loading="eager"
            />
            <span className="vp-feature-watch">
              <Play size={19} fill="currentColor" /> Watch the conversation
            </span>
          </Link>
          <div className="vp-feature-caption">
            <div>
              <p>
                {e.guest.toUpperCase()}
                {e.company && ` / ${e.company.toUpperCase()}`}
              </p>
              <h2>
                <Link to={`/episodes/${e.slug}`}>{e.title}.</Link>
              </h2>
            </div>
            <Link
              to={`/episodes/${e.slug}`}
              className="vp-round"
              aria-label={`Explore the ${e.guest} episode`}
            >
              <ArrowUpRight />
            </Link>
          </div>
          <div className="vp-feature-footer">
            <span>
              {formatDate(e.date)} · {e.length}
            </span>
            {e.links[0] && (
              <External href={e.links[0].url}>
                Meet the guest <ArrowUpRight size={14} />
              </External>
            )}
          </div>
        </div>
      </section>
      <div className="vp-programme">
        <div className="vp-wrap">
          <span>
            LONG CONVERSATIONS.
            <br />
            REAL PEOPLE.
          </span>
          <p>
            Startups, ambition and figuring things out.
            <br />
            <b>Built from Ireland. Open to anyone curious.</b>
          </p>
          <Wave />
        </div>
      </div>
      <section id="episodes" className="vp-episodes vp-wrap">
        <div className="vp-section-top">
          <div>
            <p className="vp-kicker">Take a seat. Stay for the story.</p>
            <h2>Worth a proper listen.</h2>
          </div>
          <Link to="/episodes" className="vp-text-link">
            All {EPISODES.length} episodes <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="vp-episode-grid">
          {EPISODES.map((ep) => (
            <EpisodeCard key={ep.number} episode={ep} />
          ))}
        </div>
      </section>
      <ClipShelf />
      <Platforms />
      <section className="vp-businesses vp-wrap">
        <p className="vp-kicker">
          Meet the businesses behind the conversations
        </p>
        <div className="vp-business-grid">
          <div>
            <h2>Kríos</h2>
            <p>
              AI sales practice, built in Cork. Meet Ahroon Santhosh and Michael
              Sweeney Heffernan in episode three.
            </p>
            <Link to="/episodes/krios-ahroon-michael" className="vp-text-link">
              Meet the team & their work <ArrowUpRight size={16} />
            </Link>
            <External href="https://www.krios.ie/" className="vp-company-url">
              krios.ie <ArrowUpRight size={14} />
            </External>
          </div>
          <div>
            <h2>Ganzy</h2>
            <p>
              Jack Garvey on students, study and taking an Irish startup towards
              America. Get the story in episode four.
            </p>
            <Link to="/episodes/jack-garvey-ganzy" className="vp-text-link">
              Meet Jack & explore Ganzy <ArrowUpRight size={16} />
            </Link>
            <External href="https://ganzy.ie" className="vp-company-url">
              ganzy.ie <ArrowUpRight size={14} />
            </External>
          </div>
        </div>
      </section>
      <HostSection />
      <GuestInvite />
    </>
  );
}
export function EpisodesPage() {
  return (
    <>
      <PodcastMeta
        title="Episodes — VANO Podcast"
        description="Every VANO Podcast conversation: Frank Forde of Saudade & Sláinte, Jack Garvey of Ganzy, the Kríos team, Milosz Nelka and the original VANO story."
        path="/episodes"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "VANO Podcast episodes",
          url: ORIGIN + "/episodes",
          mainEntity: seriesSchema(),
        }}
      />
      <section className="vp-wrap vp-page-heading">
        <p className="vp-kicker">The conversations, in full.</p>
        <h1>
          Get to know
          <br />
          the people building.
        </h1>
        <p>
          {EPISODES.length} conversations from Ireland. Pick a person, follow an
          idea.
        </p>
      </section>
      <section className="vp-wrap vp-episodes">
        <div className="vp-episode-grid vp-episode-grid-large">
          {EPISODES.map((e) => (
            <EpisodeCard key={e.number} episode={e} />
          ))}
        </div>
      </section>
      <GuestInvite />
    </>
  );
}
function EpisodePlayer({ episode: e }: { episode: Episode }) {
  const [open, setOpen] = useState(false);
  if (!e.youtubeId)
    return (
      <div className="vp-player">
        <External className="vp-player-cover" href={episodeUrl(e)}>
          <img src={e.image} alt="" width="1280" height="720" />
          <span className="vp-feature-watch">
            <Play size={20} fill="currentColor" /> Watch on Spotify{" "}
            <ArrowUpRight size={16} />
          </span>
        </External>
      </div>
    );
  return (
    <div className="vp-player">
      <button
        className="vp-player-cover"
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="episode-video"
      >
        <img src={e.image} alt="" width="1280" height="720" />
        <span className="vp-feature-watch">
          {open ? <X size={20} /> : <Play size={20} fill="currentColor" />}
          {open ? "Close video" : "Play the full episode"}
        </span>
      </button>
      {open && (
        <div id="episode-video" className="vp-embed">
          <iframe
            title={`${e.title} — full VANO Podcast episode`}
            src={`https://www.youtube-nocookie.com/embed/${e.youtubeId}?autoplay=1`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p>
            Player not loading?{" "}
            <External href={`https://www.youtube.com/watch?v=${e.youtubeId}`}>
              Watch directly on YouTube <ArrowUpRight size={14} />
            </External>
          </p>
        </div>
      )}
    </div>
  );
}
export function EpisodePage() {
  const { slug } = useParams();
  const e = EPISODES.find((ep) => ep.slug === slug);
  if (!e) return <MissingPage />;
  return (
    <>
      <PodcastMeta
        title={`${e.title} with ${e.guest} — Ep. ${e.number}`}
        description={e.description}
        path={`/episodes/${e.slug}`}
        jsonLd={[
          episodeSchema(e),
          {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Episodes",
                item: ORIGIN + "/episodes",
              },
              {
                "@type": "ListItem",
                position: 2,
                name: e.title,
                item: `${ORIGIN}/episodes/${e.slug}`,
              },
            ],
          },
        ]}
      />
      <article className="vp-wrap vp-episode-detail">
        <Link to="/episodes" className="vp-text-link">
          ← All episodes
        </Link>
        <div className="vp-detail-heading">
          <div>
            <p className="vp-kicker">
              EPISODE {String(e.number).padStart(2, "0")} / {e.length}
            </p>
            <h1>{e.title}.</h1>
            <p className="vp-detail-guest">
              With {e.guest}
              {e.company && ` · ${e.company}`}
            </p>
          </div>
          <p className="vp-detail-date">
            {formatDate(e.date)}
            <br />
            Hosted by Ayush & Michael
          </p>
        </div>
        <EpisodePlayer episode={e} />
        <div className="vp-detail-body">
          <div>
            <p className="vp-kicker">In this conversation</p>
            <h2>
              The story behind
              <br />
              the ambition.
            </h2>
            <p>{e.description}</p>
            <div className="vp-topic-list">
              {e.topics.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <External href={episodeUrl(e)} className="vp-button">
              <Headphones size={17} /> Listen on Spotify{" "}
              <ArrowUpRight size={16} />
            </External>
          </div>
          <aside>
            <p className="vp-kicker">
              {e.company ? "Meet the business" : "Meet the guest"}
            </p>
            <h2>{e.company || e.guest}</h2>
            {e.companyDescription && <p>{e.companyDescription}</p>}
            {e.number === 4 && (
              <p className="vp-source-note">
                Ganzy’s domain was unavailable when checked on 2 November 2026.
                Jack’s own site is another way to explore his work.
              </p>
            )}
            <div className="vp-guest-links">
              {e.links.map((l) => (
                <External key={l.url} href={l.url}>
                  {l.label}
                  <ArrowUpRight size={16} />
                </External>
              ))}
            </div>
            <details className="vp-sources">
              <summary>Sources & episode details</summary>
              <p>
                Episode details from the published Spotify feed. Company context
                checked 2 November 2026; it may have evolved since recording.
              </p>
              {e.sources.map((s) => (
                <External key={s.url} href={s.url}>
                  {s.label}
                  <ArrowUpRight size={13} />
                </External>
              ))}
            </details>
          </aside>
        </div>
      </article>
      <section className="vp-wrap vp-episodes">
        <div className="vp-section-top">
          <h2>Keep the conversation going.</h2>
        </div>
        <div className="vp-episode-grid">
          {EPISODES.filter((x) => x.number !== e.number)
            .slice(0, 2)
            .map((ep) => (
              <EpisodeCard key={ep.number} episode={ep} />
            ))}
        </div>
      </section>
    </>
  );
}
export function ClipsPage() {
  return (
    <>
      <PodcastMeta
        title="Clips — VANO Podcast"
        description="Watch VANO Podcast moments from episodes one, two and four: founder choices, starting an AI agency and creating value, linked to the original YouTube posts."
        path="/clips"
      />
      <ClipShelf full />
      <Platforms />
    </>
  );
}
export function AboutPage() {
  return (
    <>
      <PodcastMeta
        title="About Ayush & Michael — VANO Podcast"
        description="Meet VANO Podcast hosts Ayush Puri and Michael Okocha. Founder interviews and conversations from Galway, Ireland."
        path="/about"
      />
      <section className="vp-wrap vp-page-heading">
        <p className="vp-kicker">An Irish podcast. A curious outlook.</p>
        <h1>
          Behind every business,
          <br />
          there’s a person.
        </h1>
        <p>
          That’s who we want to talk to. VANO is a podcast about founders, the
          decisions they make and the things they learn along the way.
        </p>
      </section>
      <HostSection />
      <section className="vp-wrap vp-prose">
        <h2>From Galway, with questions.</h2>
        <p>
          {SHOW.tagline} The archive includes Frank Forde of Saudade & Sláinte,
          Jack Garvey of Ganzy, Ahroon Santhosh and Michael Sweeney Heffernan of
          Kríos, Milosz Nelka, and the story behind the original VANO venture.
        </p>
        <Link className="vp-text-link" to="/episodes">
          Explore the conversations <ArrowRight size={16} />
        </Link>
      </section>
      <GuestInvite />
    </>
  );
}
export function ContactPage() {
  return (
    <>
      <PodcastMeta
        title="Be a guest — VANO Podcast"
        description="Pitch your VANO Podcast episode. Choose digital or in-person recording in Galway and send your idea directly to the hosts."
        path="/contact"
      />
      <section className="vp-wrap vp-page-heading">
        <p className="vp-kicker">Your story, on the record.</p>
        <h1>Pull up a chair.</h1>
        <p>
          Tell us who you are, what you’re building and what you’d like to talk
          about. We’ll discuss the format, timing, clips and any costs before
          anything is booked.
        </p>
      </section>
      <GuestEnquiryForm />
      <section className="vp-wrap vp-prose">
        <h2>Something else in mind?</h2>
        <p>
          For sponsorship, a collaboration, a correction or a question about the
          show, reach Ayush directly.
        </p>
        <External className="vp-text-link" href={CONTACT.linkedin}>
          Contact Ayush on LinkedIn <ArrowUpRight size={16} />
        </External>
      </section>
    </>
  );
}
export function NotesPage() {
  return (
    <>
      <PodcastMeta
        title="Notes from the show — VANO Podcast"
        description="Guest and company notes from the VANO Podcast, with sources, episode links and the businesses behind the conversations."
        path="/notes"
      />
      <section className="vp-wrap vp-page-heading">
        <p className="vp-kicker">Notes from the show</p>
        <h1>Follow the story.</h1>
        <p>People, businesses and useful links from our conversations.</p>
      </section>
      <div className="vp-wrap vp-notes">
        {NOTES.map((n) => (
          <article key={n.slug}>
            <span>EPISODE {n.episode}</span>
            <h2>
              <Link to={`/notes/${n.slug}`}>{n.title}</Link>
            </h2>
            <p>{n.description}</p>
            <Link to={`/notes/${n.slug}`} className="vp-text-link">
              Read the notes <ArrowUpRight size={16} />
            </Link>
          </article>
        ))}
      </div>
    </>
  );
}
export function NotePage() {
  const { slug } = useParams();
  const n = NOTES.find((x) => x.slug === slug);
  const e = EPISODES.find((x) => x.number === n?.episode);
  if (!n || !e) return <MissingPage />;
  return (
    <>
      <PodcastMeta
        title={`${n.title} — VANO Podcast notes`}
        description={n.description}
        path={`/notes/${n.slug}`}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: n.title,
          description: n.description,
          datePublished: "2026-11-02",
          dateModified: "2026-11-02",
          author: { "@type": "Organization", name: SHOW.name, url: ORIGIN },
          mainEntityOfPage: `${ORIGIN}/notes/${n.slug}`,
          about: e.company
            ? { "@type": "Organization", name: e.company, url: e.links[0].url }
            : undefined,
          image: ORIGIN + e.image,
        }}
      />
      <article className="vp-wrap vp-prose vp-note-detail">
        <Link to="/notes" className="vp-text-link">
          ← Notes from the show
        </Link>
        <p className="vp-kicker">
          EPISODE {e.number} / UPDATED 2 NOVEMBER 2026
        </p>
        <h1>{n.title}.</h1>
        <p className="vp-lead">{e.description}</p>
        <img
          src={e.image}
          alt={`${e.guest} on the VANO Podcast`}
          width="1280"
          height="720"
        />
        <h2>The business behind the conversation</h2>
        <p>{e.companyDescription}</p>
        <h2>What we talked about</h2>
        <ul>
          {e.topics.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <h2>Explore their work</h2>
        <div className="vp-guest-links">
          {e.links.map((l) => (
            <External key={l.url} href={l.url}>
              {l.label}
              <ArrowUpRight size={16} />
            </External>
          ))}
        </div>
        <p className="vp-source-note">
          Company information is based on the linked public sources checked on 2
          November 2026. It is context alongside the episode, rather than a
          transcript.{" "}
          {e.number === 4
            ? "Ganzy’s domain was unavailable when checked; Jack’s website is an alternative source."
            : ""}
        </p>
        <h2>Listen to the episode</h2>
        <Link className="vp-button" to={`/episodes/${e.slug}`}>
          <Play size={16} /> Watch & listen <ArrowRight size={16} />
        </Link>
        <h2>Sources</h2>
        <div className="vp-guest-links">
          {e.sources.map((l) => (
            <External key={l.url} href={l.url}>
              {l.label}
              <ArrowUpRight size={16} />
            </External>
          ))}
        </div>
      </article>
    </>
  );
}
export function PolicyPage({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  return (
    <>
      <PodcastMeta
        title={`${privacy ? "Privacy" : "Website terms"} — VANO Podcast`}
        description={
          privacy
            ? "How the VANO Podcast website uses information, analytics and links to third-party listening and contact platforms."
            : "Information about the VANO Podcast website, its episodes, external links and guest enquiries."
        }
        path={`/site-${kind}`}
      />
      <article className="vp-wrap vp-prose vp-note-detail">
        <p className="vp-kicker">VANO Podcast / UPDATED 2 NOVEMBER 2026</p>
        <h1>{privacy ? "Privacy, plainly." : "Using this site."}</h1>
        {privacy ? (
          <>
            <p>
              This website introduces the VANO Podcast, its episodes, clips and
              guests. You can browse without creating an account.
            </p>
            <h2>Information and analytics</h2>
            <p>
              The site uses Google Analytics to understand visits. Where
              configured, PostHog may collect usage information and session
              recordings, with input values masked, and Sentry may receive
              technical error information. Browser and network services may
              process device information, IP addresses and request logs. This
              page does not ask you for payment or account details.
            </p>
            <h2>Video, fonts and external links</h2>
            <p>
              Episode videos connect to YouTube only after you choose to load
              the player. Fonts may load from Google Fonts. Following a Spotify,
              YouTube, Instagram, LinkedIn or guest link opens a service with
              its own privacy policy. Choosing a WhatsApp enquiry opens a
              prepared message; it does not send it automatically.
            </p>
            <h2>Contact and requests</h2>
            <p>
              If you submit a guest enquiry, we use your name, email, recording
              preference and the details you choose to share to reply and
              discuss your episode. The form sends these details to the hosts by
              email through Resend. It does not subscribe you to marketing.
              Please avoid sharing sensitive information. You can ask us to
              access or delete your enquiry. For privacy questions, contact
              Ayush using the link below.
            </p>
          </>
        ) : (
          <>
            <p>
              VANO Podcast is a founder-interview show hosted by Ayush Puri and
              Michael Okocha in Galway, Ireland. The website provides episode
              information and links to listening platforms, clips and guest
              businesses.
            </p>
            <h2>Episodes and guest information</h2>
            <p>
              Conversations reflect the participants’ views and the context of
              recording. Company descriptions may change over time. Source links
              help you check current information. The content is for general
              information.
            </p>
            <h2>Guest enquiries</h2>
            <p>
              Contacting the show does not confirm a booking. Recording
              arrangements, deliverables, timing and any costs are agreed
              directly with the hosts before a commitment.
            </p>
            <h2>Links and corrections</h2>
            <p>
              External services operate independently. If a link breaks or a
              detail needs correction, please contact the hosts. No home-help
              services or jobs are offered through this podcast website.
            </p>
          </>
        )}
        <External href={CONTACT.linkedin} className="vp-text-link">
          Contact Ayush <ArrowUpRight size={16} />
        </External>
      </article>
    </>
  );
}
export function MissingPage() {
  return (
    <>
      <PodcastMeta
        title="Page not found — VANO Podcast"
        description="Find your next VANO Podcast conversation in the episode archive."
        noindex
      />
      <section className="vp-wrap vp-page-heading">
        <p className="vp-kicker">404 / A quiet moment.</p>
        <h1>Lost the thread?</h1>
        <p>
          That page isn’t here. There’s a good conversation waiting in the
          archive.
        </p>
        <Link to="/episodes" className="vp-button">
          Find an episode <ArrowRight size={16} />
        </Link>
      </section>
    </>
  );
}
