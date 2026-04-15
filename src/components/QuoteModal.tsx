import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { HIRE_TIMELINES, HIRE_BUDGETS, budgetLabel, timelineLabel } from '@/lib/hireOptions';
import { cn } from '@/lib/utils';
import { MessageSquareQuote, Loader2 } from 'lucide-react';
import { getSupabaseProjectRef } from '@/lib/supabaseEnv';
import { track } from '@/lib/track';

interface QuoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  freelancerId: string;
  freelancerName: string;
  category?: string | null;
}

/**
 * Low-commitment quote request: sends a pre-filled message to the freelancer
 * (creates a conversation + first message). No timer, no pressure.
 */

/**
 * Category-aware brief scaffolds. Pre-filled into the textarea on first open
 * so the hirer is editing blanks rather than staring at an empty box —
 * empty-textarea is the single biggest typing barrier in this flow.
 *
 * Keep them short and use `___` as the obvious "fill me in" marker.
 */
const BRIEF_TEMPLATES: Record<string, string> = {
  videography:
    "Hi! I need a video for ___. About ___ minutes long, for ___ (Instagram / website / event). Can you help?",
  digital_sales:
    "Hi! I'm looking for help bringing in clients for ___. Mostly through ___ (cold email / calls / LinkedIn). Can you help?",
  websites:
    "Hi! I need a website for ___ — about ___ pages, with ___ (contact form / shop / booking). Can you help?",
  social_media:
    "Hi! I need help with social media for ___ on ___ (Instagram / TikTok). Looking for ___ (content / strategy / paid ads). Can you help?",
  other:
    "Hi! I need help with ___. Can you tell me what you'd charge and how long it'd take?",
};

function buildTemplate(category: string | null | undefined, freelancerName: string): string {
  const tpl = (category && BRIEF_TEMPLATES[category]) || BRIEF_TEMPLATES.other;
  // Personalise the greeting so it doesn't read as canned spam.
  return tpl.replace(/^Hi!/, `Hi ${freelancerName}!`);
}

export const QuoteModal: React.FC<QuoteModalProps> = ({
  open,
  onOpenChange,
  freelancerId,
  freelancerName,
  category,
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [brief, setBrief] = useState('');
  const [timeline, setTimeline] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Track whether we've already seeded a template for this open-cycle so we
  // don't overwrite the user's edits on every re-render.
  const [seeded, setSeeded] = useState(false);

  // Seed the textarea with a category-aware scaffold on each open. We only
  // seed when the field is empty so we never blow away in-progress text.
  useEffect(() => {
    if (!open) {
      setSeeded(false);
      return;
    }
    if (seeded) return;
    if (brief.trim().length === 0) {
      setBrief(buildTemplate(category, freelancerName));
    }
    setSeeded(true);
  }, [open, seeded, brief, category, freelancerName]);

  // The template scaffolds the message but the user has to actually edit it
  // — sending the verbatim template (with blanks intact) would just be spam.
  const unedited = buildTemplate(category, freelancerName);
  const canSubmit =
    brief.trim().length >= 5 &&
    brief.trim() !== unedited.trim() &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        // Route to auth, preserve intent so we can resume after login
        navigate(`/auth?intent=quote&freelancer=${freelancerId}`);
        return;
      }

      const msgParts = [
        `👋 Hi ${freelancerName}, looking for a quote.`,
        '',
        brief.trim(),
      ];
      const meta: string[] = [];
      if (timeline) meta.push(`Timeline: ${timelineLabel(timeline)}`);
      if (budget) meta.push(`Budget: ${budgetLabel(budget)}`);
      if (meta.length > 0) {
        msgParts.push('');
        msgParts.push(meta.join(' · '));
      }
      const draft = msgParts.join('\n');

      // Ensure a conversation exists (same pattern as StudentProfile.handleMessage)
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `and(participant_1.eq.${session.user.id},participant_2.eq.${freelancerId}),and(participant_1.eq.${freelancerId},participant_2.eq.${session.user.id})`,
        )
        .maybeSingle();

      let convoId = existing?.id as string | undefined;
      if (!convoId) {
        const { data: created, error: convoErr } = await supabase
          .from('conversations')
          .insert({ participant_1: session.user.id, participant_2: freelancerId })
          .select('id')
          .single();
        if (convoErr || !created) throw convoErr || new Error('Could not create conversation');
        convoId = created.id;
      }

      // Actually send the first message — previously this only drafted the message
      // in Messages and required the user to click Send. That step is removed.
      const { error: msgErr } = await supabase
        .from('messages')
        .insert({ conversation_id: convoId, sender_id: session.user.id, content: draft });
      if (msgErr) throw msgErr;

      // Bump conversation timestamp + fire push notification (both fire-and-forget)
      const nowIso = new Date().toISOString();
      supabase.from('conversations').update({ updated_at: nowIso }).eq('id', convoId).then(() => {});
      const projectId = (import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined) || getSupabaseProjectRef();
      if (projectId && session.access_token) {
        fetch(`https://${projectId}.supabase.co/functions/v1/notify-new-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ recipient_id: freelancerId, message_preview: draft.slice(0, 140) }),
        }).catch(() => {});
      }

      track('quote_sent', { freelancer_id: freelancerId, category: category || null, has_timeline: !!timeline, has_budget: !!budget });

      toast({
        title: 'Quote request sent!',
        description: `${freelancerName} will reply in Messages.`,
      });

      // Open the conversation so the user sees their sent message and can follow up.
      navigate(`/messages?with=${freelancerId}`);
      onOpenChange(false);
    } catch (err) {
      console.error('QuoteModal submit error', err);
      toast({
        title: 'Could not send',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareQuote size={18} className="text-primary" />
            Ask {freelancerName} for a quote
          </DialogTitle>
          <DialogDescription>
            Describe what you need. No pressure — they'll reply in Messages.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. I need a 30-second promo video for my cafe's Instagram"
              className="w-full min-h-[110px] resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40"
              autoFocus
            />
            {brief.includes('___') && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tip: replace the <span className="font-mono text-foreground/80">___</span> blanks with your details, then send.
              </p>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Timeline (optional)
            </p>
            <div className="flex flex-wrap gap-2">
              {HIRE_TIMELINES.map((t) => {
                const active = timeline === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTimeline(active ? null : t.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:border-primary/40',
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Budget (optional)
            </p>
            <div className="flex flex-wrap gap-2">
              {HIRE_BUDGETS.map((b) => {
                const active = budget === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBudget(active ? null : b.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-foreground hover:border-primary/40',
                    )}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={cn(
              'w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-md transition-all',
              'hover:shadow-lg hover:brightness-110',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-md disabled:hover:brightness-100',
              'flex items-center justify-center gap-2',
            )}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Sending…
              </>
            ) : (
              <>Send quote request</>
            )}
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            {category ? <>Category: {category} · </> : null}
            You can always message more after.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
