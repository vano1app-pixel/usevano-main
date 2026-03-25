import { format } from 'date-fns';

interface JobLike {
  payment_type?: string | null;
  shift_date: string;
  shift_start?: string | null;
  shift_end?: string | null;
}

export function formatJobScheduleLine(job: JobLike): string {
  const date = new Date(job.shift_date);
  const dateShort = format(date, 'MMM d, yyyy');
  const isFixed = job.payment_type === 'fixed';
  const hasTimes =
    typeof job.shift_start === 'string' &&
    job.shift_start.length > 0 &&
    typeof job.shift_end === 'string' &&
    job.shift_end.length > 0;

  if (isFixed || !hasTimes) {
    return `Due by ${dateShort}`;
  }

  return `${format(date, 'EEE, MMM d')} · ${job.shift_start!.slice(0, 5)} – ${job.shift_end!.slice(0, 5)}`;
}

export function formatJobScheduleDetail(job: JobLike): string {
  const date = new Date(job.shift_date);
  const isFixed = job.payment_type === 'fixed';
  const hasTimes =
    typeof job.shift_start === 'string' &&
    job.shift_start.length > 0 &&
    typeof job.shift_end === 'string' &&
    job.shift_end.length > 0;

  if (isFixed || !hasTimes) {
    return `Complete by ${format(date, 'EEEE, MMM d, yyyy')}`;
  }

  return `${format(date, 'EEEE, MMM d')} · ${job.shift_start!.slice(0, 5)} – ${job.shift_end!.slice(0, 5)}`;
}
