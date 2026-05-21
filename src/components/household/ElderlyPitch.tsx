import React from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

/* This section targets adult children in Dublin/abroad who want to organise
   regular help for elderly parents still living in Galway. Full-width sage
   green so it visually pops — acts as a visual anchor at the bottom of the
   page before the footer. */
export const ElderlyPitch: React.FC = () => {
  return (
    <section className="bg-primary px-4 py-16">
      <div className="max-w-lg mx-auto md:max-w-xl lg:max-w-2xl text-center">
        <p className="eyebrow mb-4 text-primary-foreground/70">For families</p>
        <h2 className="display-lg text-primary-foreground mb-4">
          Worried about a parent in Galway?
        </h2>
        <p className="text-primary-foreground/80 text-base leading-relaxed mb-8 max-w-md mx-auto">
          Set up weekly help for your mam or dad. Grocery runs, garden upkeep,
          a friendly face checking in — all from one easy booking.
        </p>
        <Button
          asChild
          variant="outline"
          size="lg"
          className="rounded-full border-white/70 text-white bg-transparent hover:bg-white hover:text-primary font-medium px-8 transition-colors duration-200"
        >
          <Link to="/auth">Set up help for a parent</Link>
        </Button>
      </div>
    </section>
  );
};
