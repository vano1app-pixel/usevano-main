import type { CommunityCategoryId } from '@/lib/communityCategories';

/**
 * Demo freelancer rows for the Talent Board — same payloads as `DEMO_POSTS` in
 * `src/pages/Community.tsx` (introduced/expanded in commit 54b2eab).
 */
export type TalentBoardDemoEntry = {
  /** Talent Board section this profile belongs to (single category only). */
  category: CommunityCategoryId;
  post: {
    id: string;
    user_id: string;
    title: string;
    description: string;
    image_url: string | null;
  };
  profile: { display_name: string; avatar_url: string };
  studentProfile: {
    skills: string[];
    hourly_rate: number;
    is_available: boolean;
    university: string;
  };
};

/** All demo profiles; each row carries its own `category` for filtering. */
export const TALENT_BOARD_DEMO_PROFILES: TalentBoardDemoEntry[] = [
  {
    category: 'videographer',
    post: {
      id: 'demo-video',
      user_id: 'demo-video-user',
      title: 'Wedding, event & promo filming — Galway & Connacht',
      description: `Hi, I'm Cian — a final-year Media Production student at ATU Galway. I specialise in weddings, corporate events, brand promos, and short-form content for social.\n\nKit: Sony A7 IV with prime lenses, DJI RS 3 gimbal, and a DJI Mini 4 Pro drone. I shoot LOG and colour grade in DaVinci Resolve for a clean, cinematic look.\n\nTurnaround is 5–7 working days. I include one round of revision and deliver in any format. Happy to travel within Connacht.`,
      image_url: 'https://picsum.photos/seed/vano-cian/900/500',
    },
    profile: {
      display_name: 'Cian Murphy',
      avatar_url: 'https://randomuser.me/api/portraits/men/32.jpg',
    },
    studentProfile: {
      skills: ['Video Editing', 'Drone Filming', 'Wedding Films', 'Event Coverage', 'Short-form Reels', 'Premiere Pro', 'DaVinci Resolve', 'Colour Grading', 'Corporate Video', 'Instagram Reels'],
      hourly_rate: 45,
      is_available: true,
      university: 'ATU',
    },
  },
  {
    category: 'websites',
    post: {
      id: 'demo-web',
      user_id: 'demo-web-user',
      title: 'Custom websites & web apps — fast, clean, mobile-first',
      description: `Hey, I'm Aoife — a final-year Software Development student at ATU Galway. I build polished websites and web apps for small businesses, freelancers, and startups.\n\nI work in React and Next.js with Tailwind CSS, and I'm comfortable with Supabase, Stripe, and CMS integrations. From Figma mockup to live deployment — start to finish.\n\nFree 30-minute discovery call before we start. Check my portfolio and GitHub below.`,
      image_url: 'https://picsum.photos/seed/vano-aoife/900/500',
    },
    profile: {
      display_name: 'Aoife Walsh',
      avatar_url: 'https://randomuser.me/api/portraits/women/44.jpg',
    },
    studentProfile: {
      skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Figma', 'UI/UX Design', 'Supabase', 'Shopify', 'SEO', 'Framer Motion'],
      hourly_rate: 45,
      is_available: true,
      university: 'ATU',
    },
  },
  {
    category: 'websites',
    post: {
      id: 'demo-web-2',
      user_id: 'demo-web-user-2',
      title: 'UI/UX design & Webflow/Framer sites — Galway',
      description: `Hi, I'm Sinéad — a final-year Digital Media Design student at University of Galway. I design and build beautiful, conversion-focused websites for founders, coaches, and creative businesses.\n\nI work in Figma for wireframes and prototypes, then bring designs to life in Webflow or Framer — no code needed on your end. I also do brand identity work: logos, colour palettes, and style guides.\n\nI offer a free 20-minute discovery call. Let's build something you're proud of.`,
      image_url: 'https://picsum.photos/seed/vano-sinead/900/500',
    },
    profile: {
      display_name: 'Sinéad Ní Fhaoláin',
      avatar_url: 'https://randomuser.me/api/portraits/women/29.jpg',
    },
    studentProfile: {
      skills: ['Figma', 'UI/UX Design', 'Webflow', 'Framer', 'Brand Identity', 'Logo Design', 'Wireframing', 'Prototyping', 'Adobe Illustrator', 'Accessibility'],
      hourly_rate: 40,
      is_available: true,
      university: 'UGalway',
    },
  },
  {
    category: 'social_media',
    post: {
      id: 'demo-social',
      user_id: 'demo-social-user',
      title: 'Social media management & content creation — Instagram, TikTok & LinkedIn',
      description: `I'm Darragh — a final-year Marketing student at ATU with 2+ years managing social accounts for local businesses across Galway.\n\nI handle the full process: strategy, content calendar, shooting, editing, posting, and monthly analytics reports.\n\nRecent results: grew a Galway café from 800 to 4,200 followers in 4 months. Built a local gym's TikTok from zero to 12k views per reel in 6 weeks.`,
      image_url: 'https://picsum.photos/seed/vano-darragh/900/500',
    },
    profile: {
      display_name: 'Darragh Ryan',
      avatar_url: 'https://randomuser.me/api/portraits/men/22.jpg',
    },
    studentProfile: {
      skills: ['Instagram', 'TikTok', 'LinkedIn', 'Content Strategy', 'Reels Editing', 'Copywriting', 'Analytics & Reporting', 'CapCut', 'Canva', 'Content Planning'],
      hourly_rate: 35,
      is_available: true,
      university: 'ATU',
    },
  },
];

export function talentBoardDemoToStudentRow(d: TalentBoardDemoEntry) {
  const bioLead = d.post.description.split('\n').find((line) => line.trim())?.trim() || d.post.title;
  return {
    id: d.post.id,
    user_id: d.post.user_id,
    bio: bioLead,
    skills: d.studentProfile.skills,
    hourly_rate: d.studentProfile.hourly_rate,
    is_available: d.studentProfile.is_available,
    avatar_url: d.profile.avatar_url,
    banner_url: d.post.image_url ?? undefined,
    university: d.studentProfile.university,
  };
}
