import React, { useState, useEffect } from 'react';
import { Bell, MessageSquare, Briefcase } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const NotificationPreferences: React.FC = () => {
  const { toast } = useToast();
  const [notifyGigs, setNotifyGigs] = useState(true);
  const [notifyMessages, setNotifyMessages] = useState(true);
  const [loading, setLoading] = useState(true);
  const [hasSubscription, setHasSubscription] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setLoading(false); return; }

      const { data } = await supabase
        .from('push_subscriptions')
        .select('notify_gigs, notify_messages')
        .eq('user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (data) {
        setHasSubscription(true);
        setNotifyGigs(data.notify_gigs ?? true);
        setNotifyMessages(data.notify_messages ?? true);
      }
    } catch (err) {
      console.error('Failed to load notification prefs:', err);
    } finally {
      setLoading(false);
    }
  };

  const updatePreference = async (field: 'notify_gigs' | 'notify_messages', value: boolean) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { error } = await supabase
        .from('push_subscriptions')
        .update({ [field]: value })
        .eq('user_id', session.user.id);

      if (error) throw error;

      if (field === 'notify_gigs') setNotifyGigs(value);
      else setNotifyMessages(value);

      toast({
        title: 'Preference updated',
        description: `${field === 'notify_gigs' ? 'Gig' : 'Message'} notifications ${value ? 'enabled' : 'disabled'}.`,
      });
    } catch {
      toast({ title: 'Error', description: 'Failed to update preference.', variant: 'destructive' });
    }
  };

  if (loading) return null;
  if (!hasSubscription) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Bell size={16} className="text-primary" />
        Push Notification Preferences
      </h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <Briefcase size={14} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">New gigs</p>
              <p className="text-xs text-muted-foreground">Get notified when gigs match your skills</p>
            </div>
          </div>
          <Switch checked={notifyGigs} onCheckedChange={(v) => updatePreference('notify_gigs', v)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <MessageSquare size={14} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Messages</p>
              <p className="text-xs text-muted-foreground">Get notified when someone messages you</p>
            </div>
          </div>
          <Switch checked={notifyMessages} onCheckedChange={(v) => updatePreference('notify_messages', v)} />
        </div>
      </div>
    </div>
  );
};
