import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import PodcastSite from "../PodcastSite";
import {
  isLegacyAuthReturn,
  isLegacyOperationalPath,
} from "@/lib/podcastRoutes";
import { EPISODES, episodeSchema } from "@/content/podcast";
import { podcastLlms, podcastSitemap } from "@/content/podcastDiscovery";
beforeEach(() => {
  (
    window as unknown as {
      happyDOM: { settings: { disableIframePageLoading: boolean } };
    }
  ).happyDOM.settings.disableIframePageLoading = true;
});
afterEach(cleanup);
function open(path: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <PodcastSite />
      </MemoryRouter>
    </HelmetProvider>,
  );
}
describe("public podcast journeys", () => {
  it("replaces the generic heading with verified platform destinations and logos", () => {
    const { container } = open("/");
    expect(
      screen.getByRole("heading", { level: 1, name: "Watch & listen." }),
    ).toBeInTheDocument();
    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>(".vp-distribution-link"),
    );
    expect(links).toHaveLength(5);
    expect(
      links.find((link) => link.textContent?.includes("Apple Podcasts"))?.href,
    ).toBe("https://podcasts.apple.com/ie/podcast/vano-podcast/id6804809081");
    expect(
      links.find((link) => link.textContent?.includes("Amazon Music"))?.href,
    ).toContain("f35fd03a-4570-4d5b-b708-32d37c1cd6c1");
    expect(
      links.every((link) =>
        Boolean(link.querySelector("img")?.getAttribute("src")),
      ),
    ).toBe(true);
  });
  it("keeps existing root auth returns out of the podcast homepage", () => {
    expect(isLegacyAuthReturn("/", "?code=test-code", "")).toBe(true);
    expect(
      isLegacyAuthReturn("/", "", "#access_token=test-token&type=signup"),
    ).toBe(true);
    expect(isLegacyAuthReturn("/", "?ref=friend", "#episodes")).toBe(false);
    expect(isLegacyAuthReturn("/episodes", "?code=not-a-callback", "")).toBe(
      false,
    );
  });
  it("keeps operational links separate from retired marketing routes", () => {
    for (const path of [
      "/track/booking-123",
      "/verify-helper",
      "/auth",
      "/join",
      "/student-job/123",
      "/terms",
      "/helper-terms",
      "/cover",
    ])
      expect(isLegacyOperationalPath(path)).toBe(true);
    for (const path of [
      "/",
      "/episodes/jack-garvey-ganzy",
      "/notes",
      "/site-terms",
      "/site-privacy",
      "/blog/old-post",
      "/cleaning-galway",
    ])
      expect(isLegacyOperationalPath(path)).toBe(false);
  });
  it("opens the latest episode and keeps guest links separate from listen links", () => {
    const { container } = open("/");
    expect(container.querySelector(".vp-stage-label")).toHaveTextContent(
      "NEW EPISODE",
    );
    expect(container.querySelector(".vp-stage-label")).toHaveTextContent(
      "EP. 05",
    );
    expect(
      screen.getByRole("img", {
        name: "Frank Forde on episode 5: A Whiskey Born From Love",
      }),
    ).toHaveAttribute("src", "/podcast/ep05.png");
    fireEvent.click(
      screen.getByRole("link", { name: /start with the latest/i }),
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "A Whiskey Born From Love.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /listen on spotify/i }),
    ).toHaveAttribute(
      "href",
      `https://open.spotify.com/episode/${EPISODES[0].spotifyId}`,
    );
    expect(
      screen.getByRole("link", { name: /Frank Forde · LinkedIn/i }),
    ).toHaveAttribute(
      "href",
      "https://ie.linkedin.com/in/frank-forde-09b759445",
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(
      screen.getByRole("link", { name: /watch on spotify/i }),
    ).toHaveAttribute(
      "href",
      "https://open.spotify.com/episode/0j8s4tswMxcj7ser5JdGYF",
    );
    expect(
      screen.queryByRole("button", { name: /play the full episode/i }),
    ).toBeNull();
    expect(container.querySelector("a a")).toBeNull();
  }, 15000);
  it("loads video only after play, provides a fallback and closes the player", () => {
    const { container } = open("/episodes/krios-ahroon-michael");
    expect(container.querySelector("iframe")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: /play the full episode/i }),
    );
    expect(container.querySelector("iframe")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/Xx-27DEZGzI?autoplay=1",
    );
    expect(
      screen.getByRole("link", { name: /watch directly on youtube/i }),
    ).toHaveAttribute("href", "https://www.youtube.com/watch?v=Xx-27DEZGzI");
    fireEvent.click(screen.getByRole("button", { name: /close video/i }));
    expect(container.querySelector("iframe")).toBeNull();
  });
  it("filters actual clips and restores the full selection", () => {
    const { container } = open("/clips");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 2, name: "Watch & listen." }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll("a.vp-clip")).toHaveLength(3);
    for (const guest of ["Jack Garvey", "Milosz Nelka", "Ayush Puri"]) {
      expect(container.querySelector(".vp-clip-grid")?.textContent).toContain(
        guest,
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "Mindset" }));
    expect(container.querySelectorAll("a.vp-clip")).toHaveLength(1);
    expect(container.querySelector("a.vp-clip")).toHaveAttribute(
      "href",
      "https://www.youtube.com/shorts/28nOfX6ZkM4",
    );
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(container.querySelectorAll("a.vp-clip")).toHaveLength(3);
  });
  it("replaces old blog entry points with podcast notes, with no jobs navigation", () => {
    open("/blog/how-to-hire-a-cleaner");
    expect(
      screen.getByRole("heading", { level: 1, name: "Follow the story." }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /join as|book home help|cleaning/i }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("link", { name: "Meet the Kríos team from Cork" }),
    );
    expect(
      screen.getByRole("link", { name: "Ahroon Santhosh · LinkedIn" }),
    ).toHaveAttribute("href", "https://www.linkedin.com/in/ahroon-santhosh/");
  });
  it("prepares a recording enquiry without submitting a booking or charging", () => {
    open("/contact");
    expect(screen.getByRole("radio", { name: /digital/i })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /in person/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send episode enquiry/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("€100")).toBeNull();
  });
  it("only advertises real podcast routes to search and answer engines", () => {
    const latest = EPISODES[0];
    expect(latest.number).toBe(5);
    expect(episodeSchema(latest).sameAs).toEqual([
      "https://open.spotify.com/episode/0j8s4tswMxcj7ser5JdGYF",
    ]);
    expect(episodeSchema(latest).datePublished).toBe("2026-11-02");
    const sitemap = podcastSitemap(),
      llms = podcastLlms();
    expect(sitemap).toContain("/episodes/frank-forde-whiskey-born-from-love");
    expect(llms).toContain("A Whiskey Born From Love");
    expect(sitemap).toContain("/episodes/krios-ahroon-michael");
    expect(sitemap).not.toMatch(/\/blog|\/join|cleaning-galway|glossary/);
    expect(llms).toContain("https://www.krios.ie/");
    expect(llms).toContain("https://jackgarvey.me/");
    expect(llms).not.toContain("100k");
    expect(llms).not.toContain("tiktok.com/@");
  });
});
