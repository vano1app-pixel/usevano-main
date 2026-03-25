

# VANO - Student Shift Marketplace for Galway

## Overview
Transform the current event management app into **VANO**, a clean, simple platform that connects Galway businesses with students for last-minute shifts. Think Fiverr, but simpler and local. The color scheme shifts to **white-dominant with blue accents**.

---

## Design System Changes

- Replace the current black/pink (#FA76FF) theme with **white + blue (#2563EB)** accent
- Clean, minimal UI throughout -- lots of whitespace, simple typography
- Update CSS variables: primary becomes blue, keep clean sans-serif fonts

---

## Database Changes

New tables needed (via migrations):

1. **`student_profiles`** - Students list their skills
   - `id`, `user_id`, `bio`, `skills` (text array), `hourly_rate`, `phone`, `avatar_url`, `is_available`, `created_at`, `updated_at`

2. **`jobs`** - Businesses post shift/gig listings
   - `id`, `posted_by`, `title`, `description`, `location`, `hourly_rate`, `tags` (text array), `status` (open/filled/closed), `shift_date`, `shift_start`, `shift_end`, `created_at`

3. **`job_applications`** - Students apply to jobs
   - `id`, `job_id`, `student_id`, `message`, `status` (pending/accepted/rejected), `applied_at`

4. Add a `role` column approach via a **`user_type`** field on `profiles` table (student vs business) -- or better, use the existing `user_roles` table with new enum values

RLS policies for all tables to ensure proper access control.

---

## Pages & Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing/Home | Hero + how it works + featured jobs |
| `/jobs` | Browse Jobs | Businesses' posted shifts, filterable by tags |
| `/jobs/:id` | Job Detail | Full job info + apply button |
| `/post-job` | Post a Job | Business creates a shift listing (auth required) |
| `/students` | Browse Students | Businesses browse student profiles |
| `/profile` | My Profile | Edit student/business profile |
| `/dashboard` | Dashboard | My posted jobs or my applications |
| `/auth` | Auth | Sign in / Sign up (existing, restyled) |

---

## Key Features

1. **Landing Page** - Clean hero: "We connect Galway businesses with students for last-minute shifts", how-it-works section, featured jobs, CTA buttons
2. **Student Profiles** - Students sign up, add skills (tags like "barista", "retail", "events"), bio, hourly rate, availability toggle
3. **Job Posting** - Businesses post shifts with tags, location, pay, date/time
4. **Tag-Based Matching** - Jobs tagged with skills; browse/filter by tags
5. **Job Applications** - Students apply to jobs; businesses see applicants and accept/reject
6. **Search & Filter** - Filter jobs by tag, date, pay range
7. **Availability Toggle** - Students can mark themselves available/unavailable

### Bonus Features
- **Quick Stats** on dashboard (jobs posted, applications received, etc.)
- **Recent Activity** feed
- **Rating/Review** system placeholder for future

---

## Component Changes

| Component | Action |
|-----------|--------|
| `Navbar` | Rebrand to VANO, update links (Browse Jobs, Post a Job, Dashboard), blue accent on hover |
| `AuthSheet` | Restyle to blue theme, add user type selection (Student/Business) on signup |
| `Landing (Discover)` | Complete rewrite as VANO landing page |
| `EventsCarousel` | Replace with featured jobs carousel or remove |
| `CreateEvent` | Replace with `PostJob` page |
| `MyEvents` | Replace with `Dashboard` (my jobs / my applications) |
| `EventDetailPage` | Replace with `JobDetail` page |
| New: `StudentCard` | Card component for browsing students |
| New: `JobCard` | Card component for job listings |
| New: `TagBadge` | Reusable tag/skill badge component |
| New: `StudentProfile` | Profile edit page for students |
| New: `BrowseStudents` | Page for businesses to find students |

---

## Technical Details

### Migration SQL (summary)
- Create `student_profiles` table with RLS (owner can edit, everyone can view available students)
- Create `jobs` table with RLS (poster can edit/delete, everyone can view open jobs)
- Create `job_applications` table with RLS (applicant can view own, job poster can view applications for their jobs)
- Update `profiles` table to add `user_type` field (student/business)

### Authentication Flow
- Reuse existing auth system
- On signup, user selects "Student" or "Business"
- Store user_type in profiles table
- Route to appropriate onboarding (student fills skills, business fills company info)

### Tag System
- Skills/tags stored as text arrays in Postgres
- Filter jobs by matching tags
- Predefined common tags + custom entry

### File Changes Summary
- ~15 files modified (navbar, auth, CSS, routes, existing pages)
- ~8 new files (job card, student card, browse pages, post job, dashboard, profile, tag badge, landing sections)
- 1 database migration with multiple tables + RLS policies

