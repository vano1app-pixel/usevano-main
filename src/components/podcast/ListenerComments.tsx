import React from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { LISTENER_COMMENTS, type ListenerComment } from "@/content/podcast";
export default function ListenerComments({
  comments = LISTENER_COMMENTS,
}: {
  comments?: readonly ListenerComment[];
}) {
  if (!comments.length) return null;
  return (
    <section
      className="vp-listener-comments vp-wrap"
      aria-labelledby="listener-comments-heading"
    >
      <div className="vp-section-top">
        <div>
          <p className="vp-kicker">Around the conversation</p>
          <h2 id="listener-comments-heading">From the comments.</h2>
        </div>
      </div>
      <div className="vp-comment-rail">
        {comments.map((comment) => (
          <figure
            className="vp-listener-comment"
            key={comment.sourceUrl + comment.quote}
          >
            <blockquote>
              <p>“{comment.quote}”</p>
            </blockquote>
            <figcaption>
              <div>
                <MessageCircle size={16} aria-hidden="true" />
                <span className="vp-comment-name" aria-hidden="true">
                  VANO listener
                </span>
                <span className="sr-only">Listener name hidden</span>
              </div>
              <a
                href={comment.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {comment.platform}
                <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
