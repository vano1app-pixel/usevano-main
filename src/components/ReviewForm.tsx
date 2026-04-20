import React, { useState, useRef } from 'react';
import { getUserFriendlyError } from '@/lib/errorMessages';
import { Star, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ReviewFormProps {
  jobId: string;
  revieweeId: string;
  reviewerId: string;
  onReviewSubmitted: () => void;
}

export const ReviewForm: React.FC<ReviewFormProps> = ({ jobId, revieweeId, reviewerId, onReviewSubmitted }) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    if (photos.length + files.length > 4) {
      toast({ title: 'Max 4 photos', variant: 'destructive' });
      return;
    }
    setUploading(true);
    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: 'File too large (max 5MB)', variant: 'destructive' });
        continue;
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.type)) {
        toast({ title: 'Invalid file type', description: 'Upload JPEG, PNG, WebP, or GIF.', variant: 'destructive' });
        continue;
      }
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${reviewerId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('review-photos').upload(path, file);
      if (error) continue;
      const { data: { publicUrl } } = supabase.storage.from('review-photos').getPublicUrl(path);
      setPhotos((prev) => [...prev, publicUrl]);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (rating === 0) { toast({ title: 'Please select a rating', variant: 'destructive' }); return; }
    setSubmitting(true);
    const { error } = await supabase.from('reviews').insert({
      job_id: jobId,
      reviewer_id: reviewerId,
      reviewee_id: revieweeId,
      rating,
      comment,
      photos,
    });
    if (error) {
      toast({ title: 'Error', description: getUserFriendlyError(error), variant: 'destructive' });
    } else {
      toast({ title: 'Review submitted!' });
      onReviewSubmitted();
    }
    setSubmitting(false);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-3">Leave a Review</h3>
      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoverRating(star)}
            onMouseLeave={() => setHoverRating(0)}
            className="transition-colors"
          >
            <Star
              size={24}
              className={`${(hoverRating || rating) >= star ? 'fill-primary text-primary' : 'text-muted-foreground/30'} transition-colors`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your experience (optional)..."
        className="w-full border border-input rounded-xl p-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring mb-3 min-h-[60px] resize-none"
      />

      {/* Photo upload */}
      <div className="mb-3">
        {photos.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {photos.map((url, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
                <img src={url} alt={`Review photo ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  aria-label={`Remove review photo ${i + 1}`}
                  className="absolute top-0.5 right-0.5 p-0.5 bg-background/80 rounded-full"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length < 4 && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            {uploading ? (
              <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            Add photos (optional, max 4)
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || rating === 0}
        className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit Review'}
      </button>
    </div>
  );
};
