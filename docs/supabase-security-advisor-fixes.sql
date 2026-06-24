-- Supabase Security Advisor fixes for the existing project.
-- Run in Supabase SQL Editor after the base schema exists.
--
-- This addresses:
-- - Security Definer View: public.v_user_access
-- - RLS Disabled in Public: app-owned public tables
-- - Function Search Path Mutable: public.touch_updated_at
-- - Public/Signed-In Users Can Execute SECURITY DEFINER:
--   public.bootstrap_new_user_access
--
-- "Leaked Password Protection" is not SQL. In the Supabase dashboard it is:
-- Authentication -> Attack Protection -> Prevent use of leaked passwords.
-- Supabase only allows this on Pro plans and above, so Free projects cannot
-- clear that advisor item without upgrading.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.bootstrap_new_user_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (user_id, email, role)
  values (new.id, coalesce(new.email, format('user-%s@example.invalid', new.id)), 'subscriber')
  on conflict (user_id) do nothing;

  insert into public.user_subscriptions (user_id, status)
  values (new.id, 'trialing')
  on conflict (user_id) do nothing;

  insert into public.user_entitlements (user_id, enterprise_granted)
  values (new.id, false)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

alter view if exists public.v_user_access set (security_invoker = true);

alter table if exists public.user_profiles enable row level security;
alter table if exists public.user_subscriptions enable row level security;
alter table if exists public.user_entitlements enable row level security;
alter table if exists public.audit_log enable row level security;
alter table if exists public.recipe_costings enable row level security;
alter table if exists public.user_recipe_favorites enable row level security;

drop policy if exists user_profiles_select_own on public.user_profiles;
create policy user_profiles_select_own
on public.user_profiles
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists user_subscriptions_select_own on public.user_subscriptions;
create policy user_subscriptions_select_own
on public.user_subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own
on public.user_entitlements
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists user_recipe_favorites_select_own on public.user_recipe_favorites;
create policy user_recipe_favorites_select_own
on public.user_recipe_favorites
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists user_recipe_favorites_insert_own on public.user_recipe_favorites;
create policy user_recipe_favorites_insert_own
on public.user_recipe_favorites
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists user_recipe_favorites_delete_own on public.user_recipe_favorites;
create policy user_recipe_favorites_delete_own
on public.user_recipe_favorites
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists recipe_costings_owner_select on public.recipe_costings;
create policy recipe_costings_owner_select
on public.recipe_costings
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = (select auth.uid())
      and p.role = 'owner'
  )
);

drop policy if exists audit_log_owner_select on public.audit_log;
create policy audit_log_owner_select
on public.audit_log
for select
to authenticated
using (
  exists (
    select 1
    from public.user_profiles p
    where p.user_id = (select auth.uid())
      and p.role = 'owner'
  )
);

grant select on public.user_profiles to authenticated;
grant select on public.user_subscriptions to authenticated;
grant select on public.user_entitlements to authenticated;
grant select, insert, delete on public.user_recipe_favorites to authenticated;
grant select on public.recipe_costings to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.v_user_access to authenticated;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.bootstrap_new_user_access() from public, anon, authenticated;
