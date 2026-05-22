import React, { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import type { BookingData, StepProps } from '@/components/household/booking/types';
import { BookingProgress } from '@/components/household/booking/BookingProgress';
import { WhenStep } from '@/components/household/booking/WhenStep';
import { ConfirmStep } from '@/components/household/booking/ConfirmStep';
import { SuccessScreen } from '@/components/household/booking/SuccessScreen';

import {
  ShoppingStoreStep,
  ShoppingListStep,
} from '@/components/household/booking/steps/ShoppingSteps';
import {
  DogCountStep,
  DogDurationStep,
  DogNotesStep,
} from '@/components/household/booking/steps/DogWalkSteps';
import {
  GardenTasksStep,
  GardenPhotoStep,
  GardenDurationStep,
} from '@/components/household/booking/steps/GardenSteps';
import {
  MovingHelpersStep,
  MovingAddressStep,
  MovingDescriptionStep,
  MovingDurationStep,
} from '@/components/household/booking/steps/MovingSteps';
import {
  CleaningTasksStep,
  CleaningDurationStep,
} from '@/components/household/booking/steps/CleaningSteps';
import {
  OtherDescriptionStep,
  OtherPricingStep,
} from '@/components/household/booking/steps/OtherSteps';

interface StepConfig {
  title: string;
  component: React.ComponentType<StepProps>;
}

/* Assembles the full ordered step sequence for each booking category.
   WhenStep and ConfirmStep are shared and appear in category-specific
   positions (e.g. Garden needs a duration step AFTER when). */
function buildSteps(category: string): StepConfig[] {
  switch (category) {
    case 'shopping':
      return [
        { title: 'Which store?',          component: ShoppingStoreStep },
        { title: 'Your shopping list',    component: ShoppingListStep  },
        { title: 'When?',                 component: WhenStep          },
        { title: 'Confirm booking',       component: ConfirmStep       },
      ];
    case 'dog-walk':
      return [
        { title: 'How many dogs?',        component: DogCountStep      },
        { title: 'How long?',             component: DogDurationStep   },
        { title: 'Any notes?',            component: DogNotesStep      },
        { title: 'When?',                 component: WhenStep          },
        { title: 'Confirm booking',       component: ConfirmStep       },
      ];
    case 'garden':
      return [
        { title: 'What needs doing?',     component: GardenTasksStep   },
        { title: 'Add a photo',           component: GardenPhotoStep   },
        { title: 'When?',                 component: WhenStep          },
        { title: 'How long?',             component: GardenDurationStep },
        { title: 'Confirm booking',       component: ConfirmStep       },
      ];
    case 'moving':
      return [
        { title: 'How many helpers?',     component: MovingHelpersStep     },
        { title: 'Addresses',             component: MovingAddressStep     },
        { title: "What's being moved?",   component: MovingDescriptionStep },
        { title: 'When?',                 component: WhenStep              },
        { title: 'How long?',             component: MovingDurationStep    },
        { title: 'Confirm booking',       component: ConfirmStep           },
      ];
    case 'cleaning':
      return [
        { title: 'What needs cleaning?',  component: CleaningTasksStep     },
        { title: 'When?',                 component: WhenStep              },
        { title: 'How long?',             component: CleaningDurationStep  },
        { title: 'Confirm booking',       component: ConfirmStep           },
      ];
    default: // 'other' and any unknown slug
      return [
        { title: 'Tell us what you need', component: OtherDescriptionStep },
        { title: 'When?',                 component: WhenStep              },
        { title: 'Pricing',               component: OtherPricingStep      },
        { title: 'Confirm booking',       component: ConfirmStep           },
      ];
  }
}

/* Slide variants: entering step comes from the right on forward nav,
   from the left on back nav. exit mirrors the direction. */
const stepVariants = {
  initial: (dir: number) => ({
    x: dir > 0 ? '55%' : '-55%',
    opacity: 0,
  }),
  animate: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: (dir: number) => ({
    x: dir > 0 ? '-55%' : '55%',
    opacity: 0,
    transition: { duration: 0.2, ease: [0.77, 0, 0.175, 1] as const },
  }),
};

const BookingFlow: React.FC = () => {
  const { category = 'other' } = useParams<{ category: string }>();
  const navigate = useNavigate();

  const allSteps = useMemo(() => buildSteps(category), [category]);

  const [step, setStep] = useState(0);
  const [data, setData] = useState<BookingData>({ category });
  const [showSuccess, setShowSuccess] = useState(false);
  const direction = useRef(1);

  const handleChange = (updates: Partial<BookingData>) => {
    setData((d) => ({ ...d, ...updates }));
  };

  const handleNext = () => {
    if (step >= allSteps.length - 1) {
      setShowSuccess(true);
      return;
    }
    direction.current = 1;
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step === 0) {
      navigate('/home');
      return;
    }
    direction.current = -1;
    setStep((s) => s - 1);
  };

  if (showSuccess) {
    return <SuccessScreen data={data} />;
  }

  const CurrentStep = allSteps[step].component;

  return (
    // -mt-14 corrects the App.tsx global md:pt-14 offset; this page owns its own header
    <div className="min-h-dvh bg-background -mt-14 lg:-mt-16 flex flex-col">
      <BookingProgress
        current={step + 1}
        total={allSteps.length}
        onBack={handleBack}
      />

      {/* overflow-hidden prevents the sliding step from briefly widening the viewport */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction.current}>
          <motion.div
            key={step}
            custom={direction.current}
            variants={stepVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full"
          >
            <CurrentStep
              data={data}
              onChange={handleChange}
              onNext={handleNext}
              onBack={handleBack}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default BookingFlow;
