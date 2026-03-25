ALTER TABLE public.jobs ADD COLUMN payment_type text NOT NULL DEFAULT 'hourly';
ALTER TABLE public.jobs ADD COLUMN fixed_price numeric DEFAULT NULL;