import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Brain, Loader2, Lightbulb } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AIProfileCoachProps {
  bio: string;
  skills: string[];
  hourlyRate: string;
  university: string;
  hasPortfolio: boolean;
  reviewCount: number;
}

export const AIProfileCoach: React.FC<AIProfileCoachProps> = ({
  bio, skills, hourlyRate, university, hasPortfolio, reviewCount,
}) => {
  const { toast } = useToast();
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const getTips = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-profile-coach', {
        body: { bio, skills, hourlyRate: parseFloat(hourlyRate) || 0, university, hasPortfolio, reviewCount },
      });
      if (error) throw error;
      setTips(data?.tips || []);
      setFetched(true);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || 'Failed to get tips', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Brain size={16} className="text-primary" /> AI Profile Coach
        </h3>
        {!fetched && (
          <button
            onClick={getTips}
            disabled={loading}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
            {loading ? 'Analyzing...' : 'Get AI Tips'}
          </button>
        )}
      </div>
      {!fetched && !loading && (
        <p className="text-xs text-muted-foreground">Get personalized tips to make your profile stand out to businesses.</p>
      )}
      {tips.length > 0 && (
        <ul className="space-y-2.5">
          {tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="text-primary mt-0.5 shrink-0">💡</span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
