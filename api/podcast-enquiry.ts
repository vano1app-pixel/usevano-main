import { createHash } from "node:crypto";
import {
  enquiryMessage,
  recordingLabel,
  validateEnquiry,
} from "../src/lib/podcastEnquiry";

type Request = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};
type Response = {
  status: (code: number) => Response;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};
const buckets = new Map<string, { count: number; reset: number }>();
const WINDOW = 15 * 60 * 1000;
const header = (req: Request, key: string) => {
  const value = req.headers[key];
  return typeof value === "string" ? value : "";
};
function allowedOrigin(origin: string) {
  const allowed = new Set(["https://vanojobs.com", "https://www.vanojobs.com"]);
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL])
    if (host) allowed.add(`https://${host}`);
  if (
    process.env.NODE_ENV !== "production" &&
    /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin)
  )
    return true;
  return allowed.has(origin);
}
function limited(req: Request) {
  const now = Date.now();
  for (const [key, value] of buckets)
    if (value.reset < now) buckets.delete(key);
  if (buckets.size >= 10_000) return true;
  // Warm-instance protection only; Vercel's platform protections remain in place.
  const ip =
    header(req, "x-vercel-forwarded-for") ||
    header(req, "x-forwarded-for").split(",")[0].trim() ||
    "unknown";
  const key = createHash("sha256").update(ip).digest("hex");
  const bucket = buckets.get(key) || { count: 0, reset: now + WINDOW };
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count > 5;
}
export default async function handler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Use POST to send an enquiry." });
    return;
  }
  if (!allowedOrigin(header(req, "origin"))) {
    res
      .status(403)
      .json({ error: "Send your enquiry from the VANO Podcast website." });
    return;
  }
  if (
    header(req, "content-type").split(";")[0].trim().toLowerCase() !==
    "application/json"
  ) {
    res.status(415).json({ error: "Please use the enquiry form." });
    return;
  }
  if (limited(req)) {
    res.setHeader("Retry-After", "900");
    res
      .status(429)
      .json({
        error:
          "Too many attempts. Please wait a little or contact us on WhatsApp.",
      });
    return;
  }
  let body: unknown = req.body;
  try {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    if (!raw || Buffer.byteLength(raw, "utf8") > 12_000) {
      res
        .status(413)
        .json({
          error: "Your enquiry is too long. Please shorten the episode idea.",
        });
      return;
    }
    if (typeof body === "string") body = JSON.parse(body);
  } catch {
    res.status(400).json({ error: "Please check the enquiry and try again." });
    return;
  }
  if (
    body &&
    typeof body === "object" &&
    "faxNumber" in body &&
    body.faxNumber
  ) {
    res.status(400).json({ error: "Please use the enquiry form." });
    return;
  }
  const result = validateEnquiry(body);
  if (!result.valid) {
    res
      .status(400)
      .json({
        error: "Please check the highlighted fields.",
        fields: result.errors,
      });
    return;
  }
  const submissionId = header(req, "idempotency-key");
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      submissionId,
    )
  ) {
    res.status(400).json({ error: "Please refresh the page and try again." });
    return;
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    res
      .status(503)
      .json({
        error:
          "Email enquiries are temporarily unavailable. Your details are still here; please use WhatsApp below.",
      });
    return;
  }
  const to =
    process.env.PODCAST_ENQUIRY_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "vano1app@gmail.com";
  const from =
    process.env.PODCAST_ENQUIRY_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "VANO Podcast <onboarding@resend.dev>";
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `vano-podcast-${submissionId}`,
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: result.data.email,
        subject: `[VANO Podcast] ${recordingLabel(result.data.format)} — ${result.data.name}`,
        text: enquiryMessage(result.data),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const receipt = (await response.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    if (!response.ok || typeof receipt?.id !== "string" || !receipt.id) {
      console.warn(
        "[podcast-enquiry] provider did not accept enquiry",
        response.status,
      );
      res
        .status(503)
        .json({
          error:
            "We couldn’t submit your enquiry just now. Your details are still here. Try again or send it on WhatsApp.",
        });
      return;
    }
    // Provider acceptance is not a booking confirmation or proof of inbox delivery.
    res
      .status(202)
      .json({ status: "accepted", reference: submissionId.slice(0, 8) });
  } catch {
    console.warn("[podcast-enquiry] provider request failed");
    res
      .status(503)
      .json({
        error:
          "The connection didn’t complete. Your details are still here. Try again or use WhatsApp below.",
      });
  }
}
