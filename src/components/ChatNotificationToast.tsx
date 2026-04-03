import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const ChatNotificationToast: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const userIdRef = useRef<string | null>(null);
  const locationRef = useRef(location.pathname);
  const conversationIdsRef = useRef<Set<string>>(new Set());

  // Keep location ref current
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const userId = session.user.id;
      userIdRef.current = userId;

      // Fetch conversation IDs the user is part of
      const { data: convos } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`);

      if (!convos || convos.length === 0) return;

      conversationIdsRef.current = new Set(convos.map((c) => c.id));

      // Subscribe to new messages
      channel = supabase
        .channel('chat-toast')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          async (payload) => {
            const msg = payload.new as {
              id: string;
              sender_id: string;
              conversation_id: string;
              content: string;
            };

            // Skip own messages
            if (msg.sender_id === userIdRef.current) return;
            // Skip if not in user's conversations
            if (!conversationIdsRef.current.has(msg.conversation_id)) return;
            // Skip if user is already on the messages page
            if (locationRef.current.startsWith('/messages')) return;

            // Fetch sender name
            const { data: sender } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('user_id', msg.sender_id)
              .maybeSingle();

            const senderName = sender?.display_name || 'Someone';
            const preview = msg.content.length > 60
              ? msg.content.slice(0, 57) + '…'
              : msg.content;

            toast({
              title: `💬 ${senderName}`,
              description: preview || 'Sent you a message',
            });
          },
        )
        .subscribe();
    };

    setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [toast, navigate]);

  return null;
};
