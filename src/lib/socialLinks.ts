export type WorkLinkEntry = { url: string; label: string };

/** Accepts profile URL, @handle, or handle only */
export function normalizeTikTokUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (!/tiktok\.com$/i.test(u.hostname.replace(/^www\./, ''))) return s;
      return u.toString();
    } catch {
      return null;
    }
  }
  const handle = s.replace(/^@+/, '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!handle) return null;
  return `https://www.tiktok.com/@${handle}`;
}

export function normalizeWebsiteUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      return new URL(s).toString();
    } catch {
      return null;
    }
  }
  try {
    return new URL(`https://${s}`).toString();
  } catch {
    return null;
  }
}

export function parseWorkLinksJson(value: unknown): WorkLinkEntry[] {
  if (!value || !Array.isArray(value)) return [];
  const out: WorkLinkEntry[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const url = typeof (row as any).url === 'string' ? (row as any).url : '';
    const label = typeof (row as any).label === 'string' ? (row as any).label : '';
    const n = normalizeWebsiteUrl(url);
    if (n) out.push({ url: n, label: label.trim() || 'Project link' });
  }
  return out;
}

export function workLinksToJson(entries: WorkLinkEntry[]): { url: string; label: string }[] {
  return entries
    .map((e) => {
      const url = normalizeWebsiteUrl(e.url);
      if (!url) return null;
      const label = e.label.trim() || 'Project link';
      return { url, label };
    })
    .filter(Boolean) as { url: string; label: string }[];
}
