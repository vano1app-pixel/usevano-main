import { describe, it, expect } from 'vitest';
import { formatJobScheduleLine, formatJobScheduleDetail } from '../jobSchedule';

// Both helpers are render-only formatters — pure function of the job
// row. They drive what a hirer sees on /jobs/:id and on the gig cards
// in Messages + BusinessDashboard. A fixed-payment gig has no start /
// end times and reads as a deadline; an hourly gig has times and reads
// as a scheduled block. Getting this wrong surfaces as wrong copy on
// every gig listing, so worth anchoring.

describe('formatJobScheduleLine', () => {
  it('formats an hourly gig with times as weekday + date + HH:MM window', () => {
    const out = formatJobScheduleLine({
      payment_type: 'hourly',
      shift_date: '2026-06-12',
      shift_start: '09:00:00',
      shift_end: '17:30:00',
    });
    // We don't lock the exact date-fns format in case of locale drift,
    // but we verify the shape: a three-letter weekday, the month + day,
    // and both times at HH:MM.
    expect(out).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2} · 09:00 – 17:30$/);
  });

  it('formats a fixed-payment gig as "Due by MMM d, yyyy"', () => {
    const out = formatJobScheduleLine({
      payment_type: 'fixed',
      shift_date: '2026-06-12',
      shift_start: '09:00:00',
      shift_end: '17:30:00',
    });
    expect(out).toMatch(/^Due by [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });

  it('treats missing times as a deadline regardless of payment_type', () => {
    const out = formatJobScheduleLine({
      payment_type: 'hourly',
      shift_date: '2026-06-12',
      shift_start: null,
      shift_end: null,
    });
    expect(out).toMatch(/^Due by [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  });

  it('trims trailing seconds from the times', () => {
    const out = formatJobScheduleLine({
      payment_type: 'hourly',
      shift_date: '2026-06-12',
      shift_start: '09:05:42',
      shift_end: '10:15:30',
    });
    expect(out).toContain('09:05 – 10:15');
    expect(out).not.toContain(':42');
    expect(out).not.toContain(':30');
  });
});

describe('formatJobScheduleDetail', () => {
  it('formats an hourly gig as full weekday + date + HH:MM window', () => {
    const out = formatJobScheduleDetail({
      payment_type: 'hourly',
      shift_date: '2026-06-12',
      shift_start: '09:00:00',
      shift_end: '17:30:00',
    });
    // Full weekday (not abbreviated) + month + day.
    expect(out).toMatch(/^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2} · 09:00 – 17:30$/);
  });

  it('formats a fixed-payment gig as "Complete by <weekday>, MMM d, yyyy"', () => {
    const out = formatJobScheduleDetail({
      payment_type: 'fixed',
      shift_date: '2026-06-12',
      shift_start: null,
      shift_end: null,
    });
    expect(out).toMatch(/^Complete by [A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });

  it('falls back to deadline copy when times are empty strings (not null)', () => {
    const out = formatJobScheduleDetail({
      payment_type: 'hourly',
      shift_date: '2026-06-12',
      shift_start: '',
      shift_end: '',
    });
    expect(out).toMatch(/^Complete by /);
  });
});
