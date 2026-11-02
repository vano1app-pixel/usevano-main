import { podcastSitemap } from "../src/content/podcastDiscovery.js";
type Req = { method?: string };
type Res = {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
  end: (body?: string) => void;
};
export default function handler(req: Req, res: Res) {
  if (req.method && !["GET", "HEAD"].includes(req.method)) {
    res.status(405).end("Method Not Allowed");
    return;
  }
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=3600, stale-while-revalidate=86400",
  );
  const body = podcastSitemap();
  if (req.method === "HEAD") res.end();
  else res.send(body);
}
