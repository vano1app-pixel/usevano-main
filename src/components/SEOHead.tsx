import { Helmet } from 'react-helmet-async';
import { getCanonicalUrl, getSiteOrigin } from '@/lib/siteUrl';

type OgType = 'website' | 'article' | 'profile';

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
  url?: string;
  /** When true, emits robots noindex,nofollow — use for auth/private pages. */
  noindex?: boolean;
  /** Open Graph type. Defaults to "website". */
  type?: OgType;
  /** ISO 8601 datetime — used for og:article:published_time on article pages. */
  publishedTime?: string;
  /** ISO 8601 datetime — used for og:article:modified_time on article pages. */
  modifiedTime?: string;
  /** One or more JSON-LD objects to inject as <script type="application/ld+json">. */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

function toAbsoluteImage(image: string): string {
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  const origin = getSiteOrigin();
  return `${origin}${image.startsWith('/') ? image : `/${image}`}`;
}

export const SEOHead = ({
  title,
  description,
  keywords = 'VANO, Galway, freelancers, gigs, local jobs, hire students, community',
  // 1200×630 PNG — the spec-compliant size / format for LinkedIn /
  // Slack / WhatsApp / Facebook / Twitter previews. The old /og.svg
  // rendered inconsistently across scrapers (many silently drop SVG).
  image = '/og.png',
  url: urlProp,
  noindex = false,
  type = 'website',
  publishedTime,
  modifiedTime,
  jsonLd,
}: SEOHeadProps) => {
  const fullTitle = `${title} | VANO`;
  const url = urlProp ?? getCanonicalUrl();
  const ogImageAbsolute = toAbsoluteImage(image);
  const jsonLdArray = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="canonical" href={url} />
      <meta
        name="robots"
        content={noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1'}
      />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="VANO" />
      <meta property="og:locale" content="en_IE" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImageAbsolute} />
      {/* Image dimensions + type help scrapers that don't download
           the image eagerly reserve the correct card shape. Assumes
           the default 1200x630 /og.png; per-page images that pass a
           different `image` prop will still work — scrapers just fall
           back to probing the file. */}
      {image === '/og.png' && (
        <>
          <meta property="og:image:type" content="image/png" />
          <meta property="og:image:width" content="1200" />
          <meta property="og:image:height" content="630" />
          <meta property="og:image:alt" content="VANO — any brief, any budget, your perfect match." />
        </>
      )}
      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {type === 'article' && modifiedTime && (
        <meta property="article:modified_time" content={modifiedTime} />
      )}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImageAbsolute} />
      {image === '/og.png' && (
        <meta name="twitter:image:alt" content="VANO — any brief, any budget, your perfect match." />
      )}

      {/* Structured data */}
      {jsonLdArray.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
};
