-- Milestone 1 database foundation (PostgreSQL / Supabase compatible)
-- This schema supports the access matrix and API contracts.

create extension if not exists pgcrypto;

-- Enums
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'app_role' and n.nspname = 'public'
  ) then
    create type public.app_role as enum ('owner', 'subscriber');
  end if;
end
$$;

alter type public.app_role add value if not exists 'owner';
alter type public.app_role add value if not exists 'subscriber';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'subscription_status' and n.nspname = 'public'
  ) then
    create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
  end if;
end
$$;

alter type public.subscription_status add value if not exists 'trialing';
alter type public.subscription_status add value if not exists 'active';
alter type public.subscription_status add value if not exists 'past_due';
alter type public.subscription_status add value if not exists 'canceled';
alter type public.subscription_status add value if not exists 'expired';

-- Common trigger for updated_at
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- User profile mapped to auth identity.
-- In Supabase, auth.users is managed by the auth service.
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role public.app_role not null default 'subscriber',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.touch_updated_at();

-- One current subscription record per user for access decisions.
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_subscriptions_updated_at on public.user_subscriptions;
create trigger trg_user_subscriptions_updated_at
before update on public.user_subscriptions
for each row execute function public.touch_updated_at();

-- Owner-controlled entitlement flags.
create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enterprise_granted boolean not null default false,
  granted_by uuid references auth.users(id),
  granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_entitlements_updated_at on public.user_entitlements;
create trigger trg_user_entitlements_updated_at
before update on public.user_entitlements
for each row execute function public.touch_updated_at();

-- Audit trail for owner actions.
create table if not exists public.audit_log (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id),
  target_user_id uuid references auth.users(id),
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_action_check
    check (action in ('grant_enterprise', 'revoke_enterprise', 'set_role', 'set_subscription_status'))
);

create index if not exists idx_audit_log_target_created_at
  on public.audit_log (target_user_id, created_at desc);

create index if not exists idx_audit_log_actor_created_at
  on public.audit_log (actor_user_id, created_at desc);

-- Computed access view used by /api/me/access and admin list endpoints.
create or replace view public.v_user_access as
select
  p.user_id,
  p.email,
  p.role,
  s.status as subscription_status,
  coalesce(e.enterprise_granted, false) as enterprise_granted,
  case
    when p.role = 'owner' then true
    when p.role = 'subscriber' and s.status in ('trialing', 'active') then true
    else false
  end as can_view_public,
  case
    when p.role = 'owner' then true
    when p.role = 'subscriber' and coalesce(e.enterprise_granted, false) then true
    else false
  end as can_view_enterprise
from public.user_profiles p
left join public.user_subscriptions s on s.user_id = p.user_id
left join public.user_entitlements e on e.user_id = p.user_id;
