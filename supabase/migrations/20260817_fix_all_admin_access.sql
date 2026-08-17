-- Corrige o "Acesso negado" em todas as ações do painel administrativo.
-- Execute uma vez no SQL Editor do Supabase. Não apaga nenhum dado.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role::text = 'admin'
  );
$$;

grant usage on schema private to authenticated;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

create or replace function public.admin_update_service(
  p_service_id uuid,
  p_name text,
  p_price_cents integer,
  p_duration_minutes integer,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
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
set search_path = public
as $$
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;

  update public.professionals
  set active = p_active
  where id = p_professional_id;

  if not found then raise exception 'Profissional não encontrado.'; end if;
end;
$$;

revoke all on function public.admin_update_service(uuid,text,integer,integer,boolean) from public;
revoke all on function public.admin_set_professional_active(uuid,boolean) from public;
grant execute on function public.admin_update_service(uuid,text,integer,integer,boolean) to authenticated;
grant execute on function public.admin_set_professional_active(uuid,boolean) to authenticated;

-- Recria as políticas para garantir que instalações anteriores também sejam corrigidas.
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
