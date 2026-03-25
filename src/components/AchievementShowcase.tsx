import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Zap, Star, Target, Trophy, Users, Flame, Crown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Achievement {
  id: string;
  badge_key: string;
  badge_label: string;
  earned_at: string;
}

interface AchievementShowcaseProps {
  userId: string;
  triggerCheck?: boolean;
}

const badgeIcons: Record<string, React.ElementType> = {
  first_shift: Zap,
  five_shifts: Target,
  ten_shifts: Trophy,
  twenty_shifts: Crown,
  fifty_shifts: Flame,
  five_star: Star,
  reliable: Award,
  first_review: Users,
  five_star_streak: Star,
  top_earner: Trophy,
  quick_responder: Zap,
  community_star: Users,
};

const badgeColors: Record<string, string> = {
  first_shift: 'from-blue-400 to-blue-600',
  five_shifts: 'from-emerald-400 to-emerald-600',
  ten_shifts: 'from-purple-400 to-purple-600',
  twenty_shifts: 'from-amber-400 to-amber-600',
  fifty_shifts: 'from-red-400 to-red-600',
  five_star: 'from-yellow-400 to-yellow-600',
  reliable: 'from-teal-400 to-teal-600',
  first_review: 'from-indigo-400 to-indigo-600',
  five_star_streak: 'from-orange-400 to-orange-600',
  top_earner: 'from-emerald-500 to-emerald-700',
  quick_responder: 'from-cyan-400 to-cyan-600',
  community_star: 'from-pink-400 to-pink-600',
};

export const AchievementShowcase: React.FC<AchievementShowcaseProps> = ({ userId, triggerCheck = false }) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadAchievements();
  }, [userId]);

  useEffect(() => {
    if (triggerCheck) checkAchievements();
  }, [triggerCheck]);

  const loadAchievements = async () => {
    const { data } = await supabase
      .from('student_achievements')
      .select('*')
      .eq('user_id', userId)
      .order('earned_at', { ascending: true });
    setAchievements(data || []);
  };

  const checkAchievements = async () => {
    const before = achievements.map((a) => a.badge_key);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== userId) return;

    try {
      await supabase.functions.invoke('check-achievements', {
        body: { user_id: userId },
      });
      const { data } = await supabase
        .from('student_achievements')
        .select('*')
        .eq('user_id', userId)
        .order('earned_at', { ascending: true });

      const after = (data || []).map((a) => a.badge_key);
      const newOnes = after.filter((k) => !before.includes(k));
      if (newOnes.length > 0) {
        setNewBadges(newOnes);
        const labels = (data || []).filter((a) => newOnes.includes(a.badge_key)).map((a) => a.badge_label);
        toast({ title: '🏆 New Badge Earned!', description: labels.join(', ') });
      }
      setAchievements(data || []);
    } catch (e) {
      // silently fail
    }
  };

  if (achievements.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
        <Trophy size={18} className="text-primary" /> Achievements
      </h3>
      <div className="flex flex-wrap gap-3">
        <AnimatePresence>
          {achievements.map((ach) => {
            const Icon = badgeIcons[ach.badge_key] || Award;
            const gradient = badgeColors[ach.badge_key] || 'from-gray-400 to-gray-600';
            const isNew = newBadges.includes(ach.badge_key);

            return (
              <motion.div
                key={ach.id}
                initial={isNew ? { scale: 0, rotate: -180 } : { scale: 1 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={isNew ? { type: 'spring', stiffness: 200, damping: 15 } : {}}
                className="relative group"
              >
                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                  {isNew && (
                    <motion.div
                      className="absolute inset-0 rounded-2xl bg-white/30"
                      animate={{ opacity: [0.5, 0, 0.5] }}
                      transition={{ duration: 1.5, repeat: 3 }}
                    />
                  )}
                  <Icon size={24} className="text-white drop-shadow-sm" />
                </div>
                <p className="text-[10px] sm:text-xs text-center mt-1.5 font-medium text-muted-foreground max-w-[4rem] sm:max-w-[5rem] truncate">
                  {ach.badge_label}
                </p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};
