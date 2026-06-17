import { Link, useParams } from "react-router-dom";
import { SEOHead } from "@/components/SEOHead";
import { ContentLayout } from "@/components/content/ContentLayout";
import { getTermBySlug } from "@/content/glossary";
import { getSiteOrigin } from "@/lib/siteUrl";

export default function GlossaryTerm() {
  const { slug = "" } = useParams();
  const term = getTermBySlug(slug);
  const origin = getSiteOrigin();

  if (!term) {
    return (
      <ContentLayout>
        <SEOHead
          title="Term not found"
          description="This glossary term could not be found."
          url={`${origin}/glossary`}
          noindex
        />
        <section className="px-4 py-24 text-center">
          <h1 className="font-display text-3xl font-bold">We couldn't find that term</h1>
          <Link to="/glossary" className="mt-6 inline-block font-semibold text-sage-dark underline">
            ← Back to the glossary
          </Link>
        </section>
      </ContentLayout>
    );
  }

  const url = `${origin}/glossary/${term.slug}`;
  const related = term.related
    .map(getTermBySlug)
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: term.term,
      description: term.short,
      url,
      inDefinedTermSet: {
        "@type": "DefinedTermSet",
        name: "Vano Glossary",
        url: `${origin}/glossary`,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Glossary", item: `${origin}/glossary` },
        { "@type": "ListItem", position: 3, name: term.term, item: url },
      ],
    },
  ];

  return (
    <ContentLayout>
      <SEOHead
        title={`${term.term} — Vano Glossary`}
        description={term.short}
        url={url}
        type="article"
        jsonLd={jsonLd}
      />

      <article className="max-w-2xl mx-auto px-4 py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-navy/50">
          <Link to="/" className="hover:text-navy">Home</Link>
          <span className="mx-1.5">/</span>
          <Link to="/glossary" className="hover:text-navy">Glossary</Link>
        </nav>

        <span className="mt-6 inline-block text-[11px] font-semibold uppercase tracking-wide text-sage-dark">
          {term.category}
        </span>
        <h1 className="mt-1 font-display text-3xl sm:text-4xl font-bold leading-tight">{term.term}</h1>
        <p className="mt-3 text-lg text-navy/70">{term.short}</p>

        <div
          className="prose prose-lg mt-6 max-w-none text-navy/80 prose-headings:font-display prose-headings:text-navy prose-strong:text-navy prose-a:text-inherit prose-a:font-normal prose-a:underline prose-a:decoration-navy/25 prose-a:decoration-1 prose-a:underline-offset-2 prose-a:transition-colors hover:prose-a:text-sage-dark hover:prose-a:decoration-sage prose-li:marker:text-sage"
          dangerouslySetInnerHTML={{ __html: term.bodyHtml }}
        />

        {related.length > 0 && (
          <div className="mt-12 pt-8 border-t border-navy/10">
            <h2 className="font-display text-lg font-bold">Related terms</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to={`/glossary/${r.slug}`}
                  className="rounded-full border border-navy/15 px-3 py-1.5 text-sm font-medium text-navy/70 hover:border-sage hover:text-sage-dark transition-colors"
                >
                  {r.term}
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 rounded-2xl bg-navy px-6 py-8 text-center text-white">
          <p className="font-display text-xl font-bold">Want to earn around your lectures?</p>
          <p className="mt-2 text-white/70 text-sm">Join as a verified Vano helper in Galway and pick up jobs that fit your week.</p>
          <Link
            to="/join"
            className="mt-4 inline-flex items-center rounded-full bg-sage px-5 py-2.5 font-semibold text-white hover:bg-sage-dark transition-colors"
          >
            Join as helper
          </Link>
        </div>
      </article>
    </ContentLayout>
  );
}
