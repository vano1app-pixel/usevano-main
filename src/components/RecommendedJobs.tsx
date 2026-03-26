import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Star, MapPin, Euro, Calendar, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

interface MatchedJob {
  id: string;
  title: string;
  location: string;
  hourly_rate: number;
  fixed_price?: number | null;
  payment_type?: string | null;
  shift_date: string;
  tags: string[];
  match_score: number;
  match_reason: string;
}

export const RecommendedJobs: React.FC<{ userId: string }> = ({ userId }) => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<MatchedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRecommendations();
  }, [userId]);

  const fetchRecommendations = async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('smart-match-jobs', {
        body: { user_id: userId },
      });
      if (fnError) throw fnError;
      setJobs(data?.matches || []);
    } catch (e: any) {
      setError('Could not load recommendations');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Star size={18} className="text-primary" /> Recommended for You
        </h3>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 size={20} className="animate-spin mr-2" /> Finding your best matches...
        </div>
      </div>
    );
  }

  if (error || jobs.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6">
        <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
          <Star size={18} className="text-primary" /> Recommended for You
        </h3>
        <p className="text-sm text-muted-foreground text-center py-6">
          {error || 'No matching gigs right now. Check back soon!'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
        <Star size={18} className="text-primary" /> Recommended for You
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {jobs.slice(0, 6).map((job, idx) => (
          <motion.div
            key={job.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            onClick={() => navigate(`/jobs/${job.id}`)}
            className="p-4 rounded-xl border border-border/60 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all bg-background/50"
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium text-sm truncate flex-1">{job.title}</h4>
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full ml-2 shrink-0">
                {job.match_score}% match
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin size={10} /> {job.location}</span>
              <span className="flex items-center gap-1">
                <Euro size={10} />
                {job.payment_type === 'fixed' ? `€${job.fixed_price ?? 0} total` : `€${job.hourly_rate}/hr`}
              </span>
            </div>
            {job.shift_date && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Calendar size={10} /> {format(new Date(job.shift_date), 'MMM d, yyyy')}
              </p>
            )}
            <p className="text-[11px] text-primary/70 mt-2 line-clamp-1 italic">{job.match_reason}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
