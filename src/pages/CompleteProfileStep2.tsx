import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Step 2 is no longer used — the onboarding modal handles all missing fields for students.
 * This page just redirects to /profile.
 */
const CompleteProfileStep2 = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/profile', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
};

export default CompleteProfileStep2;
