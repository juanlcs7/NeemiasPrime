-- Estabilização final: execute uma vez no SQL Editor do Supabase.
-- É idempotente, preserva o histórico e não exige chave de serviço no navegador.

alter table public.professionals add column if not exists photo_url text;
alter table public.plans add column if not exists cycle_months smallint not null default 1;
alter table public.plans drop constraint if exists plans_cycle_months_check;
alter table public.plans add constraint plans_cycle_months_check check (cycle_months between 1 and 24);

create table if not exists public.plan_services (
  plan_id uuid not null references public.plans(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  primary key (plan_id, service_id)
);

-- Mantém as quatro fotos reais sem associá-las ao nome no aplicativo.
update public.professionals set photo_url = '/barbeiros/breno-sousa.png' where name = 'Breno Sousa' and photo_url is null;
update public.professionals set photo_url = '/barbeiros/agatha-sousa.png' where name = 'Agatha Sousa' and photo_url is null;
update public.professionals set photo_url = '/barbeiros/matheus-francisco.png' where name = 'Matheus Francisco' and photo_url is null;
update public.professionals set photo_url = '/barbeiros/neemias-prime.png' where name = 'Neemias Prime' and photo_url is null;

-- Migra a regra legada de tipo/nome uma única vez para IDs estáveis.
insert into public.plan_services(plan_id, service_id)
select p.id, s.id
from public.plans p
join public.services s on (
  (p.benefit_type = 'cut' and lower(s.name) in ('corte', 'corte infantil (07 à 11 anos)'))
  or (p.benefit_type = 'beard' and lower(s.name) = 'barba')
  or (p.benefit_type = 'cut_beard' and lower(s.name) = 'corte + barba')
)
on conflict do nothing;

-- Planos antigos ativos ganham um ciclo mensal finito a partir da data de início.
update public.memberships
set ends_on = ((starts_on + make_interval(months => 1))::date - 1)
where ends_on is null;

alter table public.memberships drop constraint if exists memberships_dates_check;
alter table public.memberships add constraint memberships_dates_check check (ends_on is not null and ends_on >= starts_on);
create index if not exists memberships_active_period_idx on public.memberships(client_id, starts_on, ends_on) where active;

create or replace function private.sao_paulo_today()
returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role::text = 'admin') $$;

create or replace function public.admin_update_service(p_service_id uuid, p_name text, p_price_cents integer, p_duration_minutes integer, p_active boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if p_service_id is null or nullif(trim(p_name), '') is null then raise exception 'Dados do serviço inválidos.'; end if;
  if p_price_cents < 0 or p_duration_minutes not between 5 and 480 then raise exception 'Preço ou duração inválidos.'; end if;
  update public.services set name = trim(p_name), price_cents = p_price_cents, duration_minutes = p_duration_minutes, active = p_active, updated_at = now() where id = p_service_id;
  if not found then raise exception 'Serviço não encontrado.'; end if;
end;
$$;

create or replace function public.admin_set_professional_active(p_professional_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  update public.professionals set active = p_active where id = p_professional_id;
  if not found then raise exception 'Profissional não encontrado.'; end if;
end;
$$;

create or replace function public.membership_for_service(p_client uuid, p_service uuid, p_starts_at timestamptz)
returns uuid language sql stable security definer set search_path = public
as $$
  select m.id
  from public.memberships m
  join public.plans p on p.id = m.plan_id and p.active
  join public.plan_services ps on ps.plan_id = p.id and ps.service_id = p_service
  where m.client_id = p_client and m.active
    and m.starts_on <= (p_starts_at at time zone 'America/Sao_Paulo')::date
    and m.ends_on >= (p_starts_at at time zone 'America/Sao_Paulo')::date
    and extract(dow from p_starts_at at time zone 'America/Sao_Paulo')::smallint = any(p.allowed_weekdays)
  order by m.ends_on desc, m.starts_on desc limit 1;
$$;

-- A versão anterior retornava uuid; PostgreSQL exige remover essa assinatura
-- antes de recriá-la com os dados do ciclo. Não há alteração de registros.
drop function if exists public.admin_assign_membership(uuid, uuid);

create or replace function public.admin_assign_membership(p_client_id uuid, p_plan_id uuid)
returns table(id uuid, starts_on date, ends_on date)
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := private.sao_paulo_today();
  v_months smallint;
  v_id uuid;
  v_end date;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if p_client_id is null or p_plan_id is null then raise exception 'Cliente e plano são obrigatórios.'; end if;
  perform 1 from public.profiles where id = p_client_id for update;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  select cycle_months into v_months from public.plans where id = p_plan_id and active;
  if v_months is null then raise exception 'Plano indisponível.'; end if;
  update public.memberships
  set active = false,
      ends_on = least(ends_on, greatest(starts_on, v_today))
  where client_id = p_client_id and active;
  v_end := ((v_today + make_interval(months => v_months))::date - 1);
  insert into public.memberships(client_id, plan_id, starts_on, ends_on, active)
  values (p_client_id, p_plan_id, v_today, v_end, true)
  on conflict (client_id, plan_id, starts_on)
  do update set active = true, ends_on = excluded.ends_on
  returning memberships.id into v_id;
  return query select v_id, v_today, v_end;
end;
$$;

create or replace function public.admin_renew_membership(p_membership_id uuid)
returns table(id uuid, starts_on date, ends_on date)
language plpgsql security definer set search_path = public
as $$
declare
  v_membership public.memberships%rowtype;
  v_months smallint;
  v_base date;
  v_end date;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  select * into v_membership from public.memberships where id = p_membership_id for update;
  if v_membership.id is null or not v_membership.active then raise exception 'Plano não pode ser renovado.'; end if;
  select cycle_months into v_months from public.plans where id = v_membership.plan_id and active;
  if v_months is null then raise exception 'Plano indisponível.'; end if;
  v_base := greatest(v_membership.ends_on + 1, private.sao_paulo_today());
  v_end := ((v_base + make_interval(months => v_months))::date - 1);
  update public.memberships set ends_on = v_end where id = v_membership.id;
  return query select v_membership.id, v_membership.starts_on, v_end;
end;
$$;

create or replace function public.admin_remove_membership(p_membership_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_today date := private.sao_paulo_today();
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  update public.memberships
  set active = false,
      ends_on = least(ends_on, greatest(starts_on, v_today))
  where id = p_membership_id and active;
  if not found then raise exception 'Plano ativo não encontrado.'; end if;
end;
$$;

create or replace function public.admin_mark_no_show(p_appointment_id uuid)
returns timestamptz language plpgsql security definer set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_blocked_until timestamptz := now() + interval '24 hours';
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if v_appointment.id is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_appointment.status not in ('scheduled', 'confirmed') then raise exception 'Este agendamento já foi encerrado.'; end if;
  if v_appointment.starts_at + interval '15 minutes' > now() then raise exception 'A falta só pode ser registrada após 15 minutos de atraso.'; end if;
  update public.appointments
  set status = 'no_show', no_show_marked_at = now(), updated_at = now()
  where id = v_appointment.id;
  if not found then raise exception 'Não foi possível registrar a falta.'; end if;
  update public.profiles
  set booking_blocked_until = v_blocked_until, updated_at = now()
  where id = v_appointment.client_id;
  if not found then raise exception 'Cliente não encontrado.'; end if;
  return v_blocked_until;
end;
$$;

revoke all on function private.sao_paulo_today() from public;
revoke all on function private.is_admin() from public;
revoke all on function public.admin_update_service(uuid,text,integer,integer,boolean) from public;
revoke all on function public.admin_set_professional_active(uuid,boolean) from public;
revoke all on function public.admin_assign_membership(uuid,uuid) from public;
revoke all on function public.admin_renew_membership(uuid) from public;
revoke all on function public.admin_remove_membership(uuid) from public;
revoke all on function public.admin_mark_no_show(uuid) from public;
grant execute on function public.admin_assign_membership(uuid,uuid) to authenticated;
grant execute on function public.admin_renew_membership(uuid) to authenticated;
grant execute on function public.admin_remove_membership(uuid) to authenticated;
grant execute on function public.admin_mark_no_show(uuid) to authenticated;
grant execute on function public.admin_update_service(uuid,text,integer,integer,boolean) to authenticated;
grant execute on function public.admin_set_professional_active(uuid,boolean) to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

drop policy if exists "public read plan services" on public.plan_services;
alter table public.plan_services enable row level security;
create policy "public read plan services" on public.plan_services for select using (true);
drop policy if exists "admin manage plan services" on public.plan_services;
create policy "admin manage plan services" on public.plan_services for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));
