import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { SEOHead } from "@/components/SEOHead";
import { ContentLayout } from "@/components/content/ContentLayout";
import { getPostBySlug } from "@/content/blog";
import { getSiteOrigin } from "@/lib/siteUrl";

export default function BlogPost() {
  const { slug = "" } = useParams();
  const post = getPostBySlug(slug);
  const origin = getSiteOrigin();

  if (!post) {
    return (
      <ContentLayout>
        <SEOHead
          title="Article not found"
          description="This article could not be found."
          url={`${origin}/blog`}
          noindex
        />
        <section className="px-4 py-24 text-center">
          <h1 className="font-display text-3xl font-bold">We couldn't find that article</h1>
          <p className="mt-3 text-navy/70">It may have moved or been renamed.</p>
          <Link to="/blog" className="mt-6 inline-block font-semibold text-sage-dark underline">
            ← Back to the blog
          </Link>
        </section>
      </ContentLayout>
    );
  }

  const url = `${origin}/blog/${post.slug}`;
  const related = post.related
    .map(getPostBySlug)
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      abstract: post.summary,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      author: { "@type": "Organization", name: "VANO", url: `${origin}/` },
      publisher: {
        "@type": "Organization",
        name: "VANO",
        logo: { "@type": "ImageObject", url: `${origin}/pwa-512x512.png` },
      },
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      image: `${origin}/og.png`,
      keywords: post.keywords,
      articleSection: post.tags,
      inLanguage: "en-IE",
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${origin}/blog` },
        { "@type": "ListItem", position: 3, name: post.title, item: url },
      ],
    },
  ];

  return (
    <ContentLayout>
      <SEOHead
        title={post.title}
        description={post.description}
        keywords={post.keywords}
        url={url}
        type="article"
        publishedTime={post.datePublished}
        modifiedTime={post.dateModified}
        jsonLd={jsonLd}
      />

      <article className="pb-20">
        {/* Decorative branded hero — swap in post.heroImage for a real photo. */}
        <div
          className={`relative aspect-[21/9] sm:aspect-[3/1] w-full bg-gradient-to-br ${post.heroGradient}`}
          role="img"
          aria-label={post.heroAlt}
        >
          {post.heroImage && (
            <img
              src={post.heroImage}
              alt={post.heroAlt}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <span className="absolute bottom-4 left-4 rounded-full bg-black/25 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {post.eyebrow}
          </span>
        </div>

        <div className="max-w-2xl mx-auto px-4">
          <nav aria-label="Breadcrumb" className="mt-6 text-xs text-navy/50">
            <Link to="/" className="hover:text-navy">Home</Link>
            <span className="mx-1.5">/</span>
            <Link to="/blog" className="hover:text-navy">Blog</Link>
          </nav>

          <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold leading-tight">
            {post.title}
          </h1>
          <p className="mt-3 text-sm text-navy/50">
            {format(new Date(post.datePublished), "d MMM yyyy")} · {post.readingMins} min read · By {post.author}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-sage/10 px-3 py-1 text-xs font-medium text-sage-dark">
                {tag}
              </span>
            ))}
          </div>

          {/* Quick answer — readable in one glance, and the snippet AI engines lift. */}
          <aside className="mt-8 rounded-2xl border-l-2 border-sage bg-sage/5 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sage-dark">Quick answer</p>
            <p className="mt-1.5 text-navy/80 leading-relaxed">{post.summary}</p>
          </aside>

          <div
            className="prose prose-lg mt-8 max-w-none text-navy/80 prose-headings:font-display prose-headings:text-navy prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-2xl prose-strong:text-navy prose-a:text-inherit prose-a:font-normal prose-a:underline prose-a:decoration-navy/25 prose-a:decoration-1 prose-a:underline-offset-2 prose-a:transition-colors hover:prose-a:text-sage-dark hover:prose-a:decoration-sage prose-blockquote:border-l-sage prose-blockquote:text-navy/75 prose-blockquote:font-normal prose-blockquote:not-italic prose-li:marker:text-sage"
            dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
          />
        </div>

        {related.length > 0 && (
          <div className="max-w-2xl mx-auto px-4 mt-14 pt-10 border-t border-navy/10">
            <h2 className="font-display text-xl font-bold">Keep reading</h2>
            <ul className="mt-4 space-y-3">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link to={`/blog/${r.slug}`} className="group flex items-baseline gap-2">
                    <span className="font-medium text-navy group-hover:text-sage-dark transition-colors">
                      {r.title}
                    </span>
                  </Link>
                  <span className="text-sm text-navy/60">{r.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>
    </ContentLayout>
  );
}
