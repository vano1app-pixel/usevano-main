import { Link } from "react-router-dom";
import { format } from "date-fns";
import { SEOHead } from "@/components/SEOHead";
import { ContentLayout } from "@/components/content/ContentLayout";
import { BLOG_POSTS, type BlogPost } from "@/content/blog";
import { getSiteOrigin } from "@/lib/siteUrl";

const DESCRIPTION =
  "Tips, guides and honest takes on flexible student work, fair pay and same-day home help in Galway — from the team at Vano.";

function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
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
        <h3 className="font-display text-lg font-bold leading-snug group-hover:text-sage-dark transition-colors">
          {post.title}
        </h3>
        <p className="mt-2 flex-1 text-sm text-navy/70">{post.description}</p>
        <p className="mt-4 text-xs text-navy/50">
          {format(new Date(post.datePublished), "d MMM yyyy")} · {post.readingMins} min read
        </p>
      </div>
    </Link>
  );
}

export default function BlogIndex() {
  const origin = getSiteOrigin();
  const posts = [...BLOG_POSTS].sort(
    (a, b) => +new Date(b.datePublished) - +new Date(a.datePublished),
  );
  const [featured, ...rest] = posts;

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

      {/* Masthead */}
      <section className="px-4 pt-16 pb-12">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sage-dark">The Vano Blog</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-tight">
            Flexible student work, fair pay <span className="text-sage-dark">&amp;</span> home help in Galway
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-navy/70">{DESCRIPTION}</p>
        </div>
      </section>

      {/* Featured (latest) */}
      <section className="px-4">
        <div className="max-w-5xl mx-auto">
          <Link
            to={`/blog/${featured.slug}`}
            className="group grid md:grid-cols-5 rounded-3xl bg-white border border-navy/10 overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
          >
            <div
              className={`relative md:col-span-2 aspect-[16/10] md:aspect-auto md:min-h-[260px] bg-gradient-to-br ${featured.heroGradient}`}
              role="img"
              aria-label={featured.heroAlt}
            >
              {featured.heroImage && (
                <img src={featured.heroImage} alt={featured.heroAlt} className="absolute inset-0 h-full w-full object-cover" />
              )}
              <span className="absolute top-4 left-4 rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                Latest · {featured.eyebrow}
              </span>
            </div>
            <div className="md:col-span-3 flex flex-col justify-center p-6 sm:p-8">
              <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight group-hover:text-sage-dark transition-colors">
                {featured.title}
              </h2>
              <p className="mt-3 text-navy/70 leading-relaxed">{featured.summary}</p>
              <p className="mt-5 text-xs text-navy/50">
                {format(new Date(featured.datePublished), "d MMM yyyy")} · {featured.readingMins} min read
              </p>
            </div>
          </Link>
        </div>
      </section>

      {/* The rest */}
      <section className="px-4 pt-12 pb-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-navy/40">More guides</h2>
          <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </div>
      </section>
    </ContentLayout>
  );
}
