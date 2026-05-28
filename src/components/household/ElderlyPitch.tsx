import React from 'react';
import { MessageCircle } from 'lucide-react';

const WHATSAPP_NUMBER = '353899817111';

const FEATURES = ['Weekly groceries', 'Garden upkeep', 'Friendly check-ins'];

const WA_MESSAGE = encodeURIComponent(
  "Hi VANO! 👋 I'd like to set up regular weekly help for my parent in Galway. I saw the €80/month plan — can you tell me more about how it works and what's included?",
);

export const ElderlyPitch: React.FC = () => {
  return (
    <section className="relative bg-primary px-4 py-20 overflow-hidden">
      {/* grain texture for depth */}
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-lg mx-auto md:max-w-xl lg:max-w-2xl text-center">

        <p className="eyebrow mb-5 text-primary-foreground/60">For families</p>

        {/* Price badge */}
        <div className="inline-flex items-baseline gap-1 bg-white/15 border border-white/20 rounded-full px-5 py-2 mb-6">
          <span className="text-white font-bold text-xl leading-none">€80</span>
          <span className="text-white/65 text-sm font-medium">/month</span>
        </div>

        <h2 className="display-lg text-primary-foreground mb-5">
          Worried about a parent in Galway?
        </h2>

        <p className="text-primary-foreground/75 text-base leading-relaxed mb-7 max-w-sm mx-auto">
          One simple monthly plan. Vetted local students handle the weekly
          tasks so your mam or dad stays comfortable and looked after.
        </p>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 mb-9">
          {FEATURES.map((f) => (
            <span
              key={f}
              className="bg-white/10 border border-white/15 rounded-full px-4 py-1.5 text-sm text-primary-foreground/85 font-medium"
            >
              {f}
            </span>
          ))}
        </div>

        {/* CTA */}
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}?text=${WA_MESSAGE}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 bg-white text-primary rounded-full px-8 py-3.5 font-semibold text-base shadow-lg hover:bg-white/92 active:scale-[0.97] transition-[background-color,transform] duration-150 ease-out"
        >
          <MessageCircle className="w-5 h-5 flex-shrink-0" strokeWidth={1.75} />
          Set up help for a parent
        </a>

        <p className="mt-4 text-primary-foreground/45 text-xs">
          WhatsApp us — we'll tailor a plan that fits
        </p>
      </div>
    </section>
  );
};
