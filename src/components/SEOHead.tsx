import { Helmet } from 'react-helmet-async';
import { getCanonicalUrl, getSiteOrigin } from '@/lib/siteUrl';

interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
  url?: string;
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
  image = '/og.svg',
  url: urlProp,
}: SEOHeadProps) => {
  const fullTitle = `${title} | VANO`;
  const url = urlProp ?? getCanonicalUrl();
  const ogImageAbsolute = toAbsoluteImage(image);

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="canonical" href={url} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImageAbsolute} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImageAbsolute} />
    </Helmet>
  );
};
