import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { getSupabaseProjectRef } from '@/lib/supabaseEnv';
import { Loader2 } from 'lucide-react';

type RequestFeatureModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RequestFeatureModal({ open, onOpenChange }: RequestFeatureModalProps) {
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) setMessage('');
  }, [open]);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast({ title: 'Write something', description: "Tell us what you'd like to see.", variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        toast({
          title: 'Sign in required',
          description: 'Sign in to send a feature request.',
          variant: 'destructive',
        });
        setSending(false);
        return;
      }
      const { error } = await supabase.from('feature_requests').insert({
        user_id: session.user.id,
        message: trimmed,
      });
      if (error) throw error;
      toast({ title: 'Thanks!', description: "We've received your idea." });

      // Notify admin via email (fire-and-forget)
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || getSupabaseProjectRef();
      if (projectId && session.access_token) {
        const { data: profile } = await supabase.from('profiles').select('display_name').eq('user_id', session.user.id).single();
        fetch(`https://${projectId}.supabase.co/functions/v1/notify-feature-request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ user_name: profile?.display_name || session.user.email || 'Unknown', message: trimmed }),
        }).catch(() => {});
      }
      setMessage('');
      onOpenChange(false);
    } catch (e: unknown) {
      toast({
        title: 'Could not send',
        description: getUserFriendlyError(e),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a feature</DialogTitle>
        </DialogHeader>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What would make VANO better for you?"
          className="min-h-[120px] resize-none"
          maxLength={2000}
          disabled={sending}
        />
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              'Submit'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
