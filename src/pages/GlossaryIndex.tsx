import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { ContentLayout } from "@/components/content/ContentLayout";
import { GLOSSARY_TERMS } from "@/content/glossary";
import { getSiteOrigin } from "@/lib/siteUrl";

const DESCRIPTION =
  "Plain-English definitions of the words you'll see around Vano — from pay-after-accept and Vano Pay to ATU, Eircode and Ireland's minimum wage — each explained in Vano terms.";

export default function GlossaryIndex() {
  const origin = getSiteOrigin();
  const terms = [...GLOSSARY_TERMS].sort((a, b) => a.term.localeCompare(b.term));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${origin}/glossary`,
    name: "Vano Glossary",
    description: DESCRIPTION,
    url: `${origin}/glossary`,
    inLanguage: "en-IE",
    hasDefinedTerm: terms.map((t) => ({
      "@type": "DefinedTerm",
      name: t.term,
      description: t.short,
      url: `${origin}/glossary/${t.slug}`,
    })),
  };

  return (
    <ContentLayout>
      <SEOHead
        title="Vano Glossary — Home Help & Student Work Terms, Explained"
        description={DESCRIPTION}
        keywords="Vano glossary, pay after accept, Vano Pay, escrow, Stripe Connect, ATU, Eircode, minimum wage Ireland, same-day home help"
        url={`${origin}/glossary`}
        jsonLd={jsonLd}
      />

      <section className="px-4 pt-14 pb-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-dark">Glossary</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold leading-tight">
            Every Vano term, in plain English
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-navy/70">{DESCRIPTION}</p>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="max-w-5xl mx-auto grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {terms.map((t) => (
            <Link
              key={t.slug}
              to={`/glossary/${t.slug}`}
              className="group flex flex-col rounded-2xl bg-white border border-navy/10 p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-sage-dark">{t.category}</span>
              <h2 className="mt-1 font-display text-lg font-bold leading-snug group-hover:text-sage-dark transition-colors">
                {t.term}
              </h2>
              <p className="mt-2 text-sm text-navy/70">{t.short}</p>
            </Link>
          ))}
        </div>
      </section>
    </ContentLayout>
  );
}
