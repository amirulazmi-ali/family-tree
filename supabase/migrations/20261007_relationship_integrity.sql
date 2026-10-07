-- V0.3-A: relationship and member data integrity.
-- Run once against an existing Supabase project, then keep future schema changes in migrations.

-- Ensure relationship rows cannot point across different families.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_members_family_id_id_key'
      AND conrelid = 'public.family_members'::regclass
  ) THEN
    ALTER TABLE public.family_members
      ADD CONSTRAINT family_members_family_id_id_key UNIQUE (family_id, id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_relationships_member_same_family_fk'
      AND conrelid = 'public.family_relationships'::regclass
  ) THEN
    ALTER TABLE public.family_relationships
      ADD CONSTRAINT family_relationships_member_same_family_fk
      FOREIGN KEY (family_id, member_id)
      REFERENCES public.family_members (family_id, id)
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_relationships_related_same_family_fk'
      AND conrelid = 'public.family_relationships'::regclass
  ) THEN
    ALTER TABLE public.family_relationships
      ADD CONSTRAINT family_relationships_related_same_family_fk
      FOREIGN KEY (family_id, related_member_id)
      REFERENCES public.family_members (family_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- New/updated member records must use sensible values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_members_birth_year_check'
      AND conrelid = 'public.family_members'::regclass
  ) THEN
    ALTER TABLE public.family_members
      ADD CONSTRAINT family_members_birth_year_check
      CHECK (birth_year IS NULL OR birth_year BETWEEN 0 AND 2100) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_members_death_year_check'
      AND conrelid = 'public.family_members'::regclass
  ) THEN
    ALTER TABLE public.family_members
      ADD CONSTRAINT family_members_death_year_check
      CHECK (death_year IS NULL OR death_year BETWEEN 0 AND 2100) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_members_year_order_check'
      AND conrelid = 'public.family_members'::regclass
  ) THEN
    ALTER TABLE public.family_members
      ADD CONSTRAINT family_members_year_order_check
      CHECK (birth_year IS NULL OR death_year IS NULL OR death_year >= birth_year) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_members_child_order_check'
      AND conrelid = 'public.family_members'::regclass
  ) THEN
    ALTER TABLE public.family_members
      ADD CONSTRAINT family_members_child_order_check
      CHECK (child_order >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'family_members_gender_check'
      AND conrelid = 'public.family_members'::regclass
  ) THEN
    ALTER TABLE public.family_members
      ADD CONSTRAINT family_members_gender_check
      CHECK (gender IS NULL OR gender IN ('Lelaki', 'Perempuan', 'Tidak diketahui')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS family_relationships_member_idx
  ON public.family_relationships (family_id, member_id, relationship_type);

CREATE INDEX IF NOT EXISTS family_relationships_related_idx
  ON public.family_relationships (family_id, related_member_id, relationship_type);

-- Prevent parent relationships from creating cycles such as A -> B -> C -> A.
CREATE OR REPLACE FUNCTION public.prevent_parent_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.relationship_type <> 'parent' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    WITH RECURSIVE ancestors(member_id) AS (
      SELECT NEW.related_member_id
      UNION
      SELECT r.related_member_id
      FROM public.family_relationships r
      JOIN ancestors a ON a.member_id = r.member_id
      WHERE r.family_id = NEW.family_id
        AND r.relationship_type = 'parent'
        AND r.id <> NEW.id
    )
    SELECT 1
    FROM ancestors
    WHERE member_id = NEW.member_id
  ) THEN
    RAISE EXCEPTION 'Parent relationship would create a family-tree cycle';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_parent_cycle() FROM PUBLIC;

DROP TRIGGER IF EXISTS prevent_parent_cycle ON public.family_relationships;
CREATE TRIGGER prevent_parent_cycle
BEFORE INSERT OR UPDATE OF family_id, member_id, related_member_id, relationship_type
ON public.family_relationships
FOR EACH ROW
EXECUTE FUNCTION public.prevent_parent_cycle();
