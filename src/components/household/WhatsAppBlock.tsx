import React from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* Soft alternative CTA for people (especially elderly users) who'd rather
   send a text than fill in a form. Kept deliberately low-friction. */
export const WhatsAppBlock: React.FC = () => {
  return (
    <section className="px-4 py-6 max-w-lg mx-auto md:max-w-xl lg:max-w-2xl">
      <div className="bg-sage-light rounded-2xl p-6">
        <p className="font-semibold text-foreground text-base mb-1">
          Prefer to just text us?
        </p>
        <p className="text-muted-foreground text-sm mb-4">
          Send us a WhatsApp and we'll sort it out for you — no app needed.
        </p>
        <Button
          asChild
          className="rounded-full gap-2 font-medium"
          style={{ backgroundColor: '#25D366', color: '#fff' }}
        >
          <a
            href="https://wa.me/353899817111?text=Hi%20VANO%2C%20I%20need%20some%20help%20around%20the%20house!"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="w-4 h-4" />
            Text us on WhatsApp
          </a>
        </Button>
      </div>
    </section>
  );
};
