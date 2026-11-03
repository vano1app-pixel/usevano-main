import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GuestEnquiryForm from "./GuestEnquiryForm";
const fetchMock = vi.fn();
function open() {
  render(
    <MemoryRouter>
      <GuestEnquiryForm />
    </MemoryRouter>,
  );
}
function fill(format = "Digital") {
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(format, "i") }));
  fireEvent.change(screen.getByLabelText("Your name"), {
    target: { value: "Example Guest" },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "guest@example.com" },
  });
  fireEvent.change(
    screen.getByLabelText("What would you like to talk about?"),
    { target: { value: "Building a creative business in Galway." } },
  );
  fireEvent.click(screen.getByRole("checkbox"));
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("guest enquiry form", () => {
  it("validates, focuses the first missing field, and sends nothing", () => {
    open();
    fireEvent.click(
      screen.getByRole("button", { name: "Send episode enquiry" }),
    );
    expect(
      screen.getByText("Choose digital or in person."),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /digital/i })).toHaveFocus();
    expect(screen.getByRole("form")).toHaveAttribute("method", "post");
    expect(screen.getByRole("form")).toHaveAttribute("action", "/contact");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["Digital", "In person"])(
    "submits %s and only then acknowledges the enquiry",
    async (format) => {
      let finish: (v: unknown) => void;
      fetchMock.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      open();
      fill(format);
      fireEvent.click(
        screen.getByRole("button", { name: "Send episode enquiry" }),
      );
      expect(
        screen.getByRole("button", { name: /sending enquiry/i }),
      ).toBeDisabled();
      expect(screen.queryByText("Your story starts here.")).toBeNull();
      fireEvent.submit(screen.getByRole("form"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).format).toBe(
        format === "Digital" ? "digital" : "in_person",
      );
      finish!({
        status: 202,
        json: async () => ({ status: "accepted", reference: "12345678" }),
      });
      await screen.findByText("Your story starts here.");
      expect(screen.getByText(/not a confirmed booking/i)).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
    },
  );
  it("preserves details and retry identity on failure, with a complete WhatsApp backup", async () => {
    fetchMock.mockResolvedValue({ status: 503, json: async () => ({}) });
    open();
    fill("In person");
    const submit = () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Send episode enquiry" }),
      );
    submit();
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Your name")).toHaveValue("Example Guest");
    const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.click(
      screen.getByRole("button", { name: /send these details on whatsapp/i }),
    );
    const url = openWindow.mock.calls[0][0] as string;
    expect(document.querySelector('a[href*="guest%40"]')).toBeNull();
    const message = new URL(url).searchParams.get("text");
    expect(message).toContain("In person — Galway");
    expect(message).toContain("guest@example.com");
    expect(message).toContain("Building a creative business");
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByRole("alert");
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      fetchMock.mock.calls[1][1].headers["Idempotency-Key"],
    );
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Changed Guest" },
    });
    submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[2][1].headers["Idempotency-Key"]).not.toBe(
      fetchMock.mock.calls[0][1].headers["Idempotency-Key"],
    );
  });
  it("does not mistake an unexpected successful response for an accepted enquiry", async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({ status: "accepted", reference: "fake" }),
    });
    open();
    fill();
    fireEvent.click(
      screen.getByRole("button", { name: "Send episode enquiry" }),
    );
    await screen.findByRole("alert");
    expect(screen.queryByText("Your story starts here.")).toBeNull();
  });
});
