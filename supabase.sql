-- Supabase SQL Editor дээр энэ бүх SQL-ийг нэг удаа ажиллуулна.

create extension if not exists "pgcrypto";

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  family_id uuid references families(id) on delete cascade,
  name text not null,
  email text not null,
  role text default 'member',
  created_at timestamptz default now()
);

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  email text not null,
  name text,
  role text default 'member',
  status text default 'pending',
  invited_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  member_id uuid references profiles(id) on delete set null,
  type text check (type in ('income','expense')) not null,
  amount numeric not null default 0,
  category text not null,
  date date not null default current_date,
  note text,
  created_at timestamptz default now()
);

create table if not exists savings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  target_amount numeric not null default 0,
  current_amount numeric not null default 0,
  monthly_rate numeric default 0,
  months int default 12,
  reminder_day int default 1,
  created_at timestamptz default now()
);

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  monthly_payment numeric not null default 0,
  annual_rate numeric default 0,
  remaining_months int default 0,
  start_date date,
  end_date date,
  created_at timestamptz default now()
);

alter table families enable row level security;
alter table profiles enable row level security;
alter table invites enable row level security;
alter table transactions enable row level security;
alter table savings enable row level security;
alter table loans enable row level security;

create or replace function public.my_family_id()
returns uuid language sql security definer stable as $$
  select family_id from public.profiles where id = auth.uid()
$$;

drop policy if exists "family read" on families;
create policy "family read" on families for select using (id = public.my_family_id() or owner_id = auth.uid());
drop policy if exists "family insert" on families;
create policy "family insert" on families for insert with check (owner_id = auth.uid());

drop policy if exists "profiles family read" on profiles;
create policy "profiles family read" on profiles for select using (family_id = public.my_family_id() or id = auth.uid());
drop policy if exists "profiles insert own" on profiles;
create policy "profiles insert own" on profiles for insert with check (id = auth.uid());
drop policy if exists "profiles update own" on profiles;
create policy "profiles update own" on profiles for update using (id = auth.uid());

drop policy if exists "invites family read" on invites;
create policy "invites family read" on invites for select using (family_id = public.my_family_id() or email = auth.email());
drop policy if exists "invites family insert" on invites;
create policy "invites family insert" on invites for insert with check (family_id = public.my_family_id());
drop policy if exists "invites family update" on invites;
create policy "invites family update" on invites for update using (family_id = public.my_family_id() or email = auth.email());

drop policy if exists "transactions family all" on transactions;
create policy "transactions family all" on transactions for all using (family_id = public.my_family_id()) with check (family_id = public.my_family_id());

drop policy if exists "savings family all" on savings;
create policy "savings family all" on savings for all using (family_id = public.my_family_id()) with check (family_id = public.my_family_id());

drop policy if exists "loans family all" on loans;
create policy "loans family all" on loans for all using (family_id = public.my_family_id()) with check (family_id = public.my_family_id());
