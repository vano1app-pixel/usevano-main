import React from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { Clock, CheckCircle, Briefcase, CreditCard, ArrowRight } from 'lucide-react';

interface TrackerApplication {
  id: string;
  job_id: string;
  status: string;
  business_confirmed: boolean;
  student_confirmed: boolean;
  payment_confirmed: boolean;
  applied_at: string;
  jobs?: {
    title: string;
    location: string;
    hourly_rate: number;
    fixed_price?: number | null;
    payment_type?: string | null;
    shift_date: string;
    status: string;
  };
}

interface ApplicationTrackerProps {
  applications: TrackerApplication[];
}

type Stage = 'applied' | 'accepted' | 'in_progress' | 'completed' | 'paid';

const stageConfig: Record<Stage, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  applied: { label: 'Applied', icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted/50' },
  accepted: { label: 'Accepted', icon: CheckCircle, color: 'text-primary', bgColor: 'bg-primary/5' },
  in_progress: { label: 'In Progress', icon: Briefcase, color: 'text-amber-600', bgColor: 'bg-amber-50' },
  completed: { label: 'Completed', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
  paid: { label: 'Paid', icon: CreditCard, color: 'text-primary', bgColor: 'bg-primary/10' },
};

const stages: Stage[] = ['applied', 'accepted', 'in_progress', 'completed', 'paid'];

function getStage(app: TrackerApplication): Stage {
  if (app.payment_confirmed) return 'paid';
  if (app.jobs?.status === 'completed') return 'completed';
  if (app.status === 'accepted' && app.business_confirmed && app.student_confirmed) return 'in_progress';
  if (app.status === 'accepted') return 'accepted';
  return 'applied';
}

export const ApplicationTracker: React.FC<ApplicationTrackerProps> = ({ applications }) => {
  const navigate = useNavigate();

  const grouped = stages.reduce((acc, stage) => {
    acc[stage] = applications
      .filter((a) => a.status !== 'rejected' && getStage(a) === stage)
      .sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime());
    return acc;
  }, {} as Record<Stage, TrackerApplication[]>);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
      <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
        <Briefcase size={18} className="text-primary" /> Application Tracker
      </h3>

      {/* Stage progress bar */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
        {stages.map((stage, i) => {
          const config = stageConfig[stage];
          const count = grouped[stage].length;
          return (
            <React.Fragment key={stage}>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${config.bgColor} ${config.color}`}>
                <config.icon size={12} />
                {config.label} ({count})
              </div>
              {i < stages.length - 1 && <ArrowRight size={12} className="text-muted-foreground/40 shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {stages.map((stage) => {
          const config = stageConfig[stage];
          return (
            <div key={stage} className="min-w-0">
              <div className={`text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5 ${config.color}`}>
                <config.icon size={12} /> {config.label}
              </div>
              <div className="space-y-2">
                {grouped[stage].length === 0 ? (
                  <p className="text-xs text-muted-foreground/50 py-4 text-center">—</p>
                ) : (
                  grouped[stage].map((app, idx) => (
                    <motion.div
                      key={app.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => navigate(`/jobs/${app.job_id}`)}
                      className={`p-3 rounded-xl border border-border/60 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all ${config.bgColor}`}
                    >
                      <p className="text-sm font-medium truncate">{app.jobs?.title || 'Job'}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{app.jobs?.location}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          {app.jobs?.shift_date ? format(new Date(app.jobs.shift_date), 'MMM d') : ''}
                        </span>
                        <span className="text-[11px] font-semibold text-foreground">
                          {app.jobs?.payment_type === 'fixed'
                            ? `€${app.jobs?.fixed_price ?? 0}`
                            : `€${app.jobs?.hourly_rate}/hr`}
                        </span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
