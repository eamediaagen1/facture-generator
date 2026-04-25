-- ============================================================
-- Run this entire script in your Supabase SQL Editor once.
-- ============================================================

-- 1. Factures
CREATE TABLE IF NOT EXISTS public.factures (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  number      TEXT           UNIQUE NOT NULL,
  client      TEXT           NOT NULL DEFAULT '',
  date        DATE           NOT NULL DEFAULT CURRENT_DATE,
  items       JSONB          NOT NULL DEFAULT '[]',
  tva_rate    INTEGER        NOT NULL DEFAULT 20,
  total_ht    NUMERIC(12,2)  NOT NULL DEFAULT 0,
  tva_amount  NUMERIC(12,2)  NOT NULL DEFAULT 0,
  total_ttc   NUMERIC(12,2)  NOT NULL DEFAULT 0,
  status      TEXT           NOT NULL DEFAULT 'Générée',
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);

-- 2. Numbering counter (one row per year — never decrements)
CREATE TABLE IF NOT EXISTS public.facture_counter (
  year  INTEGER  PRIMARY KEY,
  seq   INTEGER  NOT NULL DEFAULT 0
);

-- 3. Row-Level Security
ALTER TABLE public.factures        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facture_counter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_factures"
  ON public.factures FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_counter"
  ON public.facture_counter FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- 4. Atomic numbering function
--    Returns the next FAC-YYYY-NNNN string and increments the counter.
--    Uses INSERT … ON CONFLICT so the counter resets automatically each new year.
CREATE OR REPLACE FUNCTION public.next_facture_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cur_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  new_seq  INTEGER;
BEGIN
  INSERT INTO public.facture_counter (year, seq)
  VALUES (cur_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET seq = facture_counter.seq + 1
  RETURNING seq INTO new_seq;

  RETURN 'FAC-' || cur_year || '-' || LPAD(new_seq::TEXT, 4, '0');
END;
$$;

-- 5. Auto-touch updated_at on every update
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS factures_updated_at ON public.factures;
CREATE TRIGGER factures_updated_at
  BEFORE UPDATE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. Reset facture counter (admin/testing)
--    Sets the counter for a given year to p_start_from.
--    After reset to 0, the next call to next_facture_number() returns FAC-YYYY-0001.
--    Existing factures are NOT deleted.
CREATE OR REPLACE FUNCTION public.reset_facture_counter(
  p_year       INTEGER,
  p_start_from INTEGER DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.facture_counter (year, seq)
  VALUES (p_year, p_start_from)
  ON CONFLICT (year)
  DO UPDATE SET seq = p_start_from;
END;
$$;
