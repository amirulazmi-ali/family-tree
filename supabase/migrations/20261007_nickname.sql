-- Run once in the Supabase SQL Editor before deploying the matching app code.
alter table public.family_members add column if not exists nickname text;
