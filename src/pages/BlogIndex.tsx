import { Link } from "react-router-dom";
import { format } from "date-fns";
import { SEOHead } from "@/components/SEOHead";
import { ContentLayout } from "@/components/content/ContentLayout";
import { BLOG_POSTS } from "@/content/blog";
import { getSiteOrigin } from "@/lib/siteUrl";

const DESCRIPTION =
  "Tips, guides and honest takes on flexible student work, fair pay and same-day home help in Galway — from the team at Vano.";

export default function BlogIndex() {
  const origin = getSiteOrigin();
  const posts = [...BLOG_POSTS].sort(
    (a, b) => +new Date(b.datePublished) - +new Date(a.datePublished),
  );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${origin}/blog`,
    name: "Vano Blog",
    description: DESCRIPTION,
    url: `${origin}/blog`,
    inLanguage: "en-IE",
    publisher: { "@type": "Organization", name: "VANO", url: `${origin}/` },
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${origin}/blog/${p.slug}`,
      datePublished: p.datePublished,
      dateModified: p.dateModified,
    })),
  };

  return (
    <ContentLayout>
      <SEOHead
        title="Vano Blog — Student Work, Fair Pay & Home Help in Galway"
        description={DESCRIPTION}
        keywords="Vano blog, student jobs Galway, flexible work Ireland, ATU student jobs, fair pay gig work, same-day home help"
        url={`${origin}/blog`}
        jsonLd={jsonLd}
      />

      <section className="px-4 pt-14 pb-10">
        <div className="max-w-5xl mx-auto">
          <p className="text-sm font-semibold uppercase tracking-wide text-sage-dark">The Vano Blog</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl font-bold leading-tight">
            Flexible student work, fair pay &amp; home help in Galway
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-navy/70">{DESCRIPTION}</p>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="max-w-5xl mx-auto grid gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="group flex flex-col rounded-2xl bg-white border border-navy/10 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <div
                className={`relative aspect-[16/9] bg-gradient-to-br ${post.heroGradient}`}
                role="img"
                aria-label={post.heroAlt}
              >
                {post.heroImage && (
                  <img
                    src={post.heroImage}
                    alt={post.heroAlt}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span className="absolute bottom-3 left-3 rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                  {post.eyebrow}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h2 className="font-display text-xl font-bold leading-snug group-hover:text-sage-dark transition-colors">
                  {post.title}
                </h2>
                <p className="mt-2 flex-1 text-sm text-navy/70">{post.description}</p>
                <p className="mt-4 text-xs text-navy/50">
                  {format(new Date(post.datePublished), "d MMM yyyy")} · {post.readingMins} min read
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </ContentLayout>
  );
}
