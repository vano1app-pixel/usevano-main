import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import EpisodeCarousel from "./EpisodeCarousel";
function open() {
  return render(
    <MemoryRouter>
      <EpisodeCarousel />
    </MemoryRouter>,
  );
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("episode carousel", () => {
  it("starts on Frank and rotates both ways with keyboard and direct selectors", () => {
    open();
    expect(
      screen.getByRole("heading", { name: "A Whiskey Born From Love." }),
    ).toBeInTheDocument();
    expect(screen.getByText("NEW EPISODE")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /start with the latest/i }),
    ).toHaveAttribute("href", "/episodes/frank-forde-whiskey-born-from-love");
    fireEvent.click(screen.getByRole("button", { name: "Next episode" }));
    expect(
      screen.getByRole("heading", { name: "Betting it all on USA." }),
    ).toBeInTheDocument();
    expect(screen.queryByText("NEW EPISODE")).toBeNull();
    fireEvent.keyDown(screen.getByRole("region"), { key: "ArrowLeft" });
    expect(screen.getByText("NEW EPISODE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select episode 2" }));
    expect(
      screen.getByRole("link", { name: /explore episode 2$/i }),
    ).toHaveAttribute("href", "/episodes/milosz-nelka-business-at-17");
  }, 15000);
  it("rotates on request and can be paused, without losing the current episode", () => {
    vi.useFakeTimers();
    open();
    const play = screen.getByRole("button", { name: "Play rotation" });
    fireEvent.focus(play);
    fireEvent.click(play);
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(
      screen.getByRole("heading", { name: "Betting it all on USA." }),
    ).toBeInTheDocument();
    const pause = screen.getByRole("button", { name: "Pause rotation" });
    fireEvent.focus(pause);
    fireEvent.click(pause);
    act(() => {
      vi.advanceTimersByTime(16000);
    });
    expect(
      screen.getByRole("heading", { name: "Betting it all on USA." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play rotation" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
  it("stops automatic rotation when a user chooses an episode", () => {
    vi.useFakeTimers();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Play rotation" }));
    fireEvent.click(screen.getByRole("button", { name: "Select episode 3" }));
    act(() => {
      vi.advanceTimersByTime(16000);
    });
    expect(
      screen.getByRole("heading", { name: "You need to think bigger." }),
    ).toBeInTheDocument();
  });
  it("keeps Frank stable and disables automatic movement for reduced motion", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList);
    open();
    expect(
      screen.getByRole("button", { name: "Reduced motion" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("heading", { name: "A Whiskey Born From Love." }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next episode" }));
    expect(
      screen.getByRole("heading", { name: "Betting it all on USA." }),
    ).toBeInTheDocument();
  });
});
