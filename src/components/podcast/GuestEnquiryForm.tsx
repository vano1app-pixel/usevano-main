import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import {
  EMPTY_ENQUIRY,
  RECORDING_OPTIONS,
  enquiryWhatsAppUrl,
  recordingLabel,
  validateEnquiry,
  type EnquiryErrors,
  type PodcastEnquiry,
} from "@/lib/podcastEnquiry";

export default function GuestEnquiryForm() {
  const [values, setValues] = useState<PodcastEnquiry>({ ...EMPTY_ENQUIRY });
  const [errors, setErrors] = useState<EnquiryErrors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "accepted">("idle");
  const [failure, setFailure] = useState("");
  const [reference, setReference] = useState("");
  const form = useRef<HTMLFormElement>(null);
  const outcome = useRef<HTMLDivElement>(null);
  const submissionId = useRef("");
  const busy = useRef(false);
  const controller = useRef<AbortController>();
  const honeypot = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (status === "accepted") outcome.current?.focus();
  }, [status]);
  function change<K extends keyof PodcastEnquiry>(
    key: K,
    value: PodcastEnquiry[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setFailure("");
    submissionId.current = "";
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const result = validateEnquiry(values);
    setErrors(result.errors);
    setFailure("");
    if (!result.valid) {
      const key = Object.keys(result.errors)[0];
      form.current?.querySelector<HTMLElement>(`[name="${key}"]`)?.focus();
      return;
    }
    busy.current = true;
    setStatus("sending");
    controller.current = new AbortController();
    const timeout = window.setTimeout(
      () => controller.current?.abort(),
      15_000,
    );
    try {
      submissionId.current ||= crypto.randomUUID();
      const response = await fetch("/api/podcast-enquiry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": submissionId.current,
        },
        body: JSON.stringify({
          ...result.data,
          faxNumber: honeypot.current?.value || "",
        }),
        signal: controller.current.signal,
      });
      const receipt = await response.json().catch(() => null);
      if (
        response.status !== 202 ||
        receipt?.status !== "accepted" ||
        typeof receipt.reference !== "string"
      ) {
        if (response.status === 400 && receipt?.fields)
          setErrors(receipt.fields);
        throw new Error(
          response.status === 429
            ? "Too many attempts. Please wait 15 minutes, or send your enquiry on WhatsApp below."
            : "We couldn’t submit your enquiry just now. Your details are still here. Try again or send it on WhatsApp below.",
        );
      }
      setReference(receipt.reference);
      setStatus("accepted");
    } catch (error) {
      setFailure(
        error instanceof Error && error.name !== "AbortError"
          ? error.message
          : "The connection didn’t complete. Your details are still here. Try again or use WhatsApp below.",
      );
      setStatus("idle");
    } finally {
      window.clearTimeout(timeout);
      busy.current = false;
    }
  }
  const error = (key: keyof PodcastEnquiry) =>
    errors[key] ? (
      <span className="vp-field-error" id={`enquiry-${key}-error`}>
        {errors[key]}
      </span>
    ) : null;
  const inputProps = (key: keyof PodcastEnquiry) => ({
    id: `enquiry-${key}`,
    name: key,
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": errors[key] ? `enquiry-${key}-error` : undefined,
  });
  return (
    <section className="vp-wrap vp-enquiry-layout">
      <aside className="vp-enquiry-aside">
        <p className="vp-kicker">From an idea to an episode</p>
        <h2>Let’s hear your story.</h2>
        <p>
          Choose how you’d like to record and tell Ayush what you have in mind.
        </p>
        <ol>
          <li>
            <strong>Send your idea.</strong>
            <span>Your enquiry goes directly to Ayush’s inbox.</span>
          </li>
          <li>
            <strong>Talk it through.</strong>
            <span>
              We’ll reply to the email you provide to discuss the story, timing
              and any costs.
            </span>
          </li>
          <li>
            <strong>Agree the details.</strong>
            <span>
              Digital from anywhere, or in person in Galway. Nothing is booked
              until we agree.
            </span>
          </li>
        </ol>
      </aside>
      <div className="vp-enquiry-panel ph-no-capture ph-mask">
        {status === "accepted" ? (
          <div
            className="vp-enquiry-success"
            role="status"
            tabIndex={-1}
            ref={outcome}
          >
            <Check size={28} aria-hidden="true" />
            <p className="vp-kicker">Enquiry submitted / {reference}</p>
            <h2>Your story starts here.</h2>
            <p>
              Thanks, {values.name}. Your enquiry has been submitted for Ayush
              to review. We’ll reply to <strong>{values.email}</strong> to
              discuss it.
            </p>
            <p className="vp-enquiry-format">{recordingLabel(values.format)}</p>
            <p>
              This is an enquiry, not a confirmed booking. We’ll agree the
              recording details and any costs together.
            </p>
            <button
              className="vp-text-link"
              type="button"
              onClick={() => {
                setValues({ ...EMPTY_ENQUIRY });
                setErrors({});
                setStatus("idle");
                submissionId.current = "";
              }}
            >
              Send another enquiry <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <form
            ref={form}
            method="post"
            action="/contact"
            onSubmit={submit}
            noValidate
            aria-label="Guest episode enquiry"
          >
            <fieldset
              disabled={status === "sending"}
              className="vp-enquiry-fields"
            >
              <fieldset
                className="vp-recording-choice"
                aria-describedby={
                  errors.format ? "enquiry-format-error" : undefined
                }
              >
                <legend>
                  How would you like to record? <span>Required</span>
                </legend>
                <div>
                  {RECORDING_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={
                        values.format === option.value ? "is-selected" : ""
                      }
                    >
                      <input
                        type="radio"
                        name="format"
                        value={option.value}
                        required
                        checked={values.format === option.value}
                        onChange={() => change("format", option.value)}
                        aria-invalid={Boolean(errors.format)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.detail}</small>
                      </span>
                    </label>
                  ))}
                </div>
                {error("format")}
              </fieldset>
              <div className="vp-enquiry-row">
                <label htmlFor="enquiry-name">
                  Your name
                  <input
                    {...inputProps("name")}
                    required
                    autoComplete="name"
                    maxLength={80}
                    value={values.name}
                    onChange={(e) => change("name", e.target.value)}
                  />
                  {error("name")}
                </label>
                <label htmlFor="enquiry-email">
                  Email address
                  <input
                    {...inputProps("email")}
                    required
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={values.email}
                    onChange={(e) => change("email", e.target.value)}
                  />
                  {error("email")}
                </label>
              </div>
              <div className="vp-enquiry-row">
                <label htmlFor="enquiry-business">
                  Business or project <span>Optional</span>
                  <input
                    {...inputProps("business")}
                    autoComplete="organization"
                    maxLength={120}
                    value={values.business}
                    onChange={(e) => change("business", e.target.value)}
                  />
                  {error("business")}
                </label>
                <label htmlFor="enquiry-website">
                  Website or social profile <span>Optional</span>
                  <input
                    {...inputProps("website")}
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoComplete="url"
                    maxLength={300}
                    placeholder="example.com"
                    value={values.website}
                    onChange={(e) => change("website", e.target.value)}
                  />
                  {error("website")}
                </label>
              </div>
              <label htmlFor="enquiry-idea">
                What would you like to talk about?
                <textarea
                  {...inputProps("idea")}
                  required
                  rows={5}
                  maxLength={1500}
                  placeholder="What are you building? What’s the story behind it?"
                  value={values.idea}
                  onChange={(e) => change("idea", e.target.value)}
                />
                {error("idea")}
              </label>
              <label htmlFor="enquiry-availability">
                Where are you based, and when suits you? <span>Optional</span>
                <input
                  {...inputProps("availability")}
                  maxLength={200}
                  placeholder="City, time zone or a few dates that could work"
                  value={values.availability}
                  onChange={(e) => change("availability", e.target.value)}
                />
                {error("availability")}
              </label>
              <div className="vp-enquiry-trap" aria-hidden="true">
                <label>
                  Leave this field empty
                  <input
                    ref={honeypot}
                    name="faxNumber"
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </label>
              </div>
              <div>
                <label className="vp-enquiry-consent" htmlFor="enquiry-consent">
                  <input
                    {...inputProps("consent")}
                    type="checkbox"
                    required
                    checked={values.consent}
                    onChange={(e) => change("consent", e.target.checked)}
                  />
                  <span>
                    I agree that VANO Podcast can contact me about this enquiry.
                  </span>
                </label>
                {error("consent")}
                <p className="vp-enquiry-privacy">
                  Your details are used to discuss your episode.{" "}
                  <Link to="/site-privacy">Privacy information</Link>.
                </p>
              </div>
              {failure && (
                <p className="vp-enquiry-error" role="alert">
                  {failure}
                </p>
              )}
              <button
                type="submit"
                className="vp-button"
                disabled={status === "sending"}
              >
                {status === "sending"
                  ? "Sending enquiry…"
                  : "Send episode enquiry"}
                <ArrowRight size={17} />
              </button>
              <p className="vp-enquiry-footnote" aria-live="polite">
                {status === "sending"
                  ? "Keep this page open while we submit your enquiry."
                  : "An enquiry starts a conversation. No booking or payment is made here."}
              </p>
            </fieldset>
            <button
              type="button"
              className="vp-text-link vp-enquiry-backup"
              disabled={status === "sending"}
              onClick={() =>
                window.open(
                  enquiryWhatsAppUrl(values),
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              {failure
                ? "Send these details on WhatsApp"
                : "Prefer WhatsApp? Message Ayush"}{" "}
              <ArrowUpRight size={16} />
            </button>
            <small className="vp-enquiry-footnote">
              Opens a draft. Tap send in WhatsApp to contact us.
            </small>
            <noscript>
              <p>
                The enquiry form needs JavaScript.{" "}
                <a href="https://wa.me/353899817111">
                  Contact Ayush on WhatsApp
                </a>{" "}
                instead.
              </p>
            </noscript>
          </form>
        )}
      </div>
    </section>
  );
}
