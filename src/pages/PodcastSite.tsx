import React, { useEffect } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import Podcast, {
  AboutPage,
  ClipsPage,
  ContactPage,
  EpisodePage,
  EpisodesPage,
  MissingPage,
  NotePage,
  NotesPage,
  PolicyPage,
  External,
  Wave,
} from "./Podcast";
import { SHOW } from "@/content/podcast";

export default function PodcastSite() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return (
    <div className="vp-site">
      <a href="#main" className="vp-skip">
        Skip to content
      </a>
      <header className="vp-header vp-wrap">
        <Link to="/" className="vp-brand" aria-label="VANO Podcast home">
          <img src="/podcast/show.jpg" alt="" width="48" height="48" />
          <span>
            VANO<small>PODCAST</small>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/episodes">Episodes</NavLink>
          <NavLink to="/clips">Clips</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
        <Link to="/contact" className="vp-nav-cta">
          Be a guest <ArrowUpRight size={15} />
        </Link>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Podcast />} />
          <Route path="/episodes" element={<EpisodesPage />} />
          <Route path="/episodes/:slug" element={<EpisodePage />} />
          <Route path="/clips" element={<ClipsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/notes/:slug" element={<NotePage />} />
          <Route path="/site-privacy" element={<PolicyPage kind="privacy" />} />
          <Route path="/site-terms" element={<PolicyPage kind="terms" />} />
          <Route path="/blog/*" element={<Navigate to="/notes" replace />} />
          <Route path="/support" element={<Navigate to="/contact" replace />} />
          {[
            "cleaning-galway",
            "laundry-galway",
            "laundry-service-galway",
            "moving-help-galway",
            "garden-help-galway",
            "dog-walking-galway",
            "glossary/*",
          ].map((p) => (
            <Route
              key={p}
              path={`/${p}`}
              element={<Navigate to="/" replace />}
            />
          ))}
          <Route path="*" element={<MissingPage />} />
        </Routes>
      </main>
      <footer className="vp-footer">
        <div className="vp-wrap">
          <div className="vp-footer-top">
            <Link to="/" className="vp-footer-brand">
              VANO<span>PODCAST</span>
            </Link>
            <p>
              Good conversations.
              <br />
              From Galway, Ireland.
            </p>
            <Wave />
          </div>
          <div className="vp-footer-bottom">
            <span>© {new Date().getFullYear()} VANO Podcast</span>
            <nav aria-label="Footer navigation">
              <External href={SHOW.spotify}>Spotify</External>
              <External href={SHOW.apple}>Apple Podcasts</External>
              <External href={SHOW.amazon}>Amazon Music</External>
              <External href={SHOW.youtube}>YouTube</External>
              <External href={SHOW.instagram}>Instagram</External>
              <Link to="/notes">Show notes</Link>
              <Link to="/contact">Contact</Link>
              <Link to="/site-privacy">Privacy</Link>
              <Link to="/site-terms">Terms</Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
