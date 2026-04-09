import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Megaphone,
  Monitor,
  Camera,
  ArrowRight,
  Users,
  Check,
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

/* ─── custom easing (Emil Kowalski style) ─── */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: EASE_OUT },
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

/* ─── static data ─── */
const SERVICE_CARDS = [
  {
    id: 'social-media',
    label: 'Social Media',
    detail: 'Strategy, content creation, scheduling & community management',
    icon: Megaphone,
    accent: 'from-rose-500/10 to-orange-400/5',
    iconColor: 'text-rose-500',
    iconBg: 'bg-rose-500/10',
    span: 'sm:col-span-2', // wider — asymmetric
  },
  {
    id: 'website',
    label: 'Website',
    detail: 'Design, develop & launch a site that converts',
    icon: Monitor,
    accent: 'from-blue-500/10 to-indigo-400/5',
    iconColor: 'text-blue-500',
    iconBg: 'bg-blue-500/10',
    span: '',
  },
  {
    id: 'content',
    label: 'Content',
    detail: 'Professional photo & video production for your brand',
    icon: Camera,
    accent: 'from-amber-500/10 to-yellow-400/5',
    iconColor: 'text-amber-500',
    iconBg: 'bg-amber-500/10',
    span: '',
  },
] as const;

const PRICING_PACKAGES = [
  {
    name: 'Social Media',
    price: '249',
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
    price: '499',
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
    price: '349',
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

  // inquiry dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState('');
  const [formName, setFormName] = useState('');
  const [formBusiness, setFormBusiness] = useState('');
  const [formDetails, setFormDetails] = useState('');
  const [formBudget, setFormBudget] = useState('');
  const [formPhone, setFormPhone] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { navigate('/auth', { replace: true }); return; }

      const { data: prof } = await supabase
        .from('profiles')
        .select('display_name, user_type')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!cancelled && prof) {
        if (prof.user_type !== 'business') { navigate('/profile', { replace: true }); return; }
        setDisplayName(prof.display_name ?? '');
      }

      const { data: students } = await supabase
        .from('student_profiles')
        .select('user_id, avatar_url, skills, hourly_rate')
        .eq('is_available', true)
        .eq('community_board_status', 'approved')
        .not('skills', 'eq', '{}')
        .limit(6);

      if (!cancelled && students) {
        const ids = students.map((s) => s.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, display_name')
          .in('user_id', ids);

        const nameMap = new Map(
          (profiles ?? []).map((p) => [p.user_id, p.display_name]),
        );
        setRecommended(
          students.map((s) => ({ ...s, display_name: nameMap.get(s.user_id) ?? null })),
        );
      }
      if (!cancelled) setLoadingTalent(false);
    };

    load();
    return () => { cancelled = true; };
  }, [navigate]);

  const openInquiry = (serviceLabel: string) => {
    setSelectedService(serviceLabel);
    setFormName('');
    setFormBusiness('');
    setFormDetails('');
    setFormBudget('');
    setFormPhone('');
    setDialogOpen(true);
  };

  const submitInquiry = () => {
    const lines = [
      `Hi! I'm interested in: ${selectedService}`,
      `Name: ${formName}`,
      `Business: ${formBusiness}`,
      `Details: ${formDetails}`,
      `Budget: ${formBudget}`,
      `Phone/WhatsApp: ${formPhone}`,
    ];
    window.open(`${teamWhatsAppHref}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
    setDialogOpen(false);
  };

  const formValid =
    formName.trim() && formBusiness.trim() && formDetails.trim() && formBudget && formPhone.trim();

  return (
    <>
      <Navbar />
      <main className="min-h-[100dvh] bg-background pb-28 md:pb-20">
        <div className="mx-auto max-w-5xl px-4 pt-24 sm:px-6 sm:pt-28 lg:px-8">

          {/* ── Hero / Welcome ── */}
          <motion.section
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mb-16 sm:mb-20"
          >
            <motion.span
              variants={fadeUp}
              className="mb-3 inline-block rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-primary"
            >
              Business Dashboard
            </motion.span>
            <motion.h1
              variants={fadeUp}
              className="text-4xl font-bold tracking-tight sm:text-5xl"
            >
              {displayName ? (
                <>Hey, {displayName}</>
              ) : (
                <>Welcome back</>
              )}
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="mt-3 max-w-xl text-base text-muted-foreground leading-relaxed"
            >
              Tell us what you need and we'll match you with the right creative talent — or browse freelancers directly.
            </motion.p>
          </motion.section>

          {/* ── Service cards — asymmetric 2+1+1 grid ── */}
          <motion.section
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mb-16 sm:mb-20"
          >
            <motion.span
              variants={fadeUp}
              className="mb-4 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
            >
              Get started
            </motion.span>

            <div className="grid gap-3 sm:grid-cols-3">
              {SERVICE_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <motion.button
                    key={card.id}
                    variants={fadeUp}
                    onClick={() => openInquiry(card.label)}
                    className={`group relative flex flex-col items-start gap-4 overflow-hidden rounded-2xl border border-foreground/[0.06] bg-card p-5 sm:p-6 text-left transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-foreground/[0.12] hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.08)] active:scale-[0.98] ${card.span}`}
                  >
                    {/* subtle gradient wash */}
                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.accent} opacity-0 transition-opacity duration-500 group-hover:opacity-100`} />

                    <span className={`relative flex h-11 w-11 items-center justify-center rounded-xl ${card.iconBg}`}>
                      <Icon className={`h-5 w-5 ${card.iconColor}`} strokeWidth={1.8} />
                    </span>

                    <div className="relative">
                      <h3 className="text-[15px] font-semibold leading-snug">{card.label}</h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                        {card.detail}
                      </p>
                    </div>

                    <ArrowRight className="absolute right-4 top-5 h-4 w-4 text-muted-foreground/30 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-0.5 group-hover:text-foreground/50" strokeWidth={1.8} />
                  </motion.button>
                );
              })}
            </div>
          </motion.section>

          {/* ── Browse talent ── */}
          <motion.section
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mb-16 sm:mb-24"
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <motion.span
                  variants={fadeUp}
                  className="mb-4 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Recommended for you
                </motion.span>
                <motion.h2
                  variants={fadeUp}
                  className="text-2xl font-bold tracking-tight sm:text-3xl"
                >
                  Top freelancers
                </motion.h2>
              </div>
              <motion.div variants={fadeUp}>
                <Button
                  variant="outline"
                  className="rounded-xl transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
                  onClick={() => navigate('/students')}
                >
                  <Users className="mr-2 h-4 w-4" />
                  Browse all talent
                </Button>
              </motion.div>
            </div>

            <div className="mt-6">
              {loadingTalent ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 rounded-2xl border border-foreground/[0.04] bg-muted/40 p-4">
                      <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-3 w-16 animate-pulse rounded bg-muted/70" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recommended.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-foreground/10 px-6 py-12 text-center">
                  <Users className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                  <p className="text-sm font-medium text-muted-foreground">No freelancers available right now</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">Check back soon — new talent joins every week.</p>
                </div>
              ) : (
                <motion.div
                  variants={stagger}
                  initial="hidden"
                  animate="visible"
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {recommended.map((s) => (
                    <motion.div key={s.user_id} variants={fadeUp}>
                      <Link
                        to={`/students/${s.user_id}`}
                        className="group flex items-center gap-4 rounded-2xl border border-foreground/[0.06] bg-card p-4 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-foreground/[0.12] hover:shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)] active:scale-[0.98]"
                      >
                        <Avatar className="h-11 w-11 border border-border/60">
                          <AvatarImage src={s.avatar_url ?? undefined} />
                          <AvatarFallback className="bg-primary/5 text-primary text-sm font-semibold">
                            {(s.display_name ?? '?')[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-foreground/90 transition-colors duration-200 group-hover:text-primary">
                            {s.display_name ?? 'Freelancer'}
                          </p>
                          {s.skills?.[0] && (
                            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                              {s.skills[0]}
                            </span>
                          )}
                        </div>
                        {s.hourly_rate != null && (
                          <span className="shrink-0 rounded-lg bg-primary/5 px-2.5 py-1 text-[13px] font-semibold tabular-nums text-primary">
                            €{s.hourly_rate}/hr
                          </span>
                        )}
                      </Link>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          </motion.section>

          {/* ── Pricing ── */}
          <motion.section
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="mb-12"
          >
            <motion.span
              variants={fadeUp}
              className="mb-4 block text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
            >
              Packages
            </motion.span>
            <motion.h2
              variants={fadeUp}
              className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl"
            >
              Simple, transparent pricing
            </motion.h2>

            {/* Asymmetric: first card full-width on mobile, 2-col then 1-col on desktop for variety */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PRICING_PACKAGES.map((pkg) => (
                <motion.div
                  key={pkg.name}
                  variants={fadeUp}
                  className={`relative flex flex-col rounded-2xl border bg-card p-6 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.08)] ${
                    pkg.popular
                      ? 'border-primary/30 shadow-[0_0_0_1px_hsl(221_83%_53%/0.08)]'
                      : 'border-foreground/[0.06]'
                  }`}
                >
                  {pkg.popular && (
                    <span className="absolute -top-3 left-5 rounded-full bg-primary px-3 py-0.5 text-[11px] font-semibold text-primary-foreground">
                      Most popular
                    </span>
                  )}

                  <h3 className="text-[15px] font-semibold">{pkg.name}</h3>

                  <p className="mt-3 mb-5 flex items-baseline gap-1">
                    <span className="text-[13px] text-muted-foreground">€</span>
                    <span className="text-4xl font-bold tracking-tighter tabular-nums">{pkg.price}</span>
                    <span className="text-[13px] text-muted-foreground">{pkg.period}</span>
                  </p>

                  <ul className="mb-6 flex-1 space-y-2.5">
                    {pkg.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[13px] text-muted-foreground leading-snug">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" strokeWidth={2.2} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <a
                    href={`${teamWhatsAppHref}?text=${encodeURIComponent(`Hi! I'm interested in the ${pkg.name} package (€${pkg.price}${pkg.period}).`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-[#1fba59] hover:shadow-[0_4px_12px_-4px_rgba(37,211,102,0.4)] active:scale-[0.97]"
                  >
                    <MessageCircle className="h-4 w-4" strokeWidth={1.8} />
                    Get started
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
            <DialogTitle className="text-lg">Get a quote — {selectedService}</DialogTitle>
            <DialogDescription>
              Fill in the details and we'll reach out on WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-3 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inq-name">Your name</Label>
              <Input
                id="inq-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-biz">Business name</Label>
              <Input
                id="inq-biz"
                value={formBusiness}
                onChange={(e) => setFormBusiness(e.target.value)}
                placeholder="Your company name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-details">What do you need?</Label>
              <Textarea
                id="inq-details"
                value={formDetails}
                onChange={(e) => setFormDetails(e.target.value)}
                placeholder="Describe your project or what you're looking for..."
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="inq-phone">WhatsApp / Phone</Label>
              <Input
                id="inq-phone"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+353 89 ..."
              />
            </div>

            <Button
              className="w-full rounded-xl transition-all duration-200 active:scale-[0.97]"
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
