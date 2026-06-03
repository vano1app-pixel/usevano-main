import React from 'react';
import { MessageCircle, ArrowRight } from 'lucide-react';
import { teamWhatsAppHref } from '@/lib/contact';

const WA_TEXT =
  "Hi VANO! 👋 I'm worried about a parent and I'd love some regular help for them — groceries, garden, errands, check-ins. Can you tell me how it works?";

export const ElderlyPitch: React.FC = () => {
  return (
    <section className="relative bg-primary px-4 py-12 overflow-hidden">
      <div className="grain pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative max-w-lg mx-auto text-center">
        <p className="eyebrow mb-3 text-primary-foreground/70">For families &amp; businesses</p>
        <h2 className="display-lg text-primary-foreground mb-3">
          Worried about a parent near you?
        </h2>
        <p className="text-primary-foreground/80 text-base max-w-sm mx-auto leading-relaxed mb-8">
          Verified students handle the weekly tasks — groceries, garden, errands, a friendly check-in. Message us and we'll set something up.
        </p>

        <a
          href={`${teamWhatsAppHref}?text=${encodeURIComponent(WA_TEXT)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex items-center gap-2.5 bg-white text-foreground font-bold rounded-full px-7 py-4 text-base shadow-lg hover:-translate-y-px hover:shadow-xl transition-all duration-150 active:scale-[0.97]"
        >
          <MessageCircle className="w-5 h-5 flex-shrink-0 text-[#25D366]" strokeWidth={2} />
          Chat to us on WhatsApp
          <ArrowRight className="w-4 h-4 flex-shrink-0 opacity-50 group-hover:translate-x-0.5 transition-transform" />
        </a>

        <p className="text-primary-foreground/50 text-xs mt-4">No app, no login — just WhatsApp</p>
      </div>
    </section>
  );
};
