import React, { useRef, useState, useEffect } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ImagePlus } from 'lucide-react';

interface BannerUploadProps {
  userId: string;
  currentUrl?: string;
  onUploaded: (url: string) => void;
}

export const BannerUpload: React.FC<BannerUploadProps> = ({ userId, currentUrl, onUploaded }) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentUrl || '');

  useEffect(() => {
    setPreview(currentUrl || '');
  }, [currentUrl]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 4MB for banner', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${userId}/banner.${ext}`;

    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
    if (error) {
      toast({ title: 'Upload failed', description: getUserFriendlyError(error), variant: 'destructive' });
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    const url = `${publicUrl}?t=${Date.now()}`;
    setPreview(url);

    await supabase.from('student_profiles').update({ banner_url: url }).eq('user_id', userId);
    onUploaded(url);
    toast({ title: 'Banner updated!' });
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Profile banner</label>
      <p className="text-xs text-muted-foreground">
        Wide image for the top of your public profile — like a LinkedIn or Foxpop-style cover (max 4MB).
      </p>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="relative flex h-28 w-full max-w-xl overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/40 transition-colors hover:border-primary/40 hover:bg-muted/60"
      >
        {preview ? (
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <ImagePlus size={22} strokeWidth={1.75} />
            <span className="text-xs font-medium">Upload banner</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  );
};
