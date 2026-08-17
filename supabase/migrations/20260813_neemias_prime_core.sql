-- Barbearia Neemias Prime — núcleo de agenda, usuários, planos e segurança.
-- Execute este arquivo uma única vez no SQL Editor do Supabase.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin
  create type public.user_role as enum ('client', 'admin', 'staff');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.appointment_status as enum ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_mode as enum ('at_shop', 'membership');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.user_role not null default 'client',
  booking_blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_cents integer not null check (price_cents >= 0),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_cents integer not null check (price_cents >= 0),
  allowed_weekdays smallint[] not null default array[2,3,4,5,6]::smallint[],
  benefit_type text not null check (benefit_type in ('cut', 'beard', 'cut_beard')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (client_id, plan_id, starts_on)
);

create table if not exists public.business_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  is_open boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((not is_open) or (opens_at is not null and closes_at is not null and opens_at < closes_at))
);

create table if not exists public.professional_time_off (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  professional_id uuid not null references public.professionals(id),
  service_id uuid not null references public.services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  payment_mode public.payment_mode not null default 'at_shop',
  membership_id uuid references public.memberships(id),
  client_notes text,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  no_show_marked_at timestamptz,
  check (starts_at < ends_at)
);

create index if not exists appointments_client_idx on public.appointments(client_id, starts_at desc);
create index if not exists appointments_professional_idx on public.appointments(professional_id, starts_at);
create index if not exists memberships_client_idx on public.memberships(client_id) where active;
create unique index if not exists one_active_membership_per_client on public.memberships(client_id) where active;
create index if not exists time_off_professional_idx on public.professional_time_off(professional_id, starts_at, ends_at);

do $$ begin
  alter table public.appointments add constraint no_professional_overlap
  exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled', 'confirmed'));
exception when duplicate_object then null; end $$;

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin') $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), new.raw_user_meta_data->>'phone')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.membership_for_service(p_client uuid, p_service uuid, p_starts_at timestamptz)
returns uuid language sql stable security definer set search_path = public
as $$
  select m.id
  from public.memberships m
  join public.plans p on p.id = m.plan_id and p.active
  join public.services s on s.id = p_service
  where m.client_id = p_client and m.active
    and m.starts_on <= (p_starts_at at time zone 'America/Sao_Paulo')::date
    and (m.ends_on is null or m.ends_on >= (p_starts_at at time zone 'America/Sao_Paulo')::date)
    and extract(dow from p_starts_at at time zone 'America/Sao_Paulo')::smallint = any(p.allowed_weekdays)
    and (
      (p.benefit_type = 'cut' and lower(s.name) in ('corte', 'corte infantil (07 à 11 anos)')) or
      (p.benefit_type = 'beard' and lower(s.name) = 'barba') or
      (p.benefit_type = 'cut_beard' and lower(s.name) = 'corte + barba')
    )
  order by m.starts_on desc limit 1;
$$;

create or replace function public.create_appointment(
  p_professional_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_client_notes text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := auth.uid();
  v_duration integer;
  v_ends_at timestamptz;
  v_membership uuid;
  v_id uuid;
  v_local timestamp;
  v_hours public.business_hours%rowtype;
begin
  if v_client is null then raise exception 'Faça login para agendar.'; end if;
  if exists(select 1 from public.profiles where id = v_client and booking_blocked_until > now()) then
    raise exception 'Agendamentos bloqueados temporariamente após não comparecimento.';
  end if;
  select duration_minutes into v_duration from public.services where id = p_service_id and active;
  if v_duration is null then raise exception 'Serviço indisponível.'; end if;
  if not exists(select 1 from public.professionals where id = p_professional_id and active) then raise exception 'Profissional indisponível.'; end if;
  if p_starts_at <= now() then raise exception 'Escolha um horário futuro.'; end if;
  -- Cada reserva ocupa no mínimo um bloco de 30 minutos.
  v_ends_at := p_starts_at + make_interval(mins => greatest(v_duration, 30));
  v_local := p_starts_at at time zone 'America/Sao_Paulo';
  select * into v_hours from public.business_hours where weekday = extract(dow from v_local)::smallint;
  if v_hours is null or not v_hours.is_open or v_local::time < v_hours.opens_at or (v_ends_at at time zone 'America/Sao_Paulo')::time > v_hours.closes_at then
    raise exception 'Horário fora do funcionamento da barbearia.';
  end if;
  if exists(select 1 from public.professional_time_off where professional_id = p_professional_id and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')) then
    raise exception 'Profissional indisponível neste período.';
  end if;
  v_membership := public.membership_for_service(v_client, p_service_id, p_starts_at);
  insert into public.appointments(client_id, professional_id, service_id, starts_at, ends_at, payment_mode, membership_id, client_notes)
  values(v_client, p_professional_id, p_service_id, p_starts_at, v_ends_at, case when v_membership is null then 'at_shop'::public.payment_mode else 'membership'::public.payment_mode end, v_membership, nullif(trim(p_client_notes), ''))
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'Este horário acabou de ser ocupado. Escolha outro.';
end;
$$;

create or replace function public.available_slots(p_professional_id uuid, p_service_id uuid, p_date date)
returns table(starts_at timestamptz) language sql stable security definer set search_path = public
as $$
  with config as (
    select greatest(s.duration_minutes, 30) as duration_minutes, h.opens_at, h.closes_at
    from public.services s
    join public.business_hours h on h.weekday = extract(dow from p_date)::smallint and h.is_open
    where s.id=p_service_id and s.active
      and exists(select 1 from public.professionals where id=p_professional_id and active)
  ), candidates as (
    select timezone('America/Sao_Paulo', slot_local) as slot_start,
           duration_minutes
    from config,
    lateral generate_series(
      (p_date + opens_at)::timestamp,
      (p_date + closes_at - make_interval(mins=>duration_minutes))::timestamp,
      interval '30 minutes'
    ) slot_local
  )
  select c.slot_start
  from candidates c
  where c.slot_start > now()
    and not exists (
      select 1 from public.appointments a
      where a.professional_id=p_professional_id and a.status in ('scheduled','confirmed')
        and tstzrange(a.starts_at,greatest(a.ends_at,a.starts_at+interval '30 minutes'),'[)') && tstzrange(c.slot_start,c.slot_start+make_interval(mins=>c.duration_minutes),'[)')
    )
    and not exists (
      select 1 from public.professional_time_off t
      where t.professional_id=p_professional_id
        and tstzrange(t.starts_at,t.ends_at,'[)') && tstzrange(c.slot_start,c.slot_start+make_interval(mins=>c.duration_minutes),'[)')
    )
  order by c.slot_start;
$$;

create or replace function public.cancel_my_appointment(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.appointments set status='cancelled', cancelled_at=now(), updated_at=now()
  where id=p_appointment_id and client_id=auth.uid() and status in ('scheduled','confirmed');
  if not found then raise exception 'Agendamento não encontrado ou já encerrado.'; end if;
end;
$$;

create or replace function public.reschedule_my_appointment(
  p_appointment_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz
) returns void language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_duration integer;
  v_ends_at timestamptz;
  v_membership uuid;
  v_local timestamp;
  v_hours public.business_hours%rowtype;
begin
  if v_client is null then raise exception 'Faça login para reagendar.'; end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id and client_id = v_client
  for update;

  if v_appointment.id is null or v_appointment.status not in ('scheduled','confirmed') then
    raise exception 'Agendamento não encontrado ou já encerrado.';
  end if;
  if v_appointment.starts_at <= now() then raise exception 'Este atendimento já começou e não pode ser reagendado.'; end if;
  if exists(select 1 from public.profiles where id = v_client and booking_blocked_until > now()) then
    raise exception 'Agendamentos bloqueados temporariamente após não comparecimento.';
  end if;
  if p_starts_at <= now() then raise exception 'Escolha um horário futuro.'; end if;
  if not exists(select 1 from public.professionals where id = p_professional_id and active) then
    raise exception 'Profissional indisponível.';
  end if;

  select duration_minutes into v_duration
  from public.services where id = v_appointment.service_id and active;
  if v_duration is null then raise exception 'Serviço indisponível.'; end if;

  v_ends_at := p_starts_at + make_interval(mins => greatest(v_duration, 30));
  v_local := p_starts_at at time zone 'America/Sao_Paulo';
  select * into v_hours from public.business_hours
  where weekday = extract(dow from v_local)::smallint;
  if v_hours is null or not v_hours.is_open or v_local::time < v_hours.opens_at
     or (v_ends_at at time zone 'America/Sao_Paulo')::time > v_hours.closes_at then
    raise exception 'Horário fora do funcionamento da barbearia.';
  end if;
  if exists(
    select 1 from public.professional_time_off
    where professional_id = p_professional_id
      and tstzrange(starts_at, ends_at, '[)') && tstzrange(p_starts_at, v_ends_at, '[)')
  ) then raise exception 'Profissional indisponível neste período.'; end if;

  v_membership := public.membership_for_service(v_client, v_appointment.service_id, p_starts_at);
  update public.appointments
  set professional_id = p_professional_id,
      starts_at = p_starts_at,
      ends_at = v_ends_at,
      payment_mode = case when v_membership is null then 'at_shop'::public.payment_mode else 'membership'::public.payment_mode end,
      membership_id = v_membership,
      updated_at = now()
  where id = p_appointment_id;
exception when exclusion_violation then
  raise exception 'Este horário acabou de ser ocupado. Escolha outro.';
end;
$$;

create or replace function public.mark_no_show(p_appointment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_client uuid;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  update public.appointments set status='no_show', no_show_marked_at=now(), updated_at=now()
  where id=p_appointment_id and status in ('scheduled','confirmed') and starts_at + interval '15 minutes' <= now()
  returning client_id into v_client;
  if v_client is null then raise exception 'A falta só pode ser registrada após 15 minutos de atraso.'; end if;
  update public.profiles set booking_blocked_until=greatest(coalesce(booking_blocked_until, now()), now()+interval '24 hours'), updated_at=now() where id=v_client;
end;
$$;

create or replace function public.admin_set_appointment_status(p_appointment_id uuid, p_status public.appointment_status)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if p_status='no_show' then perform public.mark_no_show(p_appointment_id); return; end if;
  update public.appointments set status=p_status, updated_at=now(), cancelled_at=case when p_status='cancelled' then now() else cancelled_at end
  where id=p_appointment_id;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
end;
$$;

create or replace function public.admin_assign_membership(p_client_id uuid, p_plan_id uuid default null)
returns uuid language plpgsql security definer set search_path = public
as $$
declare v_membership_id uuid;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if not exists(select 1 from public.profiles where id=p_client_id) then
    raise exception 'Cliente não encontrado.';
  end if;

  update public.memberships
  set active=false, ends_on=current_date
  where client_id=p_client_id and active;

  if p_plan_id is null then return null; end if;
  if not exists(select 1 from public.plans where id=p_plan_id and active) then
    raise exception 'Plano indisponível.';
  end if;

  insert into public.memberships(client_id,plan_id,starts_on,ends_on,active)
  values(p_client_id,p_plan_id,current_date,null,true)
  on conflict(client_id,plan_id,starts_on)
  do update set active=true, ends_on=null
  returning id into v_membership_id;

  return v_membership_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.professionals enable row level security;
alter table public.services enable row level security;
alter table public.plans enable row level security;
alter table public.memberships enable row level security;
alter table public.business_hours enable row level security;
alter table public.professional_time_off enable row level security;
alter table public.appointments enable row level security;

drop policy if exists "profile self read" on public.profiles;
create policy "profile self read" on public.profiles for select to authenticated using (id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists "profile self update" on public.profiles;
create policy "profile self update" on public.profiles for update to authenticated using (id=(select auth.uid()) or (select private.is_admin())) with check (id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists "catalog public read" on public.professionals;
create policy "catalog public read" on public.professionals for select to anon, authenticated using (active or (select private.is_admin()));
drop policy if exists "services public read" on public.services;
create policy "services public read" on public.services for select to anon, authenticated using (active or (select private.is_admin()));
drop policy if exists "plans public read" on public.plans;
create policy "plans public read" on public.plans for select to anon, authenticated using (active or (select private.is_admin()));
drop policy if exists "hours public read" on public.business_hours;
create policy "hours public read" on public.business_hours for select to anon, authenticated using (true);
drop policy if exists "membership owner admin" on public.memberships;
create policy "membership owner admin" on public.memberships for select to authenticated using (client_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists "appointments owner admin" on public.appointments;
create policy "appointments owner admin" on public.appointments for select to authenticated using (client_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists "admin manage professionals" on public.professionals;
create policy "admin manage professionals" on public.professionals for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin manage services" on public.services;
create policy "admin manage services" on public.services for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin manage plans" on public.plans;
create policy "admin manage plans" on public.plans for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin manage memberships" on public.memberships;
create policy "admin manage memberships" on public.memberships for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin manage appointments" on public.appointments;
create policy "admin manage appointments" on public.appointments for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin manage time off" on public.professional_time_off;
create policy "admin manage time off" on public.professional_time_off for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "admin manage hours" on public.business_hours;
create policy "admin manage hours" on public.business_hours for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

grant usage on schema public to anon, authenticated;
grant select on public.professionals, public.services, public.plans, public.business_hours to anon, authenticated;
grant select on public.profiles, public.memberships, public.appointments to authenticated;
revoke update on public.profiles from authenticated;
grant update(full_name, phone) on public.profiles to authenticated;
grant insert, update, delete on public.professionals, public.services, public.plans, public.memberships, public.business_hours, public.professional_time_off, public.appointments to authenticated;
grant execute on function public.create_appointment(uuid,uuid,timestamptz,text) to authenticated;
grant execute on function public.available_slots(uuid,uuid,date) to authenticated;
grant execute on function public.cancel_my_appointment(uuid) to authenticated;
grant execute on function public.reschedule_my_appointment(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.mark_no_show(uuid) to authenticated;
grant execute on function public.admin_set_appointment_status(uuid,public.appointment_status) to authenticated;
revoke all on function public.admin_assign_membership(uuid,uuid) from public;
grant execute on function public.admin_assign_membership(uuid,uuid) to authenticated;

insert into public.professionals(id,name,display_order) values
('10000000-0000-0000-0000-000000000001','Breno Sousa',1),
('10000000-0000-0000-0000-000000000002','Agatha Sousa',2),
('10000000-0000-0000-0000-000000000003','Matheus Francisco',3),
('10000000-0000-0000-0000-000000000004','Neemias Prime',4)
on conflict(name) do update set active=true, display_order=excluded.display_order;

-- As durações são iniciais e podem ser alteradas no painel administrativo.
insert into public.services(name,price_cents,duration_minutes,display_order) values
('Sobrancelha',1200,10,1),('Relaxamento Capilar',5000,30,2),('Reflexo',10000,90,3),
('Platinado',15000,180,4),('Pigmentação',2000,20,5),('Limpeza de pele',3000,30,6),
('Hidratação',3000,20,7),('Epilação de Nariz e Orelha',2000,15,8),
('Corte Infantil (07 à 11 anos)',4500,45,9),('Corte + Barba',7000,75,10),
('Corte',4000,45,11),('Coloração',5000,60,12),('Barbaterapia',6000,45,13),
('Barba',3500,30,14),('Acabamento (Pézinho)',1500,15,15)
on conflict(name) do update set price_cents=excluded.price_cents, duration_minutes=excluded.duration_minutes, active=true, display_order=excluded.display_order;

insert into public.plans(name,price_cents,allowed_weekdays,benefit_type) values
('Corte ilimitado — terça e quinta',7990,array[2,4]::smallint[],'cut'),
('Corte ilimitado — terça a sábado',9990,array[2,3,4,5,6]::smallint[],'cut'),
('Barba ilimitada',9990,array[2,3,4,5,6]::smallint[],'beard'),
('Corte + barba ilimitados',14990,array[2,3,4,5,6]::smallint[],'cut_beard')
on conflict(name) do update set price_cents=excluded.price_cents, allowed_weekdays=excluded.allowed_weekdays, benefit_type=excluded.benefit_type, active=true;

insert into public.business_hours(weekday,opens_at,closes_at,is_open) values
(0,null,null,false),(1,null,null,false),(2,'09:00','20:00',true),(3,'09:00','20:00',true),
(4,'09:00','20:00',true),(5,'09:00','20:00',true),(6,'09:00','19:00',true)
on conflict(weekday) do update set opens_at=excluded.opens_at, closes_at=excluded.closes_at, is_open=excluded.is_open;

-- Depois que o primeiro administrador criar a conta, substitua o e-mail abaixo e execute:
-- update public.profiles set role='admin' where id=(select id from auth.users where email='EMAIL_DO_ADMIN');
