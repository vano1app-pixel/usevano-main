import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ListenerComments from "./ListenerComments";
describe("listener comment publication", () => {
  it("publishes no invented testimonials while actual comments are unavailable", () => {
    const { container } = render(<ListenerComments comments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("renders supplied quotes with blurred generic attribution and a source", () => {
    const { container } = render(
      <ListenerComments
        comments={[
          {
            quote: "Sample comment for this test.",
            platform: "YouTube",
            sourceUrl: "https://www.youtube.com/shorts/28nOfX6ZkM4",
          },
        ]}
      />,
    );
    expect(
      screen.getByText("“Sample comment for this test.”"),
    ).toBeInTheDocument();
    expect(container.querySelector(".vp-comment-name")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByText("Listener name hidden")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "YouTube" })).toHaveAttribute(
      "href",
      "https://www.youtube.com/shorts/28nOfX6ZkM4",
    );
  });
});
