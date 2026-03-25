import React from 'react';
import { Star } from 'lucide-react';
import { format } from 'date-fns';

interface Review {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  reviewerName?: string;
  photos?: string[];
}

export const ReviewList: React.FC<{ reviews: Review[] }> = ({ reviews }) => {
  if (reviews.length === 0) return null;

  const avgRating = (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold">Reviews</h3>
        <div className="flex items-center gap-1">
          <Star size={14} className="fill-primary text-primary" />
          <span className="text-sm font-medium">{avgRating}</span>
          <span className="text-xs text-muted-foreground">({reviews.length})</span>
        </div>
      </div>
      <div className="space-y-3">
        {reviews.map((review) => (
          <div key={review.id} className="bg-secondary/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} size={12} className={`${review.rating >= star ? 'fill-primary text-primary' : 'text-muted-foreground/30'}`} />
                  ))}
                </div>
                <span className="text-xs font-medium text-foreground">{review.reviewerName || 'Anonymous'}</span>
              </div>
              <span className="text-xs text-muted-foreground">{format(new Date(review.created_at), 'MMM d, yyyy')}</span>
            </div>
            {review.comment && <p className="text-sm text-muted-foreground">{review.comment}</p>}
            {review.photos && review.photos.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {review.photos.map((url, i) => (
                  <img key={i} src={url} alt="" className="w-20 h-20 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(url, '_blank')} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
