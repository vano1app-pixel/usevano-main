-- Minimal feature requests from the app (Request a feature link)
CREATE TABLE public.feature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX feature_requests_created_at_idx ON public.feature_requests (created_at DESC);

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users insert own feature requests"
  ON public.feature_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.feature_requests IS 'User-submitted product ideas from the Request a feature flow';
