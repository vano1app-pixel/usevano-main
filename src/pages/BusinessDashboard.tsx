import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Megaphone,
  Monitor,
  Camera,
  ArrowRight,
  Users,
  Star,
  MessageCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { teamWhatsAppHref } from '@/lib/contact';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/* ─── animation variants (same as Landing.tsx) ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};
const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const cardHover = {
  rest: { scale: 1, y: 0 },
  hover: {
    scale: 1.02,
    y: -4,
    transition: { type: 'spring', stiffness: 300, damping: 20 },
  },
};

/* ─── static data ─── */
const SERVICE_CARDS = [
  {
    id: 'social-media',
    label: 'Social Media',
    description: 'Content creation, scheduling & management',
    icon: Megaphone,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    glow: 'group-hover:shadow-pink-500/20',
  },
  {
    id: 'website',
    label: 'Website',
    description: 'Design, build & launch your site',
    icon: Monitor,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    glow: 'group-hover:shadow-blue-500/20',
  },
  {
    id: 'content',
    label: 'Content (Photo/Video)',
    description: 'Professional photo & video production',
    icon: Camera,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    glow: 'group-hover:shadow-amber-500/20',
  },
] as const;

const PRICING_PACKAGES = [
  {
    name: 'Social Media',
    price: '€249',
    period: '/mo',
    features: [
      'Content calendar & strategy',
      '12 posts per month',
      'Community engagement',
      'Monthly performance report',
    ],
  },
  {
    name: 'Website Build',
    price: '€499',
    period: ' one-off',
    popular: true,
    features: [
      'Custom responsive design',
      'Up to 5 pages',
      'SEO setup',
      'Contact form & analytics',
    ],
  },
  {
    name: 'Content Bundle',
    price: '€349',
    period: '/mo',
    features: [
      'Professional photo shoot',
      'Short-form video content',
      'Editing & post-production',
      'Brand-ready deliverables',
    ],
  },
];

const BUDGET_OPTIONS = [
  'Under €250',
  '€250 – €500',
  '€500 – €1,000',
  '€1,000 – €2,500',
  '€2,500+',
];

/* ─── types ─── */
interface RecommendedStudent {
  user_id: string;
  avatar_url: string | null;
  skills: string[] | null;
  hourly_rate: number | null;
  display_name: string | null;
}

/* ─── component ─── */
export default function BusinessDashboard() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [recommended, setRecommended] = useState<RecommendedStudent[]>([]);
  const [loadingTalent, setLoadingTalent] = useState(true);

  // inquiry dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState('');
  const [formName, setFormName] = useState('');
  const [formBusiness, setFormBusiness] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formBudget, setFormBudget] = useState('');
  const [formPhone, setFormPhone] = useState('');

  /* ── load user display name + recommended talent ── */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate('/auth', { replace: true });
        return;
      }

      // profile display name
      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!cancelled && prof) {
        if (prof.user_type !== 'business') {
          navigate('/profile', { replace: true });
          return;
        }
        setDisplayName(prof.display_name ?? '');
      }

      // recommended talent
      const { data: students } = await supabase
        .from('student_profiles')
        .select('user_id, avatar_url, skills, hourly_rate')
        .eq('is_available', true)
        .eq('community_board_status', 'approved')
        .not('skills', 'eq', '{}')
        .limit(6);

      if (!cancelled && students) {
        // fetch display names for each
        const ids = students.map((s) => s.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', ids);

        const nameMap = new Map(
          (profiles ?? []).map((p) => [p.user_id, p.display_name]),
        );

        setRecommended(
          students.map((s) => ({
            ...s,
            display_name: nameMap.get(s.user_id) ?? null,
          })),
        );
      }
      if (!cancelled) setLoadingTalent(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  /* ── open inquiry dialog ── */
  const openInquiry = (serviceLabel: string) => {
    setSelectedService(serviceLabel);
    setFormName('');
    setFormBusiness('');
    setFormDetails('');
    setFormBudget('');
    setFormPhone('');
    setDialogOpen(true);
  };

  /* ── submit inquiry → WhatsApp ── */
  const submitInquiry = () => {
    const lines = [
      `Hi! I'm interested in: ${selectedService}`,
      `Name: ${formName}`,
      `Business: ${formBusiness}`,
      `Details: ${formDetails}`,
      `Budget: ${formBudget}`,
      `Phone/WhatsApp: ${formPhone}`,
    ];
    const text = encodeURIComponent(lines.join('\n'));
    window.open(`${teamWhatsAppHref}?text=${text}`, '_blank');
    setDialogOpen(false);
  };

  const formValid =
    formName.trim() && formBusiness.trim() && formDetails.trim() && formBudget && formPhone.trim();

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-28 md:pb-16">
        <div className="mx-auto max-w-6xl px-4 pt-24 sm:px-6 sm:pt-28 lg:px-8">
          {/* ── Welcome ── */}
          <motion.section
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="mb-10"
          >
            <motion.h1
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="text-3xl font-bold tracking-tight sm:text-4xl"
            >
              {displayName ? `Welcome back, ${displayName}` : 'Welcome back'}
            </motion.h1>
            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.5, delay: 0.05 }}
              className="mt-2 text-lg text-muted-foreground"
            >
              What do you need help with?
            </motion.p>
          </motion.section>

          {/* ── Service cards ── */}
          <motion.section
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="mb-12 grid gap-4 sm:grid-cols-3"
          >
            {SERVICE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <motion.button
                  key={card.id}
                  variants={fadeUp}
                  whileHover="hover"
                  initial="rest"
                  animate="rest"
                  className={`group relative flex flex-col items-start gap-3 rounded-2xl border border-foreground/10 bg-card p-6 text-left shadow-sm transition-shadow duration-200 ${card.glow} hover:shadow-md`}
                  onClick={() => openInquiry(card.label)}
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.bg}`}
                  >
                    <Icon className={`h-6 w-6 ${card.color}`} />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{card.label}</h3>
                    <p className="text-sm text-muted-foreground">
                      {card.description}
                    </p>
                  </div>
                  <ArrowRight className="absolute right-5 top-6 h-5 w-5 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary" />
                </motion.button>
              );
            })}
          </motion.section>

          {/* ── Browse talent CTA ── */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-14 flex items-center gap-4"
          >
            <Button
              size="lg"
              className="rounded-xl shadow-md shadow-primary/20"
              onClick={() => navigate('/students')}
            >
              <Users className="mr-2 h-5 w-5" />
              Browse talent
            </Button>
            <span className="text-sm text-muted-foreground">
              Find the perfect freelancer for your project
            </span>
          </motion.div>

          {/* ── Recommended for you ── */}
          <motion.section
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="mb-14"
          >
            <motion.h2
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="mb-5 text-xl font-semibold"
            >
              Recommended for you
            </motion.h2>

            {loadingTalent ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 animate-pulse rounded-2xl bg-muted/60"
                  />
                ))}
              </div>
            ) : recommended.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recommended freelancers yet — check back soon!
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommended.map((s) => (
                  <motion.div key={s.user_id} variants={fadeUp}>
                    <Link
                      to={`/students/${s.user_id}`}
                      className="group flex items-center gap-4 rounded-2xl border border-foreground/10 bg-card p-4 shadow-sm transition-all duration-200 hover:shadow-md"
                    >
                      <Avatar className="h-12 w-12 border border-border">
                        <AvatarImage src={s.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {(s.display_name ?? '?')[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium group-hover:text-primary transition-colors">
                          {s.display_name ?? 'Freelancer'}
                        </p>
                        {s.skills?.[0] && (
                          <Badge
                            variant="secondary"
                            className="mt-1 text-xs"
                          >
                            {s.skills[0]}
                          </Badge>
                        )}
                      </div>
                      {s.hourly_rate != null && (
                        <span className="shrink-0 text-sm font-semibold text-primary">
                          €{s.hourly_rate}/hr
                        </span>
                      )}
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.section>

          {/* ── Pricing packages ── */}
          <motion.section
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="mb-8"
          >
            <motion.h2
              variants={fadeUp}
              transition={{ duration: 0.5 }}
              className="mb-5 text-xl font-semibold"
            >
              Our packages
            </motion.h2>

            <div className="grid gap-5 sm:grid-cols-3">
              {PRICING_PACKAGES.map((pkg) => (
                <motion.div
                  key={pkg.name}
                  variants={fadeUp}
                  whileHover="hover"
                  initial="rest"
                  animate="rest"
                  className={`relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-shadow duration-200 hover:shadow-md ${
                    pkg.popular
                      ? 'border-primary/40 ring-1 ring-primary/20'
                      : 'border-foreground/10'
                  }`}
                >
                  {pkg.popular && (
                    <span className="absolute -top-3 left-5 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground">
                      Popular
                    </span>
                  )}
                  <h3 className="text-lg font-semibold">{pkg.name}</h3>
                  <p className="mt-2 mb-4">
                    <span className="text-3xl font-bold tracking-tight">
                      {pkg.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {pkg.period}
                    </span>
                  </p>
                  <ul className="mb-6 flex-1 space-y-2">
                    {pkg.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`${teamWhatsAppHref}?text=${encodeURIComponent(`Hi! I'm interested in the ${pkg.name} package (${pkg.price}${pkg.period}).`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-[#20bd5a] hover:shadow-md active:scale-[0.97]"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Chat on WhatsApp
                  </a>
                </motion.div>
              ))}
            </div>
          </motion.section>
        </div>
      </main>

      {/* ── Inquiry dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Get a quote — {selectedService}</DialogTitle>
            <DialogDescription>
              Fill in the details below and we&apos;ll get back to you on
              WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div>
              <Label htmlFor="inq-name">Your name</Label>
              <Input
                id="inq-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label htmlFor="inq-biz">Business name</Label>
              <Input
                id="inq-biz"
                value={formBusiness}
                onChange={(e) => setFormBusiness(e.target.value)}
                placeholder="Acme Ltd"
              />
            </div>
            <div>
              <Label htmlFor="inq-details">What do you need?</Label>
              <Textarea
                id="inq-details"
                value={formDetails}
                onChange={(e) => setFormDetails(e.target.value)}
                placeholder="Describe your project or what you're looking for…"
                rows={3}
              />
            </div>
            <div>
              <Label>Budget range</Label>
              <Select value={formBudget} onValueChange={setFormBudget}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a range" />
                </SelectTrigger>
                <SelectContent>
                  {BUDGET_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="inq-phone">WhatsApp / Phone number</Label>
              <Input
                id="inq-phone"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+353 89 …"
              />
            </div>

            <Button
              className="w-full rounded-xl"
              size="lg"
              disabled={!formValid}
              onClick={submitInquiry}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Send via WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
