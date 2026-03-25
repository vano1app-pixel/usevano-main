
-- 1. Add 'completed' to job_status enum
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'completed';

-- 2. Add completion/payment tracking to jobs
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS payment_amount numeric DEFAULT 0;

-- 3. Add photos array to reviews
ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}';

-- 4. Create freelancer preferences table
CREATE TABLE public.freelancer_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  preferred_tags text[] DEFAULT '{}',
  min_budget numeric DEFAULT 0,
  max_budget numeric DEFAULT 0,
  preferred_work_type text DEFAULT 'any',
  notify_instant boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.freelancer_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON public.freelancer_preferences
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON public.freelancer_preferences
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON public.freelancer_preferences
FOR UPDATE USING (auth.uid() = user_id);

-- 5. Create portfolio_items table
CREATE TABLE public.portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text DEFAULT '',
  image_url text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portfolio items" ON public.portfolio_items
FOR SELECT USING (true);

CREATE POLICY "Users can insert own portfolio items" ON public.portfolio_items
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own portfolio items" ON public.portfolio_items
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own portfolio items" ON public.portfolio_items
FOR DELETE USING (auth.uid() = user_id);

-- 6. Create storage bucket for portfolio images and review photos
INSERT INTO storage.buckets (id, name, public) VALUES ('portfolio-images', 'portfolio-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for portfolio-images
CREATE POLICY "Anyone can view portfolio images" ON storage.objects
FOR SELECT USING (bucket_id = 'portfolio-images');

CREATE POLICY "Auth users can upload portfolio images" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'portfolio-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own portfolio images" ON storage.objects
FOR UPDATE USING (bucket_id = 'portfolio-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own portfolio images" ON storage.objects
FOR DELETE USING (bucket_id = 'portfolio-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Storage policies for review-photos
CREATE POLICY "Anyone can view review photos" ON storage.objects
FOR SELECT USING (bucket_id = 'review-photos');

CREATE POLICY "Auth users can upload review photos" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'review-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Trigger for updated_at on freelancer_preferences
CREATE TRIGGER update_freelancer_preferences_updated_at
BEFORE UPDATE ON public.freelancer_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
