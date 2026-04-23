// Dynamic sitemap.xml — previously a static file in /public that
// listed only the home/hire/category routes, so Google was crawling
// Vano like a 10-page SaaS instead of a 300-freelancer marketplace.
//
// This route queries every approved community listing and emits one
// <url> per freelancer alongside the static pages. Response is
// cached for an hour at the edge so a crawler hammering the URL
// doesn't hit Supabase 60 times a minute.
//
// Auth: anon key only. RLS ensures we only see approved listings,
// which is exactly what should be indexable. No service-role key
// anywhere near this handler.

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

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
const SITE_URL = (process.env.SITE_URL || 'https://vanojobs.com').replace(/\/+$/, '');

const STATIC_URLS: ReadonlyArray<{ path: string; changefreq: string; priority: string }> = [
  { path: '/',                         changefreq: 'weekly', priority: '1.0' },
  { path: '/hire',                     changefreq: 'weekly', priority: '0.9' },
  { path: '/students',                 changefreq: 'daily',  priority: '0.9' },
  { path: '/students/videography',     changefreq: 'daily',  priority: '0.8' },
  { path: '/students/digital_sales',   changefreq: 'daily',  priority: '0.8' },
  { path: '/students/websites',        changefreq: 'daily',  priority: '0.8' },
  { path: '/students/social_media',    changefreq: 'daily',  priority: '0.8' },
];

type ListingRow = {
  user_id: string;
  updated_at: string | null;
  created_at: string | null;
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(ts: string | null | undefined): string {
  if (!ts) return new Date().toISOString().slice(0, 10);
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

async function fetchApprovedFreelancers(): Promise<ListingRow[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];

  // Use the PostgREST API directly — avoids pulling the full Supabase
  // client into a cold-start serverless function just for one query.
  // Dedupe by user_id client-side: a single freelancer can have
  // multiple community_posts, but the sitemap entry is per /students/:id.
  const url = new URL(`${SUPABASE_URL}/rest/v1/community_posts`);
  url.searchParams.set('select', 'user_id,updated_at,created_at');
  url.searchParams.set('moderation_status', 'eq.approved');
  url.searchParams.set('order', 'updated_at.desc.nullslast');
  url.searchParams.set('limit', '5000');

  try {
    const res = await fetch(url.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as ListingRow[];
    const seen = new Set<string>();
    const unique: ListingRow[] = [];
    for (const row of rows) {
      if (!row.user_id || seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      unique.push(row);
    }
    return unique;
  } catch {
    return [];
  }
}

export default async function handler(req: VercelReq, res: VercelRes): Promise<void> {
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  const freelancers = await fetchApprovedFreelancers();
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

  for (const f of freelancers) {
    parts.push('  <url>');
    parts.push(`    <loc>${escapeXml(`${SITE_URL}/students/${f.user_id}`)}</loc>`);
    parts.push(`    <lastmod>${isoDate(f.updated_at ?? f.created_at)}</lastmod>`);
    parts.push('    <changefreq>weekly</changefreq>');
    parts.push('    <priority>0.7</priority>');
    parts.push('  </url>');
  }

  parts.push('</urlset>');
  const body = parts.join('\n');

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Edge cache: one hour. Crawlers hit this often; Supabase doesn't need
  // to see every ping. If you publish a new listing and want it picked
  // up faster than 1 hr, hit the URL to warm Vercel's cache or wait.
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.send(body);
}
