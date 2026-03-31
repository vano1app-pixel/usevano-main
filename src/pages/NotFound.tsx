import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { SEOHead } from '@/components/SEOHead';
import logo from '@/assets/logo.png';
import { ArrowLeft } from 'lucide-react';

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (import.meta.env.DEV) console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <SEOHead
        title="404 – Page not found · VANO"
        description="The page you're looking for doesn't exist. Return to the VANO home page."
      />
      <div className="flex items-center gap-2">
        <img src={logo} alt="VANO" className="h-9 w-9 rounded-xl" />
        <span className="text-2xl font-bold tracking-tight text-primary">VANO</span>
      </div>
      <div className="text-center">
        <p className="text-[4rem] font-bold leading-none tracking-tight text-foreground">404</p>
        <p className="mt-2 text-lg font-medium text-foreground">Page not found</p>
        <p className="mt-1 text-sm text-muted-foreground">
          That page doesn't exist or may have moved.
        </p>
      </div>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <ArrowLeft size={16} strokeWidth={2.5} />
        Back to home
      </button>
    </div>
  );
};

export default NotFound;
