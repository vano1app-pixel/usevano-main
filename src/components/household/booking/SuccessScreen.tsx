import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { BookingData } from './types';
import { Button } from '@/components/ui/button';
import { MessageCircle } from 'lucide-react';

interface SuccessScreenProps {
  data: BookingData;
}

const CATEGORY_LABELS: Record<string, string> = {
  shopping:   '🛒 Shopping run',
  'dog-walk': '🐕 Dog walk',
  garden:     '🌿 Garden work',
  moving:     '📦 Moving help',
  cleaning:   '🧹 Cleaning',
  other:      '✨ General help',
};

function formatDate(date: string): string {
  if (date === 'today') return 'Today';
  if (date === 'tomorrow') return 'Tomorrow';
  try {
    return new Date(date).toLocaleDateString('en-IE', { weekday: 'long', month: 'long', day: 'numeric' });
  } catch {
    return date;
  }
}

export const SuccessScreen: React.FC<SuccessScreenProps> = ({ data }) => {
  const shareText = `Just booked a helper through VANO — super easy! ${encodeURIComponent('vanojobs.com/home')}`;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-16 bg-background">
      {/* Animated SVG checkmark — circle draws, then tick draws, then spring bounce */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 18, stiffness: 220, delay: 0 }}
        className="mb-8"
      >
        <svg width="88" height="88" viewBox="0 0 88 88" fill="none" aria-label="Booking confirmed">
          <motion.circle
            cx="44" cy="44" r="40"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          />
          <motion.path
            d="M26 44 L38 56 L62 30"
            stroke="hsl(var(--primary))"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.4, duration: 0.35, ease: 'easeOut' }}
          />
        </svg>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm text-center"
      >
        <h1 className="text-2xl font-semibold text-foreground mb-2">You're booked!</h1>
        <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
          We'll text you within 30 minutes with your helper's name and photo.
        </p>

        {/* Booking summary */}
        <div className="bg-secondary/40 rounded-2xl p-4 text-left mb-6 space-y-1.5">
          <p className="font-semibold text-foreground text-sm">
            {CATEGORY_LABELS[data.category] ?? data.category}
          </p>
          {data.scheduledDate && (
            <p className="text-sm text-muted-foreground">
              📅 {formatDate(data.scheduledDate)}
              {data.timeSlot ? ` · ${data.timeSlot}` : ''}
            </p>
          )}
          {data.customerAddress && (
            <p className="text-sm text-muted-foreground">📍 {data.customerAddress}</p>
          )}
        </div>

        {/* WhatsApp check-in */}
        <Button
          asChild
          variant="outline"
          className="w-full rounded-full gap-2 mb-3"
        >
          <a
            href={`https://wa.me/353899817111?text=Hi%2C%20I%20just%20booked%20a%20${data.category}%20job!`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} />
            Chat with us on WhatsApp
          </a>
        </Button>

        {/* Referral share */}
        <Button
          asChild
          variant="ghost"
          className="w-full rounded-full text-muted-foreground text-sm"
        >
          <a
            href={`https://wa.me/?text=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Share VANO with a friend 🎉
          </a>
        </Button>

        <Button asChild variant="link" className="mt-4 text-muted-foreground text-xs">
          <Link to="/home">Back to home</Link>
        </Button>
      </motion.div>
    </div>
  );
};
