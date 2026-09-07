create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activation_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  key_identifier text not null,
  customer_name text not null check (char_length(customer_name) between 1 and 160),
  customer_email text not null check (char_length(customer_email) between 3 and 320),
  license_type text not null check (license_type in ('time_limited', 'lifetime')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_activated_at timestamptz,
  last_used_at timestamptz,
  activation_count integer not null default 0 check (activation_count >= 0),
  status text not null default 'active' check (status in ('active', 'expired', 'suspended', 'revoked')),
  notes text,
  revoked_at timestamptz,
  suspended_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  constraint lifetime_has_no_expiry check ((license_type = 'lifetime' and expires_at is null) or (license_type = 'time_limited' and expires_at is not null))
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id),
  action text not null,
  activation_key_id uuid references public.activation_keys(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activation_keys_identifier_idx on public.activation_keys(key_identifier);
create index if not exists activation_keys_email_idx on public.activation_keys(lower(customer_email));
create index if not exists activation_keys_status_idx on public.activation_keys(status);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

alter table public.profiles enable row level security;
alter table public.activation_keys enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists activation_admin_only on public.activation_keys;
create policy activation_admin_only on public.activation_keys for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists audit_admin_only on public.audit_logs;
create policy audit_admin_only on public.audit_logs for select to authenticated using (public.is_admin());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do update set email = excluded.email; return new; end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();