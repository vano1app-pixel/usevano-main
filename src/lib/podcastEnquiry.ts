import { BOOKING } from "../content/podcast.js";

export const RECORDING_OPTIONS = [
  {
    value: "digital",
    label: "Digital",
    detail: "Join by video call, from anywhere.",
  },
  {
    value: "in_person",
    label: "In person",
    detail: "Sit down with us in Galway.",
  },
] as const;
export type RecordingFormat = (typeof RECORDING_OPTIONS)[number]["value"];
export type PodcastEnquiry = {
  format: RecordingFormat | "";
  name: string;
  email: string;
  business: string;
  website: string;
  idea: string;
  availability: string;
  consent: boolean;
};
export const EMPTY_ENQUIRY: PodcastEnquiry = {
  format: "",
  name: "",
  email: "",
  business: "",
  website: "",
  idea: "",
  availability: "",
  consent: false,
};
export type EnquiryErrors = Partial<Record<keyof PodcastEnquiry, string>>;
const hasControlCharacter = (text: string) =>
  Array.from(text).some((char) => char.charCodeAt(0) < 32);
export function validateEnquiry(input: unknown): {
  data: PodcastEnquiry;
  errors: EnquiryErrors;
  valid: boolean;
} {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const text = (key: string) =>
    typeof source[key] === "string" ? (source[key] as string).trim() : "";
  const data: PodcastEnquiry = {
    format: text("format") as PodcastEnquiry["format"],
    name: text("name"),
    email: text("email"),
    business: text("business"),
    website: text("website"),
    idea: text("idea"),
    availability: text("availability"),
    consent: source.consent === true,
  };
  const errors: EnquiryErrors = {};
  if (!["digital", "in_person"].includes(data.format))
    errors.format = "Choose digital or in person.";
  if (
    data.name.length < 2 ||
    data.name.length > 80 ||
    hasControlCharacter(data.name)
  )
    errors.name = "Enter your name (2–80 characters).";
  if (
    data.email.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email)
  )
    errors.email = "Enter an email address we can reply to.";
  if (data.business.length > 120 || hasControlCharacter(data.business))
    errors.business = "Keep the business or project name under 120 characters.";
  if (data.website) {
    try {
      const url = new URL(
        /^[a-z][a-z\d+.-]*:/i.test(data.website)
          ? data.website
          : `https://${data.website}`,
      );
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname.includes(".") ||
        url.username ||
        url.password ||
        data.website.length > 300
      )
        throw new Error("invalid");
      data.website = url.href;
    } catch {
      errors.website =
        "Enter a website such as example.com, or leave it blank.";
    }
  }
  if (
    data.idea.length < 12 ||
    data.idea.length > 1500 ||
    data.idea.includes("\0")
  )
    errors.idea =
      "Tell us a little about your episode idea (12–1,500 characters).";
  if (data.availability.length > 200 || data.availability.includes("\0"))
    errors.availability = "Keep your availability under 200 characters.";
  if (!data.consent)
    errors.consent = "Please agree that we can contact you about your enquiry.";
  return { data, errors, valid: Object.keys(errors).length === 0 };
}
export const recordingLabel = (format: string) =>
  format === "in_person"
    ? "In person — Galway"
    : format === "digital"
      ? "Digital — video call"
      : "Not chosen";
export function enquiryMessage(data: PodcastEnquiry) {
  return [
    "VANO Podcast — guest episode enquiry",
    "",
    `Recording: ${recordingLabel(data.format)}`,
    `Name: ${data.name}`,
    `Reply email: ${data.email}`,
    ...(data.business ? [`Business / project: ${data.business}`] : []),
    ...(data.website ? [`Website: ${data.website}`] : []),
    "",
    "Episode idea:",
    data.idea,
    ...(data.availability ? ["", `Availability: ${data.availability}`] : []),
    "",
    ...(data.consent ? ["I agree to be contacted about this enquiry."] : []),
    "Recording details and any costs are to be agreed; this is not a confirmed booking.",
  ].join("\n");
}
export function enquiryWhatsAppUrl(data: PodcastEnquiry) {
  return `https://wa.me/${BOOKING.whatsapp}?text=${encodeURIComponent(enquiryMessage(data))}`;
}
