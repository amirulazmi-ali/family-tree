-- Run once in the Supabase SQL Editor before deploying the matching app code.
-- Existing profiles with a death year are marked as deceased.
DO $$
BEGIN
  ALTER TABLE public.family_members
    ADD COLUMN IF NOT EXISTS is_deceased boolean NOT NULL DEFAULT false;

  UPDATE public.family_members
     SET is_deceased = true
   WHERE death_year IS NOT NULL
     AND is_deceased = false;
END $$;
