import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    // Small delay so scroll reset happens during page transition, not before
    const t = setTimeout(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }), 50);
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
};
