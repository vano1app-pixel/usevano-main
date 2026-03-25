
-- Add image_url column to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL;

-- Create chat-images storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-images', 'chat-images', true) ON CONFLICT (id) DO NOTHING;

-- RLS for chat-images bucket: anyone can read, authenticated users can upload
CREATE POLICY "Anyone can view chat images" ON storage.objects FOR SELECT USING (bucket_id = 'chat-images');
CREATE POLICY "Authenticated users can upload chat images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-images' AND auth.role() = 'authenticated');
CREATE POLICY "Users can delete own chat images" ON storage.objects FOR DELETE USING (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);
