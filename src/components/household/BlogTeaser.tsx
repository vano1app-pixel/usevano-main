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
    // Deliberately recessive — reads as fine-print footer links, not a content
    // band — but every post link stays visible and in the DOM so the homepage
    // keeps its internal links to the blog (the SEO benefit). Quiet, not hidden.
    <section className="bg-cream px-4 py-2.5" aria-labelledby="blog-teaser-heading">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id="blog-teaser-heading" className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-navy/35">
          From the blog
        </h2>

        {posts.map((post, i) => (
          <span
            key={post.slug}
            className={i === 0
              ? 'flex items-center gap-x-2 min-w-0'
              : 'hidden sm:flex items-center gap-x-2 min-w-0'}
          >
            <span aria-hidden className="text-navy/15">·</span>
            <Link
              to={`/blog/${post.slug}`}
              className="truncate text-xs text-navy/45 hover:text-sage-dark transition-colors"
            >
              {post.title}
            </Link>
          </span>
        ))}

        <Link
          to="/blog"
          className="ml-auto shrink-0 inline-flex items-center gap-1 text-xs font-medium text-navy/40 hover:text-sage-dark transition-colors"
        >
          Read all <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
};
