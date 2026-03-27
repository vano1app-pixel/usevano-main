import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { Loader2, Sparkles, ImageIcon, Wand2 } from 'lucide-react';

/** Curated wide images suitable for freelancer banner cards (Unsplash, free to use). */
const STOCK_BANNER_URLS = [
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&h=400&fit=crop',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&h=400&fit=crop',
  'https://images.unsplash.com/photo-1497215842964-222b430dc094?w=1200&h=400&fit=crop',
  'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=1200&h=400&fit=crop',
  'https://images.unsplash.com/photo-1523240795612-9a054b0de644?w=1200&h=400&fit=crop',
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&h=400&fit=crop',
];

export interface ListingRequestRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  applicant_email: string | null;
  status: string;
  created_at: string;
  requester_name?: string;
}

type Props = {
  request: ListingRequestRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApproved: () => void;
};

export function AdminListingReviewModal({ request, open, onOpenChange, onApproved }: Props) {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bio, setBio] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !request) return;
    setTitle(request.title);
    setDescription(request.description);
    setRejectNote('');
    setLoading(true);
    void (async () => {
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('bio, student_email, display_name')
          .eq('user_id', request.user_id)
          .maybeSingle();
        const { data: sp } = await supabase
          .from('student_profiles')
          .select('bio, banner_url, verified_email')
          .eq('user_id', request.user_id)
          .maybeSingle();
        setBio((sp?.bio || prof?.bio || '').trim());
        setBannerUrl(sp?.banner_url || '');
        const em =
          prof?.student_email?.trim() ||
          sp?.verified_email?.trim() ||
          request.applicant_email?.trim() ||
          null;
        setRecipientEmail(em);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, request]);

  const improveBio = async () => {
    if (!bio.trim()) {
      toast({ title: 'Nothing to improve', description: 'Add some bio text first.', variant: 'destructive' });
      return;
    }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('improve-community-bio', {
        body: { bio },
      });
      if (error) throw error;
      const next = (data as { bio?: string })?.bio;
      if (!next) throw new Error('No bio returned');
      setBio(next);
      toast({ title: 'Bio updated', description: 'Review the text before approving.' });
    } catch (e: unknown) {
      toast({ title: 'AI error', description: getUserFriendlyError(e), variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const pickStockBanner = () => {
    const url = STOCK_BANNER_URLS[Math.floor(Math.random() * STOCK_BANNER_URLS.length)];
    setBannerUrl(url);
    toast({ title: 'Stock banner applied', description: 'You can change it before approving.' });
  };

  const onBannerFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !request) return;
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 4MB', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${request.user_id}/banner-admin-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      setBannerUrl(`${pub.publicUrl}?t=${Date.now()}`);
      toast({ title: 'Banner uploaded' });
    } catch (e: unknown) {
      toast({ title: 'Upload failed', description: getUserFriendlyError(e), variant: 'destructive' });
    } finally {
      setActionLoading(false);
      e.target.value = '';
    }
  };

  const saveAndApprove = async () => {
    if (!request) return;
    setActionLoading(true);
    try {
      const { error: rErr } = await supabase
        .from('community_listing_requests')
        .update({ title: title.trim(), description: description.trim() })
        .eq('id', request.id);
      if (rErr) throw rErr;

      const { error: spErr } = await supabase
        .from('student_profiles')
        .update({
          bio: bio.trim(),
          banner_url: bannerUrl.trim() || null,
        })
        .eq('user_id', request.user_id);
      if (spErr) throw spErr;

      const { error: rpcErr } = await supabase.rpc('approve_community_listing_request', {
        _request_id: request.id,
      });
      if (rpcErr) throw rpcErr;

      const to = recipientEmail;
      if (to) {
        const { error: mailErr } = await supabase.functions.invoke('send-listing-decision-email', {
          body: {
            decision: 'approved',
            recipient_email: to,
            listing_title: title.trim(),
          },
        });
        if (mailErr) {
          console.warn(
            '[VANO] send-listing-decision-email failed — check RESEND_API_KEY and RESEND_FROM on the Edge Function (Supabase dashboard).',
            mailErr.message,
          );
        }
      }

      toast({ title: 'Listing approved', description: 'Community post created and applicant notified.' });
      onOpenChange(false);
      onApproved();
    } catch (e: unknown) {
      toast({ title: 'Approve failed', description: getUserFriendlyError(e), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const decline = async () => {
    if (!request) return;
    setActionLoading(true);
    try {
      const { error: rpcErr } = await supabase.rpc('reject_community_listing_request', {
        _request_id: request.id,
        _note: rejectNote.trim() || null,
      });
      if (rpcErr) throw rpcErr;

      const to = recipientEmail;
      if (to) {
        const { error: mailErr } = await supabase.functions.invoke('send-listing-decision-email', {
          body: {
            decision: 'rejected',
            recipient_email: to,
            listing_title: title.trim() || request.title,
            note: rejectNote.trim() || null,
          },
        });
        if (mailErr) {
          console.warn(
            '[VANO] send-listing-decision-email failed — check RESEND_API_KEY and RESEND_FROM on the Edge Function (Supabase dashboard).',
            mailErr.message,
          );
        }
      }

      toast({ title: 'Listing declined', description: 'Applicant email sent if configured.' });
      onOpenChange(false);
      onApproved();
    } catch (e: unknown) {
      toast({ title: 'Decline failed', description: getUserFriendlyError(e), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[min(90dvh,40rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Community listing</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Edit copy and images before approval. Uses the same Resend email flow as listing submissions.
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="adm-title">Listing title</Label>
              <Input id="adm-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="adm-desc">Listing description</Label>
              <Textarea
                id="adm-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="mt-1"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="adm-bio">Freelancer bio (student profile)</Label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={aiLoading || actionLoading}
                  onClick={() => void improveBio()}
                  className="gap-1.5"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Improve with AI
                </Button>
              </div>
              <Textarea
                id="adm-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={6}
                className="mt-1"
                placeholder="Shown on profile and community card context"
              />
            </div>
            <div>
              <Label>Banner image (community card)</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={pickStockBanner} disabled={actionLoading}>
                  <Wand2 className="h-4 w-4 mr-1" />
                  Random stock banner
                </Button>
                <label className="inline-flex">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => void onBannerFile(e)} />
                  <span className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium cursor-pointer hover:bg-muted">
                    <ImageIcon className="h-4 w-4" />
                    Upload
                  </span>
                </label>
              </div>
              {bannerUrl ? (
                <div className="mt-2 rounded-lg border border-border overflow-hidden bg-muted aspect-[3/1] max-h-40">
                  <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">No banner yet — pick stock or upload.</p>
              )}
              <Input
                className="mt-2 text-xs"
                placeholder="Or paste image URL"
                value={bannerUrl}
                onChange={(e) => setBannerUrl(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="adm-reject">Decline note (optional, emailed if rejected)</Label>
              <Textarea
                id="adm-reject"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={2}
                className="mt-1"
                placeholder="Short reason for the applicant"
              />
            </div>
            {recipientEmail && (
              <p className="text-xs text-muted-foreground">
                Notifications: <span className="font-medium text-foreground">{recipientEmail}</span>
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={actionLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void decline()} disabled={actionLoading || loading}>
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Decline'}
          </Button>
          <Button onClick={() => void saveAndApprove()} disabled={actionLoading || loading || !title.trim()}>
            {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve & publish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
