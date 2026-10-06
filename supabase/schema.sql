-- Apply in the Supabase SQL Editor. Safe to rerun for an existing V0.1 project.
create extension if not exists pgcrypto;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  birth_year integer,
  death_year integer,
  birthplace text,
  bio text,
  gender text,
  child_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Upgrade the original V0.1 table in place if it already exists.
alter table public.family_members add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.family_members add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table public.family_members add column if not exists child_order integer not null default 0;
insert into public.families (id, name) values ('10000000-0000-4000-8000-000000000001','Keluarga Mat Isa') on conflict (id) do nothing;
update public.family_members set family_id='10000000-0000-4000-8000-000000000001' where family_id is null;
alter table public.family_members alter column family_id set not null;

create table if not exists public.family_relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.family_members(id) on delete cascade,
  related_member_id uuid not null references public.family_members(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('parent','spouse')),
  created_at timestamptz not null default now(),
  check (member_id <> related_member_id),
  unique (member_id, related_member_id, relationship_type)
);

create table if not exists public.family_admins (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create or replace function public.is_family_admin(target_family uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_admins a where a.family_id=target_family and a.user_id=(select auth.uid()))
$$;
revoke all on function public.is_family_admin(uuid) from public;
grant execute on function public.is_family_admin(uuid) to authenticated;

create or replace function public.protect_member_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_family_admin(old.family_id) and
     (new.id is distinct from old.id or new.family_id is distinct from old.family_id or new.user_id is distinct from old.user_id) then
    raise exception 'Only a family admin can change a member identity or account link';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_member_identity on public.family_members;
create trigger protect_member_identity before update on public.family_members
for each row execute function public.protect_member_identity();

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_relationships enable row level security;
alter table public.family_admins enable row level security;

drop policy if exists family_read on public.families;
create policy family_read on public.families for select to anon, authenticated using (true);
drop policy if exists family_admin_write on public.families;
create policy family_admin_write on public.families for all to authenticated using (public.is_family_admin(id)) with check (public.is_family_admin(id));

drop policy if exists members_read on public.family_members;
create policy members_read on public.family_members for select to anon, authenticated using (true);
drop policy if exists members_admin_manage on public.family_members;
create policy members_admin_manage on public.family_members for all to authenticated using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
drop policy if exists members_self_update on public.family_members;
create policy members_self_update on public.family_members for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

drop policy if exists relationships_read on public.family_relationships;
create policy relationships_read on public.family_relationships for select to anon, authenticated using (true);
drop policy if exists relationships_admin_manage on public.family_relationships;
create policy relationships_admin_manage on public.family_relationships for all to authenticated using (public.is_family_admin(family_id)) with check (public.is_family_admin(family_id));
drop policy if exists admins_self_read on public.family_admins;
create policy admins_self_read on public.family_admins for select to authenticated using (user_id=(select auth.uid()));

grant select on public.families, public.family_members, public.family_relationships to anon, authenticated;
grant select on public.family_admins to authenticated;
grant update (full_name,birth_year,death_year,birthplace,bio,gender,child_order) on public.family_members to authenticated;
grant insert, update, delete on public.families, public.family_members, public.family_relationships to authenticated;

insert into public.family_members (id,family_id,full_name,gender,bio)
values
('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Mat Isa','Lelaki','Pangkal salasilah keluarga ini. Kisah dan butiran beliau boleh dilengkapkan oleh keluarga.'),
('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Mat Deah','Tidak diketahui','Anak kepada Mat Isa.'),
('00000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Tok Awang','Lelaki','Anak kepada Mat Isa.'),
('00000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Tok Sa''bah','Perempuan','Anak kepada Mat Isa.')
on conflict (id) do update set family_id=excluded.family_id;
insert into public.family_relationships (family_id,member_id,related_member_id,relationship_type)
values
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','parent'),
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','parent'),
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','parent')
on conflict do nothing;
