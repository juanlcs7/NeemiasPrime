-- Corrige o vínculo de planos no painel administrativo sem liberar a tabela
-- memberships diretamente para clientes. Pode ser executado sem apagar dados.

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

revoke all on function public.admin_assign_membership(uuid,uuid) from public;
grant execute on function public.admin_assign_membership(uuid,uuid) to authenticated;
