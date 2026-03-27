import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { CommunityCategoryId } from '@/lib/communityCategories';
import { categoryLabel } from '@/lib/communityCategories';

interface CreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPostCreated: () => void;
  userId: string;
  category: CommunityCategoryId;
}

export const CreatePostDialog = ({ open, onOpenChange, onPostCreated, userId, category }: CreatePostDialogProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rateUnit, setRateUnit] = useState<string>('hourly');
  const [rateMin, setRateMin] = useState('');
  const [rateMax, setRateMax] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    setSubmitting(true);

    try {
      let image_url: string | null = null;

      if (imageFile) {
        const ext = imageFile.name.split('.').pop();
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('community-images')
          .upload(path, imageFile);
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage
          .from('community-images')
          .getPublicUrl(path);
        image_url = publicUrl;
      }

      let rate_min: number | null = null;
      let rate_max: number | null = null;
      let rate_unit: string | null = rateUnit;

      if (rateUnit === 'negotiable') {
        rate_min = null;
        rate_max = null;
        rate_unit = 'negotiable';
      } else {
        if (rateMin.trim()) {
          const n = parseFloat(rateMin.replace(',', '.'));
          if (Number.isNaN(n) || n < 0) {
            toast({ title: 'Invalid budget', description: 'Enter a valid minimum amount.', variant: 'destructive' });
            setSubmitting(false);
            return;
          }
          rate_min = n;
        }
        if (rateMax.trim()) {
          const n = parseFloat(rateMax.replace(',', '.'));
          if (Number.isNaN(n) || n < 0) {
            toast({ title: 'Invalid budget', description: 'Enter a valid maximum amount.', variant: 'destructive' });
            setSubmitting(false);
            return;
          }
          rate_max = n;
        }
        if (rate_min != null && rate_max != null && rate_max < rate_min) {
          toast({ title: 'Invalid range', description: 'Maximum should be greater than minimum.', variant: 'destructive' });
          setSubmitting(false);
          return;
        }
      }

      const { data: inserted, error } = await supabase
        .from('community_posts')
        .insert({
          user_id: userId,
          category,
          title: title.trim(),
          description: description.trim(),
          image_url,
          rate_min,
          rate_max,
          rate_unit,
          moderation_status: 'approved',
        })
        .select('id')
        .single();

      if (error) throw error;

      const { data: spRow } = await supabase.from('student_profiles').select('user_id').eq('user_id', userId).maybeSingle();
      if (spRow) {
        await supabase.from('student_profiles').update({ community_board_status: 'approved' }).eq('user_id', userId);
      } else {
        await supabase.from('student_profiles').insert({
          user_id: userId,
          community_board_status: 'approved',
          work_links: [],
        });
      }

      if (inserted?.id) {
        const { error: fnErr } = await supabase.functions.invoke('notify-community-listing-request', {
          body: { post_id: inserted.id },
        });
        if (fnErr) console.warn('Community notify:', fnErr.message);
      }

      toast({
        title: "You're live!",
        description: 'Your listing is now visible on the Community board.',
      });
      setTitle('');
      setDescription('');
      setRateUnit('hourly');
      setRateMin('');
      setRateMax('');
      removeImage();
      onOpenChange(false);
      onPostCreated();
    } catch (err: any) {
      toast({ title: 'Failed to post', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90dvh,720px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>List your service · {categoryLabel(category)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Headline e.g. Brand design & social assets"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="text-base sm:text-sm"
          />
          <Textarea
            placeholder="What you deliver, timeline, tools you use…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            className="min-h-[100px] text-base sm:text-sm"
          />

          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium">Budget & rate</p>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">How do you price?</Label>
              <Select value={rateUnit} onValueChange={setRateUnit}>
                <SelectTrigger className="h-11 bg-background sm:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Per hour</SelectItem>
                  <SelectItem value="day">Per day</SelectItem>
                  <SelectItem value="project">Per project (flat fee)</SelectItem>
                  <SelectItem value="negotiable">Negotiable / discuss</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rateUnit !== 'negotiable' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rate-min" className="text-xs text-muted-foreground">From (€)</Label>
                  <Input
                    id="rate-min"
                    inputMode="decimal"
                    placeholder="e.g. 25"
                    value={rateMin}
                    onChange={(e) => setRateMin(e.target.value)}
                    className="h-11 bg-background sm:h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rate-max" className="text-xs text-muted-foreground">Up to (€)</Label>
                  <Input
                    id="rate-max"
                    inputMode="decimal"
                    placeholder="Optional"
                    value={rateMax}
                    onChange={(e) => setRateMax(e.target.value)}
                    className="h-11 bg-background sm:h-10"
                  />
                </div>
              </div>
            )}
          </div>

          {imagePreview ? (
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img src={imagePreview} alt="Preview" className="w-full max-h-64 object-cover" />
              <button
                onClick={removeImage}
                className="absolute top-2 right-2 p-1 bg-background/80 backdrop-blur rounded-full"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              <ImagePlus size={24} />
              <span className="text-sm">Add an image (optional)</span>
            </button>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />

          <Button onClick={handleSubmit} disabled={submitting || !title.trim()} className="w-full">
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Posting...</> : 'Post'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
