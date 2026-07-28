import { Link } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { ContentLayout } from "@/components/content/ContentLayout";
import { GLOSSARY_TERMS } from "@/content/glossary";
import { getSiteOrigin } from "@/lib/siteUrl";

const DESCRIPTION =
  "Plain-English definitions of the words you'll see around Vano — from pay-after-accept and Vano Pay to ATU, Eircode and Ireland's minimum wage — each explained in Vano terms.";

export default function GlossaryIndex() {
  const origin = getSiteOrigin();
  // Group by category, preserving the order categories first appear in the data.
  const categories = [...new Set(GLOSSARY_TERMS.map((t) => t.category))];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${origin}/glossary`,
    name: "Vano Glossary",
    description: DESCRIPTION,
    url: `${origin}/glossary`,
    inLanguage: "en-IE",
    hasDefinedTerm: [...GLOSSARY_TERMS]
      .sort((a, b) => a.term.localeCompare(b.term))
      .map((t) => ({
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

      <section className="px-4 pt-16 pb-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sage-dark">Glossary</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight">
            Every Vano term, in plain English
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-navy/70">{DESCRIPTION}</p>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="max-w-5xl mx-auto space-y-12">
          {categories.map((category) => (
            <div key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-navy/40">{category}</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {GLOSSARY_TERMS.filter((t) => t.category === category).map((t) => (
                  <Link
                    key={t.slug}
                    to={`/glossary/${t.slug}`}
                    className="group flex flex-col rounded-2xl bg-white border border-navy/10 p-5 hover:shadow-tinted-lg hover:-translate-y-0.5 hover:border-sage/40 transition-[box-shadow,transform,border-color] duration-300"
                  >
                    <h3 className="font-display text-lg font-bold leading-snug group-hover:text-sage-dark transition-colors">
                      {t.term}
                    </h3>
                    <p className="mt-2 text-sm text-navy/70">{t.short}</p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </ContentLayout>
  );
}
