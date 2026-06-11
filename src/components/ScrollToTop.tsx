import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    // Small delay so scroll reset happens during page transition, not before.
    // When the URL carries a hash (e.g. /home#category-grid) scroll to that
    // element instead — retrying briefly since lazy routes render after the
    // transition.
    if (hash) {
      const target = hash.slice(1);
      let attempts = 0;
      const tryScroll = () => {
        const el = document.getElementById(target);
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        if (++attempts < 10) window.setTimeout(tryScroll, 100);
      };
      const t = setTimeout(tryScroll, 50);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }), 50);
    return () => clearTimeout(t);
  }, [pathname, hash]);
  return null;
};
