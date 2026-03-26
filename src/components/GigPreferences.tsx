import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { TagBadge } from '@/components/TagBadge';
import { Bell, Euro, Briefcase } from 'lucide-react';

import { FREELANCER_SKILL_OPTIONS } from '@/lib/freelancerSkills';

const PREF_TAGS = [...FREELANCER_SKILL_OPTIONS];

interface GigPreferencesProps {
  userId: string;
}

export const GigPreferences: React.FC<GigPreferencesProps> = ({ userId }) => {
  const { toast } = useToast();
  const [tags, setTags] = useState<string[]>([]);
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [workType, setWorkType] = useState('any');
  const [notifyInstant, setNotifyInstant] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadPreferences();
  }, [userId]);

  const loadPreferences = async () => {
    const { data } = await supabase.from('freelancer_preferences').select('*').eq('user_id', userId).maybeSingle();
    if (data) {
      setTags((data as any).preferred_tags || []);
      setMinBudget((data as any).min_budget?.toString() || '');
      setMaxBudget((data as any).max_budget?.toString() || '');
      setWorkType((data as any).preferred_work_type || 'any');
      setNotifyInstant((data as any).notify_instant ?? true);
    }
    setLoaded(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const prefs = {
      user_id: userId,
      preferred_tags: tags,
      min_budget: parseFloat(minBudget) || 0,
      max_budget: parseFloat(maxBudget) || 0,
      preferred_work_type: workType,
      notify_instant: notifyInstant,
    };

    const { data: existing } = await supabase.from('freelancer_preferences').select('id').eq('user_id', userId).maybeSingle();
    if (existing) {
      await supabase.from('freelancer_preferences').update(prefs).eq('user_id', userId);
    } else {
      await supabase.from('freelancer_preferences').insert(prefs);
    }
    toast({ title: 'Preferences saved!' });
    setSaving(false);
  };

  if (!loaded) return null;

  const inputClass = "w-full border border-input rounded-xl px-4 py-3 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="bg-card border border-border rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Bell size={18} className="text-primary" />
        <h2 className="text-lg font-semibold">Gig Alert Preferences</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-3">Get notified when gigs matching your preferences are posted.</p>

      {/* Preferred tags */}
      <div>
        <label className="block text-sm font-medium mb-2">Preferred Gig Types</label>
        <div className="flex flex-wrap gap-2">
          {PREF_TAGS.map((tag) => (
            <TagBadge
              key={tag}
              tag={tag}
              selected={tags.includes(tag)}
              onClick={() => setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
            />
          ))}
        </div>
      </div>

      {/* Budget range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
            <Euro size={14} className="text-primary" /> Min Rate (€/hr)
          </label>
          <input type="number" value={minBudget} onChange={(e) => setMinBudget(e.target.value)} className={inputClass} placeholder="0" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
            <Euro size={14} className="text-primary" /> Max Rate (€/hr)
          </label>
          <input type="number" value={maxBudget} onChange={(e) => setMaxBudget(e.target.value)} className={inputClass} placeholder="100" />
        </div>
      </div>

      {/* Work type */}
      <div>
        <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
          <Briefcase size={14} className="text-primary" /> Work Type
        </label>
        <select value={workType} onChange={(e) => setWorkType(e.target.value)} className={inputClass}>
          <option value="any">Any</option>
          <option value="remote">Remote Only</option>
          <option value="on-site">On-site Only</option>
        </select>
      </div>

      {/* Instant notify toggle */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-secondary/30">
        <div>
          <p className="text-sm font-medium">Instant Notifications</p>
          <p className="text-xs text-muted-foreground">Get notified immediately when matching gigs are posted</p>
        </div>
        <button
          type="button"
          onClick={() => setNotifyInstant(!notifyInstant)}
          className={`w-12 h-6 rounded-full transition-colors relative ${notifyInstant ? 'bg-primary' : 'bg-muted'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifyInstant ? 'left-6' : 'left-0.5'}`} />
        </button>
      </div>

      <button onClick={handleSave} disabled={saving} className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
};
