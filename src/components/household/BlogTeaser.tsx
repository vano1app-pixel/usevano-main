import React from 'react';
import { Link } from 'react-router-dom';
import { BLOG_POSTS } from '@/content/blog';

/**
 * A slim "from the blog" strip at the foot of the homepage. Deliberately tiny —
 * one inline row of the latest posts — so it still aids discovery and internal
 * linking (SEO) without taking real space from the booking flow above it. The
 * full blog also lives in the footer nav and at /blog.
 *
 * Mobile shows just the newest post to stay one line; sm+ shows three.
 */
export const BlogTeaser: React.FC = () => {
  const posts = [...BLOG_POSTS]
    .sort((a, b) => +new Date(b.datePublished) - +new Date(a.datePublished))
    .slice(0, 3);

  return (
    <section className="bg-cream border-t border-navy/10 px-4 py-6" aria-labelledby="blog-teaser-heading">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h2 id="blog-teaser-heading" className="shrink-0 text-xs font-semibold uppercase tracking-[0.14em] text-sage-dark">
          From the blog
        </h2>

        {posts.map((post, i) => (
          <span
            key={post.slug}
            className={i === 0
              ? 'flex items-center gap-x-2.5 min-w-0'
              : 'hidden sm:flex items-center gap-x-2.5 min-w-0'}
          >
            <span aria-hidden className="text-navy/20">·</span>
            <Link
              to={`/blog/${post.slug}`}
              className="truncate text-sm text-navy/70 hover:text-sage-dark transition-colors"
            >
              {post.title}
            </Link>
          </span>
        ))}

        <Link
          to="/blog"
          className="ml-auto shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-navy/55 hover:text-sage-dark transition-colors"
        >
          Read all <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
};
