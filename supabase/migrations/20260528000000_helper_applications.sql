-- Helper job applications submitted from /join page
CREATE TABLE IF NOT EXISTS helper_applications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  phone      text        NOT NULL,
  photo_url  text,
  status     text        NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE helper_applications ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors can submit; nobody can read via the anon key
CREATE POLICY "anon_insert_helper_applications"
  ON helper_applications FOR INSERT TO anon
  WITH CHECK (true);

-- Storage bucket for face photos (5 MB cap, images only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'helper-photos',
  'helper-photos',
  true,
  5242880,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Anyone (anon) can upload into this bucket
CREATE POLICY "anon_upload_helper_photos"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'helper-photos');

-- Public reads so photo URLs resolve
CREATE POLICY "public_read_helper_photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'helper-photos');
