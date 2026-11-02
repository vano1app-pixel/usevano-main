// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import handler from "../../../api/podcast-enquiry";
const valid = {
  format: "digital",
  name: "Example Guest",
  email: "guest@example.com",
  business: "Example Studio",
  website: "example.com",
  idea: "Building a creative business in Galway.",
  availability: "Galway, weekday evenings",
  consent: true,
};
let ip = 0;
const fetchMock = vi.fn();
function request(
  body: unknown = valid,
  headers: Record<string, string> = {},
  method = "POST",
) {
  return {
    method,
    body,
    headers: {
      origin: "https://vanojobs.com",
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
      "x-vercel-forwarded-for": `test-${++ip}`,
      ...headers,
    },
  };
}
async function run(req = request()) {
  const res = {
    code: 0,
    payload: {} as Record<string, unknown>,
    headers: {} as Record<string, string>,
    status(n: number) {
      this.code = n;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    json(b: unknown) {
      this.payload = b as Record<string, unknown>;
    },
  };
  await handler(req, res);
  return res;
}
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: "provider-receipt" }),
  });
  vi.stubEnv("RESEND_API_KEY", "test-only-key");
  vi.stubEnv("PODCAST_ENQUIRY_EMAIL", "");
  vi.stubEnv("ADMIN_EMAIL", "");
  vi.stubEnv("RESEND_FROM", "");
  vi.stubEnv("PODCAST_ENQUIRY_FROM", "");
  vi.stubEnv("NODE_ENV", "production");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("podcast enquiry delivery", () => {
  it.each(["digital", "in_person"])(
    "submits %s to the owner with guest reply-to and full details",
    async (format) => {
      const res = await run(request({ ...valid, format }));
      expect(res.code).toBe(202);
      expect(res.payload.status).toBe("accepted");
      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload.to).toEqual(["vano1app@gmail.com"]);
      expect(payload.reply_to).toBe(valid.email);
      expect(payload.subject).toContain(
        format === "digital" ? "Digital — video call" : "In person — Galway",
      );
      expect(payload.text).toContain(valid.idea);
      expect(payload.text).toContain("https://example.com/");
      expect(payload.text).toContain(valid.availability);
    },
  );
  it("keeps the provider idempotency key across retries", async () => {
    const req = request();
    await run(req);
    await run(req);
    expect(fetchMock.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      fetchMock.mock.calls[1][1].headers["Idempotency-Key"],
    );
  });
  it.each([
    { ...valid, format: "maybe" },
    { ...valid, email: "not-email" },
    { ...valid, consent: false },
    { ...valid, name: "Name\r\nBcc:other@example.com" },
    { ...valid, website: "javascript:alert(1)" },
    { ...valid, idea: "tiny" },
    { ...valid, faxNumber: "bot" },
  ])("rejects invalid input before contacting the provider", async (body) => {
    expect((await run(request(body))).code).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["", "https://evil.example", "https://vanojobs.com.evil.example"])(
    "rejects foreign or missing origin %s",
    async (origin) => {
      expect((await run(request(valid, { origin }))).code).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("allows its exact Vercel preview, not arbitrary Vercel sites", async () => {
    vi.stubEnv("VERCEL_URL", "this-preview.vercel.app");
    expect(
      (await run(request(valid, { origin: "https://this-preview.vercel.app" })))
        .code,
    ).toBe(202);
    expect(
      (await run(request(valid, { origin: "https://other.vercel.app" }))).code,
    ).toBe(403);
  });
  it("rejects malformed, oversized and non-JSON requests", async () => {
    expect((await run(request("{"))).code).toBe(400);
    expect((await run(request("x".repeat(12001)))).code).toBe(413);
    expect(
      (await run(request(valid, { "content-type": "text/plain" }))).code,
    ).toBe(415);
    expect(
      (await run(request(valid, { "content-type": "application/jsonbad" })))
        .code,
    ).toBe(415);
    expect((await run(request(valid, {}, "GET"))).code).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not report acceptance when email is unconfigured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await run()).code).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    {
      ok: false,
      status: 403,
      json: async () => ({ message: "private provider error" }),
    },
    { ok: true, status: 200, json: async () => ({}) },
    {
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid JSON");
      },
    },
  ])(
    "does not report acceptance without a valid provider receipt",
    async (provider) => {
      fetchMock.mockResolvedValue(provider);
      const res = await run();
      expect(res.code).toBe(503);
      expect(JSON.stringify(res.payload)).not.toContain(
        "private provider error",
      );
    },
  );
  it("handles a provider timeout honestly", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect((await run()).code).toBe(503);
  });
  it("limits repeated attempts on the same warm instance", async () => {
    const headers = { "x-vercel-forwarded-for": "rate-test" };
    for (let n = 0; n < 5; n++)
      expect((await run(request(valid, headers))).code).toBe(202);
    const res = await run(request(valid, headers));
    expect(res.code).toBe(429);
    expect(res.headers["Retry-After"]).toBe("900");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
