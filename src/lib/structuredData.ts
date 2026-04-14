import { SITE_ORIGIN_DEFAULT } from './siteUrl';

/** Fixed site origin so JSON-LD is identical between SSR/CSR and across pages. */
const ORIGIN = SITE_ORIGIN_DEFAULT;

type JsonLd = Record<string, unknown>;

/** Organization schema — used site-wide. Reuse for the homepage and footer brand entity. */
export function organizationSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${ORIGIN}/#organization`,
    name: 'VANO',
    alternateName: 'VANO Jobs',
    url: `${ORIGIN}/`,
    logo: `${ORIGIN}/pwa-512x512.png`,
    image: `${ORIGIN}/og.svg`,
    description:
      "VANO connects Galway businesses with local freelancers and student talent for digital sales, videography, web design, social media and more.",
    areaServed: {
      '@type': 'City',
      name: 'Galway',
      containedInPlace: { '@type': 'Country', name: 'Ireland' },
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Galway',
      addressCountry: 'IE',
    },
  };
}

/** WebSite schema — enables sitelinks search box once we ship a search endpoint. */
export function websiteSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${ORIGIN}/#website`,
    url: `${ORIGIN}/`,
    name: 'VANO',
    description: 'Post a shift and get the work done — Galway freelancers, hired in minutes.',
    publisher: { '@id': `${ORIGIN}/#organization` },
    inLanguage: 'en-IE',
  };
}

export interface BreadcrumbItem {
  name: string;
  /** Path relative to origin, e.g. "/students/digital_sales". */
  path: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${ORIGIN}${item.path.startsWith('/') ? item.path : `/${item.path}`}`,
    })),
  };
}

export interface PersonSchemaInput {
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  skills?: string[] | null;
  university?: string | null;
  category?: string | null;
  url: string;
}

export function personSchema(p: PersonSchemaInput): JsonLd {
  const out: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: p.displayName,
    url: p.url,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Galway',
      addressCountry: 'IE',
    },
  };
  if (p.bio) out.description = p.bio.substring(0, 280);
  if (p.avatarUrl) out.image = p.avatarUrl;
  if (p.skills && p.skills.length) out.knowsAbout = p.skills.slice(0, 10);
  if (p.category) out.jobTitle = p.category;
  if (p.university) out.alumniOf = { '@type': 'EducationalOrganization', name: p.university };
  return out;
}

export interface JobPostingSchemaInput {
  title: string;
  description: string;
  datePosted: string; // ISO
  validThrough?: string; // ISO
  hiringOrgName?: string | null;
  hiringOrgUrl?: string | null;
  url: string;
  budget?: number | null;
  budgetCurrency?: string;
  employmentType?: 'CONTRACTOR' | 'PART_TIME' | 'FULL_TIME' | 'TEMPORARY';
}

export function jobPostingSchema(j: JobPostingSchemaInput): JsonLd {
  const out: JsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: j.title,
    description: j.description,
    datePosted: j.datePosted,
    employmentType: j.employmentType ?? 'CONTRACTOR',
    hiringOrganization: {
      '@type': 'Organization',
      name: j.hiringOrgName || 'VANO Client',
      ...(j.hiringOrgUrl ? { sameAs: j.hiringOrgUrl } : {}),
    },
    jobLocation: {
      '@type': 'Place',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Galway',
        addressCountry: 'IE',
      },
    },
    url: j.url,
    directApply: true,
  };
  if (j.validThrough) out.validThrough = j.validThrough;
  if (j.budget) {
    out.baseSalary = {
      '@type': 'MonetaryAmount',
      currency: j.budgetCurrency || 'EUR',
      value: { '@type': 'QuantitativeValue', value: j.budget, unitText: 'HOUR' },
    };
  }
  return out;
}

export interface ArticleSchemaInput {
  headline: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string; // ISO
  dateModified?: string; // ISO
  authorName?: string;
}

export function articleSchema(a: ArticleSchemaInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.headline,
    description: a.description,
    image: a.image ? [a.image] : [`${ORIGIN}/og.svg`],
    datePublished: a.datePublished,
    dateModified: a.dateModified || a.datePublished,
    author: { '@type': 'Organization', name: a.authorName || 'VANO Team' },
    publisher: { '@id': `${ORIGIN}/#organization` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': a.url },
  };
}
