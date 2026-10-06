-- Run once in the Supabase SQL Editor before deploying the matching app code.
-- Existing children are initially ordered by birth year, then creation time.
DO $$
DECLARE
  needs_backfill boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'family_members'
      AND column_name = 'child_order'
  ) INTO needs_backfill;

  ALTER TABLE public.family_members
    ADD COLUMN IF NOT EXISTS child_order integer NOT NULL DEFAULT 0;

  IF needs_backfill THEN
    WITH ranked_children AS (
      SELECT
        child.id,
        row_number() OVER (
          PARTITION BY child.family_id, relationship.related_member_id
          ORDER BY child.birth_year NULLS LAST, child.created_at, child.full_name, child.id
        )::integer AS position
      FROM public.family_members child
      JOIN public.family_relationships relationship
        ON relationship.family_id = child.family_id
       AND relationship.member_id = child.id
       AND relationship.relationship_type = 'parent'
    )
    UPDATE public.family_members member
       SET child_order = ranked_children.position
      FROM ranked_children
     WHERE member.id = ranked_children.id;
  END IF;
END $$;
