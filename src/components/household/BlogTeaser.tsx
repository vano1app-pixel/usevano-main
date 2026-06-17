import React from 'react';
import { Link } from 'react-router-dom';
import { BLOG_POSTS } from '@/content/blog';

/**
 * Quiet "from the blog" strip near the foot of the homepage. Deliberately
 * understated — a display-font heading and a plain list of the latest few
 * posts, no loud cards — so it aids discovery (and internal linking for SEO)
 * without competing with the booking CTA above it.
 */
export const BlogTeaser: React.FC = () => {
  const posts = [...BLOG_POSTS]
    .sort((a, b) => +new Date(b.datePublished) - +new Date(a.datePublished))
    .slice(0, 4);

  return (
    <section className="bg-cream px-4 py-16 lg:py-20" aria-labelledby="blog-teaser-heading">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sage-dark">From the blog</p>
            <h2 id="blog-teaser-heading" className="mt-2 font-display text-3xl sm:text-4xl font-bold leading-tight text-navy">
              Guides for students &amp; households
            </h2>
          </div>
          <Link
            to="/blog"
            className="hidden sm:inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-navy/60 hover:text-sage-dark transition-colors"
          >
            Read the blog
            <span aria-hidden>→</span>
          </Link>
        </div>

        <ul className="mt-8 border-t border-navy/10">
          {posts.map((post) => (
            <li key={post.slug} className="border-b border-navy/10">
              <Link
                to={`/blog/${post.slug}`}
                className="group flex items-baseline justify-between gap-6 py-4"
              >
                <span className="font-display text-lg font-semibold text-navy group-hover:text-sage-dark transition-colors">
                  {post.title}
                </span>
                <span className="hidden sm:block shrink-0 text-xs text-navy/40">{post.readingMins} min read</span>
              </Link>
            </li>
          ))}
        </ul>

        <Link
          to="/blog"
          className="mt-6 inline-flex sm:hidden items-center gap-1.5 text-sm font-semibold text-sage-dark"
        >
          Read the blog
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
};
