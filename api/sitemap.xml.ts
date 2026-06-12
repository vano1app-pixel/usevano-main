// Dynamic sitemap.xml for the household platform.
//
// Lists only the live, indexable marketing pages. The previous version
// emitted /hire + one URL per old marketplace freelancer (up to 5000
// /students/:id entries at priority 0.9) — all of which 404 since the
// freelancer product was retired, so Google was spending its crawl
// budget on a graveyard. Tracking pages (/track/:id) and dashboards are
// intentionally absent: they're private, per-customer URLs.

type VercelReq = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};

type VercelRes = {
  status: (code: number) => VercelRes;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
  end: (body?: string) => void;
};

const SITE_URL = (process.env.SITE_URL || 'https://vanojobs.com').replace(/\/+$/, '');

const STATIC_URLS: ReadonlyArray<{ path: string; changefreq: string; priority: string }> = [
  { path: '/',        changefreq: 'weekly',  priority: '1.0' },
  { path: '/join',    changefreq: 'weekly',  priority: '0.8' },
  { path: '/privacy', changefreq: 'monthly', priority: '0.2' },
  { path: '/terms',   changefreq: 'monthly', priority: '0.2' },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  for (const s of STATIC_URLS) {
    parts.push('  <url>');
    parts.push(`    <loc>${escapeXml(SITE_URL + s.path)}</loc>`);
    parts.push(`    <lastmod>${today}</lastmod>`);
    parts.push(`    <changefreq>${s.changefreq}</changefreq>`);
    parts.push(`    <priority>${s.priority}</priority>`);
    parts.push('  </url>');
  }

  parts.push('</urlset>');
  const body = parts.join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Edge cache: one hour is plenty for a static page list.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.send(body);
}
