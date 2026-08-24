-- Restaura todas as permissões de escrita do painel administrativo.
-- Seguro para executar mais de uma vez. Não remove nem altera dados existentes.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then return false; end if;
  return exists (
    select 1
    from public.profiles
    where id = v_user_id
      and role = 'admin'::public.user_role
  );
end;
$$;

alter function private.is_admin() owner to postgres;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create or replace function public.admin_set_appointment_status(
  p_appointment_id uuid,
  p_status public.appointment_status
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_client_id uuid;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;

  if p_status = 'no_show'::public.appointment_status then
    update public.appointments
    set status = 'no_show'::public.appointment_status,
        no_show_marked_at = now(),
        updated_at = now()
    where id = p_appointment_id
      and status in ('scheduled'::public.appointment_status, 'confirmed'::public.appointment_status)
      and starts_at + interval '15 minutes' <= now()
    returning client_id into v_client_id;

    if v_client_id is null then
      raise exception 'A falta só pode ser registrada após 15 minutos de atraso.';
    end if;

    update public.profiles
    set booking_blocked_until = greatest(coalesce(booking_blocked_until, now()), now() + interval '24 hours'),
        updated_at = now()
    where id = v_client_id;
    return;
  end if;

  update public.appointments
  set status = p_status,
      updated_at = now(),
      cancelled_at = case when p_status = 'cancelled'::public.appointment_status then now() else cancelled_at end
  where id = p_appointment_id;

  if not found then raise exception 'Agendamento não encontrado.'; end if;
end;
$$;

create or replace function public.admin_update_service(
  p_service_id uuid,
  p_name text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Informe o nome do serviço.'; end if;
  if p_price_cents < 0 then raise exception 'O valor não pode ser negativo.'; end if;
  if p_duration_minutes < 5 or p_duration_minutes > 480 then raise exception 'Duração inválida.'; end if;

  update public.services
  set name = trim(p_name),
      price_cents = p_price_cents,
      duration_minutes = p_duration_minutes,
      active = p_active,
      updated_at = now()
  where id = p_service_id;

  if not found then raise exception 'Serviço não encontrado.'; end if;
end;
$$;

create or replace function public.admin_set_professional_active(
  p_professional_id uuid,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;

  update public.professionals
  set active = p_active
  where id = p_professional_id;

  if not found then raise exception 'Profissional não encontrado.'; end if;
end;
$$;

create or replace function public.admin_assign_membership(
  p_client_id uuid,
  p_plan_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_membership_id uuid;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if not exists (select 1 from public.profiles where id = p_client_id) then
    raise exception 'Cliente não encontrado.';
  end if;

  update public.memberships
  set active = false, ends_on = current_date
  where client_id = p_client_id and active;

  if p_plan_id is null then return null; end if;
  if not exists (select 1 from public.plans where id = p_plan_id and active) then
    raise exception 'Plano indisponível.';
  end if;

  insert into public.memberships (client_id, plan_id, starts_on, ends_on, active)
  values (p_client_id, p_plan_id, current_date, null, true)
  on conflict (client_id, plan_id, starts_on)
  do update set active = true, ends_on = null
  returning id into v_membership_id;

  return v_membership_id;
end;
$$;

alter function public.admin_set_appointment_status(uuid, public.appointment_status) owner to postgres;
alter function public.admin_update_service(uuid, text, integer, integer, boolean) owner to postgres;
alter function public.admin_set_professional_active(uuid, boolean) owner to postgres;
alter function public.admin_assign_membership(uuid, uuid) owner to postgres;

revoke all on function public.admin_set_appointment_status(uuid, public.appointment_status) from public, anon;
revoke all on function public.admin_update_service(uuid, text, integer, integer, boolean) from public, anon;
revoke all on function public.admin_set_professional_active(uuid, boolean) from public, anon;
revoke all on function public.admin_assign_membership(uuid, uuid) from public, anon;

grant execute on function public.admin_set_appointment_status(uuid, public.appointment_status) to authenticated;
grant execute on function public.admin_update_service(uuid, text, integer, integer, boolean) to authenticated;
grant execute on function public.admin_set_professional_active(uuid, boolean) to authenticated;
grant execute on function public.admin_assign_membership(uuid, uuid) to authenticated;

-- Recria as políticas administrativas para instalações que ficaram com
-- versões antigas ou incompletas das migrações.
drop policy if exists "admin manage professionals" on public.professionals;
create policy "admin manage professionals" on public.professionals
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "admin manage services" on public.services;
create policy "admin manage services" on public.services
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "admin manage plans" on public.plans;
create policy "admin manage plans" on public.plans
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "admin manage memberships" on public.memberships;
create policy "admin manage memberships" on public.memberships
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists "admin manage appointments" on public.appointments;
create policy "admin manage appointments" on public.appointments
for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

grant insert, update, delete on public.professionals, public.services, public.plans,
  public.memberships, public.appointments to authenticated;

-- Força o PostgREST a reconhecer imediatamente as funções recriadas.
notify pgrst, 'reload schema';
