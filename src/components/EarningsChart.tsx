import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, Euro } from 'lucide-react';
import { format, parseISO, differenceInHours } from 'date-fns';

interface EarningsChartProps {
  applications: any[];
}

export const EarningsChart: React.FC<EarningsChartProps> = ({ applications }) => {
  const { chartData, totalEarnings, totalHours } = useMemo(() => {
    const accepted = applications.filter((a) => a.status === 'accepted' && a.jobs);
    const monthMap: Record<string, { earnings: number; hours: number }> = {};
    let total = 0;
    let hrs = 0;

    accepted.forEach((a) => {
      const job = a.jobs;
      if (!job) return;
      let earned = 0;
      let hours = 0;
      if (job.payment_type === 'fixed' && job.fixed_price != null) {
        earned = Number(job.fixed_price);
      } else if (job.shift_start && job.shift_end) {
        hours = Math.max(1, differenceInHours(
          new Date(`2000-01-01T${job.shift_end}`),
          new Date(`2000-01-01T${job.shift_start}`)
        ));
        earned = hours * job.hourly_rate;
      } else {
        hours = 1;
        earned = Number(job.hourly_rate) || 0;
      }
      const month = format(parseISO(job.shift_date), 'MMM yyyy');

      if (!monthMap[month]) monthMap[month] = { earnings: 0, hours: 0 };
      monthMap[month].earnings += earned;
      monthMap[month].hours += hours;
      total += earned;
      hrs += hours;
    });

    const data = Object.entries(monthMap)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([month, vals]) => ({ month: month.split(' ')[0], ...vals }));

    return { chartData: data, totalEarnings: total, totalHours: hrs };
  }, [applications]);

  if (chartData.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={18} className="text-primary" />
          <h3 className="font-semibold">Earnings Overview</h3>
        </div>
        <p className="text-sm text-muted-foreground">Complete gigs to see your earnings chart here.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl sm:rounded-2xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-primary" />
          <h3 className="font-semibold">Earnings Overview</h3>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            <Euro size={12} className="inline text-primary mr-0.5" />
            <span className="font-bold text-foreground">{totalEarnings.toFixed(0)}</span> total
          </span>
          <span className="text-muted-foreground">
            <span className="font-bold text-foreground">{totalHours}</span>h worked
          </span>
        </div>
      </div>
      <div className="h-52 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${v}`} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '12px',
                fontSize: '13px',
              }}
              formatter={(value: number) => [`€${value.toFixed(0)}`, 'Earnings']}
            />
            <Bar dataKey="earnings" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
