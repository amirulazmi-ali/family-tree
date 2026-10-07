-- V0.3-B: explicit twin / multiple-birth support.
-- Twins are explicit graph relationships; triplets and larger sets are
-- supported by connecting members into the same twin component.

alter table public.family_relationships
  drop constraint if exists family_relationships_relationship_type_check;

alter table public.family_relationships
  add constraint family_relationships_relationship_type_check
  check (relationship_type in ('parent','spouse','twin'));

create index if not exists family_relationships_twin_idx
  on public.family_relationships (family_id, relationship_type, member_id, related_member_id);

-- Twin links are stored once in canonical UUID order. The UI treats them
-- as symmetric, so A-B and B-A are never both stored.
alter table public.family_relationships
  drop constraint if exists family_relationships_twin_canonical_check;

alter table public.family_relationships
  add constraint family_relationships_twin_canonical_check
  check (relationship_type <> 'twin' or member_id < related_member_id);

-- Keep the V0.3-A parent-cycle protection unchanged.
create or replace function public.prevent_parent_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.relationship_type <> 'parent' then
    return new;
  end if;

  if exists (
    with recursive ancestors(member_id) as (
      select new.related_member_id
      union
      select r.related_member_id
      from public.family_relationships r
      join ancestors a on a.member_id = r.member_id
      where r.family_id = new.family_id
        and r.relationship_type = 'parent'
        and r.id <> new.id
    )
    select 1
    from ancestors
    where member_id = new.member_id
  ) then
    raise exception 'Parent relationship would create a family-tree cycle';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_parent_cycle() from public;
