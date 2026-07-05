import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ShieldCheck, Eye, BadgeCheck, Zap } from 'lucide-react';
import { SEOHead } from '@/components/SEOHead';
import { HouseholdNav } from '@/components/household/HouseholdNav';
import { HouseholdFooter } from '@/components/household/HouseholdFooter';
import { CategoryGrid } from '@/components/household/CategoryGrid';
import { Reveal } from '@/components/Reveal';
import NotFound from '@/pages/NotFound';
import { getServiceLanding, SERVICE_LANDINGS } from '@/content/services';

/**
 * Per-service SEO landing page (/cleaning-galway, /dog-walking-galway, …).
 * All copy lives in src/content/services.ts; the CTA dispatches
 * vano:select-category so booking still goes through the ONE quick-book
 * sheet — the mounted CategoryGrid below catches the event and opens it.
 * Crawlers that don't run JS get the prerendered copy instead
 * (scripts/prerender-content.ts emits a static shell per service).
 */
const ServiceLanding: React.FC = () => {
  // Routes are static top-level paths (/cleaning-galway), not a :slug param —
  // the slug IS the pathname.
  const slug = useLocation().pathname.replace(/^\/+|\/+$/g, '');
  const service = getServiceLanding(slug);
  if (!service) return <NotFound />;

  const url = `https://vanojobs.com/${service.slug}`;
  const others = SERVICE_LANDINGS.filter((s) => s.slug !== service.slug);

  const bookNow = () => {
    window.dispatchEvent(
      new CustomEvent('vano:select-category', { detail: { slug: service.category } }),
    );
  };

  return (
    <div className="bg-cream">
      <SEOHead
        title={service.title}
        description={service.description}
        url={url}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'Service',
            name: `${service.name} — VANO`,
            description: service.description,
            serviceType: service.name,
            areaServed: { '@type': 'City', name: 'Galway', address: { '@type': 'PostalAddress', addressCountry: 'IE' } },
            provider: { '@type': 'LocalBusiness', name: 'VANO', url: 'https://vanojobs.com/' },
            offers: { '@type': 'Offer', price: String(service.fromPriceEuro), priceCurrency: 'EUR', url },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: service.faqs.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://vanojobs.com/' },
              { '@type': 'ListItem', position: 2, name: service.name, item: url },
            ],
          },
        ]}
      />
      <HouseholdNav darkHero />

      <main>
        {/* Navy hero — same family as the homepage so the brand carries over,
            but headline-first: the visitor arrived searching for this exact
            service, so answer them before asking for the tap. */}
        <section className="relative bg-navy px-4 pt-28 pb-14">
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="grain pointer-events-none absolute inset-0 opacity-[0.06]" />
            <div
              className="pointer-events-none absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-20"
              style={{ background: 'radial-gradient(circle, hsl(43 90% 60% / 0.35) 0%, transparent 70%)' }}
            />
          </div>

          <div className="relative mx-auto w-full max-w-2xl text-center">
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="display-xl text-white mb-4 text-balance"
            >
              {service.h1}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-white/70 text-base sm:text-lg leading-relaxed max-w-lg mx-auto mb-6 text-pretty"
            >
              {service.intro}
            </motion.p>

            {/* Price + book CTA — opens the shared quick-book sheet directly */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mb-8"
            >
              <p className="text-gold font-bold text-xl mb-1">{service.priceLabel}</p>
              <p className="text-white/55 text-xs mb-5">{service.priceDetail}</p>
              <button
                type="button"
                onClick={bookNow}
                className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground font-semibold text-base h-[52px] px-8 shadow-primary-glow hover:brightness-105 active:scale-[0.98] transition-[filter,transform] duration-150"
              >
                <Zap className="w-4 h-4" aria-hidden="true" />
                Book {service.name.toLowerCase()} now
              </button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                No payment until a helper accepts · money-back guarantee
              </p>
            </motion.div>

            {/* The one front door — mounted here so the CTA's
                vano:select-category event has its listener, and searchers can
                book any other job without leaving the page. */}
            <CategoryGrid />

            <ul className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {[
                { icon: ShieldCheck, label: 'ID-verified students' },
                { icon: Eye, label: 'You see them first' },
                { icon: BadgeCheck, label: 'Money-back guarantee' },
              ].map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] border border-white/10 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm"
                >
                  <Icon className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* What's included */}
        <Reveal>
          <section className="px-4 py-14">
            <div className="mx-auto max-w-2xl">
              <h2 className="text-2xl font-bold text-foreground mb-6 text-center">What's included</h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {service.included.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3.5 text-sm text-foreground"
                  >
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-sage/15">
                      <Check className="w-3.5 h-3.5 text-sage-dark" strokeWidth={3} aria-hidden="true" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </Reveal>

        {/* Body copy — the unique content that earns the ranking */}
        <Reveal>
          <section className="px-4 pb-14">
            <div className="mx-auto max-w-2xl space-y-10">
              {service.body.map((section) => (
                <div key={section.heading}>
                  <h2 className="text-xl font-bold text-foreground mb-3">{section.heading}</h2>
                  <p className="text-[15px] leading-relaxed text-foreground/75">{section.text}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {/* FAQs */}
        <Reveal>
          <section className="px-4 pb-14">
            <div className="mx-auto max-w-2xl">
              <h2 className="text-2xl font-bold text-foreground mb-6 text-center">Common questions</h2>
              <div className="rounded-2xl border border-border bg-white divide-y divide-border overflow-hidden">
                {service.faqs.map((f) => (
                  <details key={f.q} className="group px-5">
                    <summary className="cursor-pointer list-none py-4 text-sm font-semibold text-foreground flex items-center justify-between gap-3">
                      {f.q}
                      <span className="text-muted-foreground/50 transition-transform duration-200 group-open:rotate-45 flex-shrink-0" aria-hidden="true">+</span>
                    </summary>
                    <p className="pb-4 text-sm leading-relaxed text-foreground/70">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        {/* Cross-links — internal linking between the service pages */}
        <Reveal>
          <section className="px-4 pb-16">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-foreground/40 mb-4">
                More help in Galway
              </h2>
              <ul className="flex flex-wrap justify-center gap-2">
                {others.map((s) => (
                  <li key={s.slug}>
                    <Link
                      to={`/${s.slug}`}
                      className="inline-block rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:border-foreground/30 transition-colors"
                    >
                      {s.shortLabel}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/"
                    className="inline-block rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:border-foreground/30 transition-colors"
                  >
                    All services
                  </Link>
                </li>
              </ul>
            </div>
          </section>
        </Reveal>

        <HouseholdFooter />
      </main>
    </div>
  );
};

export default ServiceLanding;
