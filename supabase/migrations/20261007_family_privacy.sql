-- V0.4: Private family tree access.
-- Run this migration in Supabase SQL Editor.

create or replace function public.is_family_member(target_family uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members m
    where m.family_id = target_family
      and m.user_id = (select auth.uid())
  ) or public.is_family_admin(target_family)
$$;
revoke all on function public.is_family_member(uuid) from public;
grant execute on function public.is_family_member(uuid) to authenticated;

drop policy if exists members_read on public.family_members;
create policy members_read on public.family_members for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists relationships_read on public.family_relationships;
create policy relationships_read on public.family_relationships for select to authenticated
using (public.is_family_member(family_id));

drop policy if exists family_read on public.families;
create policy family_read on public.families for select to authenticated
using (public.is_family_member(id));

revoke select on public.families, public.family_members, public.family_relationships from anon;
revoke select on public.family_admins from anon;
