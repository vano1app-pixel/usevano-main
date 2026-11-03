import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pause,
  Play,
} from "lucide-react";
import { EPISODES, formatDate } from "@/content/podcast";

const mod = (value: number) => (value + EPISODES.length) % EPISODES.length;
const position = (index: number, active: number) => {
  let delta = mod(index - active);
  if (delta > Math.floor(EPISODES.length / 2)) delta -= EPISODES.length;
  return delta;
};
export default function EpisodeCarousel() {
  const [active, setActive] = useState(0);
  const [automatic, setAutomatic] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const gesture = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const current = EPISODES[active];
  const latest = current.number === EPISODES[0].number;
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    const visibility = () => setVisible(!document.hidden);
    update();
    visibility();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!automatic || reducedMotion || hovered || !visible) return;
    const timer = window.setInterval(
      () => setActive((value) => mod(value + 1)),
      8000,
    );
    return () => window.clearInterval(timer);
  }, [automatic, reducedMotion, hovered, visible]);
  function choose(index: number) {
    setAutomatic(false);
    setActive(mod(index));
  }
  return (
    <section
      className="vp-stage"
      role="region"
      aria-roledescription="carousel"
      aria-label="VANO Podcast episodes"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
      onFocusCapture={(event) => {
        if (!(event.target as HTMLElement).closest("[data-rotation-toggle]"))
          setAutomatic(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          choose(active + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
    >
      <div className="vp-stage-label">
        {latest ? (
          <>
            <Flame size={15} aria-hidden="true" /> NEW EPISODE
          </>
        ) : (
          "FROM THE ARCHIVE"
        )}
        <span>EP. {String(current.number).padStart(2, "0")}</span>
      </div>
      <div
        className="vp-stage-posters"
        onPointerDown={(event) => {
          gesture.current = { x: event.clientX, y: event.clientY };
          suppressClick.current = false;
          setAutomatic(false);
        }}
        onPointerUp={(event) => {
          if (!gesture.current) return;
          const x = event.clientX - gesture.current.x,
            y = event.clientY - gesture.current.y;
          gesture.current = null;
          if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y) * 1.3) {
            suppressClick.current = true;
            choose(active + (x < 0 ? 1 : -1));
          }
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {EPISODES.map((episode, index) => {
          const slot = position(index, active),
            distance = Math.abs(slot);
          const style = {
            "--slot": slot,
            "--poster-scale": distance === 0 ? 1 : distance === 1 ? 0.78 : 0.58,
            "--poster-opacity":
              distance === 0 ? 1 : distance === 1 ? 0.65 : 0.24,
            "--poster-turn": `${slot === 0 ? 0 : slot < 0 ? 12 : -12}deg`,
            zIndex: 5 - distance,
          } as CSSProperties;
          const image = (
            <img
              src={episode.image}
              alt={`${episode.guest} on episode ${episode.number}: ${episode.title}`}
              width="1280"
              height="720"
              loading={index === 0 ? "eager" : "lazy"}
              draggable={false}
            />
          );
          return (
            <Link
              key={episode.number}
              className={`vp-stage-poster ${index === active ? "is-active" : ""}`}
              style={style}
              to={`/episodes/${episode.slug}`}
              role={index === active ? undefined : "button"}
              aria-label={
                index === active
                  ? `Explore episode ${episode.number}: ${episode.title}`
                  : `Show episode ${episode.number}: ${episode.title}`
              }
              tabIndex={-1}
              onClick={(event) => {
                if (index !== active) {
                  event.preventDefault();
                  choose(index);
                }
              }}
              onKeyDown={(event) => {
                if (index !== active && event.key === " ") {
                  event.preventDefault();
                  choose(index);
                }
              }}
            >
              {image}
              {index === active && (
                <span className="vp-stage-play">
                  <Play size={24} fill="currentColor" aria-hidden="true" />
                </span>
              )}
            </Link>
          );
        })}
      </div>
      <div
        className="vp-stage-caption vp-wrap"
        aria-live={automatic ? "off" : "polite"}
        aria-atomic="true"
      >
        <p className="vp-stage-guest">
          {current.guest}
          {current.company && ` / ${current.company}`}
        </p>
        <h2>{current.title}.</h2>
        <p className="vp-stage-date">
          {formatDate(current.date)} <span aria-hidden="true">·</span>{" "}
          {current.length}
        </p>
        <Link className="vp-button" to={`/episodes/${current.slug}`}>
          <Play size={16} fill="currentColor" aria-hidden="true" />{" "}
          {latest
            ? "Start with the latest"
            : `Explore episode ${current.number}`}{" "}
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>
      <div className="vp-stage-controls" aria-label="Episode carousel controls">
        <button
          type="button"
          className="vp-stage-arrow"
          onClick={() => choose(active - 1)}
          aria-label="Previous episode"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="vp-stage-dots">
          {EPISODES.map((episode, index) => (
            <button
              type="button"
              key={episode.number}
              onClick={() => choose(index)}
              aria-label={`Select episode ${episode.number}`}
              aria-pressed={active === index}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="vp-stage-arrow"
          onClick={() => choose(active + 1)}
          aria-label="Next episode"
        >
          <ChevronRight size={20} />
        </button>
      </div>
      <div className="vp-stage-motion">
        <span>Swipe or choose an episode.</span>
        <button
          type="button"
          data-rotation-toggle
          disabled={reducedMotion}
          onClick={() => setAutomatic((value) => !value)}
          aria-pressed={automatic && !reducedMotion}
        >
          {automatic && !reducedMotion ? (
            <Pause size={12} />
          ) : (
            <Play size={12} />
          )}
          {reducedMotion
            ? "Reduced motion"
            : automatic
              ? "Pause rotation"
              : "Play rotation"}
        </button>
      </div>
    </section>
  );
}
