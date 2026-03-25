import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useIsAdmin(userId?: string) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .rpc('has_role', { _user_id: userId, _role: 'admin' })
      .then(({ data }) => setIsAdmin(!!data));
  }, [userId]);

  return isAdmin;
}
