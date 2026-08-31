-- Ferramentas administrativas de agenda: encaixes e bloqueios semanais.
-- Execute após 20260831_final_stabilization.sql. É idempotente e não apaga dados.

create or replace function public.admin_create_walk_in(
  p_client_id uuid,
  p_professional_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_duration integer;
  v_ends_at timestamptz;
  v_membership uuid;
  v_id uuid;
  v_local timestamp;
  v_end_local timestamp;
  v_hours public.business_hours%rowtype;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if p_client_id is null or p_professional_id is null or p_service_id is null or p_starts_at is null then raise exception 'Dados do encaixe são obrigatórios.'; end if;
  if not exists(select 1 from public.profiles where id=p_client_id and role::text='client') then raise exception 'Cliente não encontrado.'; end if;
  if exists(select 1 from public.profiles where id=p_client_id and booking_blocked_until>now()) then raise exception 'Cliente bloqueado temporariamente para novos horários.'; end if;
  if not exists(select 1 from public.professionals where id=p_professional_id and active) then raise exception 'Profissional indisponível.'; end if;
  select duration_minutes into v_duration from public.services where id=p_service_id and active;
  if v_duration is null then raise exception 'Serviço indisponível.'; end if;
  if p_starts_at<=now() then raise exception 'Escolha um horário futuro.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_professional_id::text,0));
  v_ends_at:=p_starts_at+make_interval(mins=>greatest(v_duration,30));
  v_local:=p_starts_at at time zone 'America/Sao_Paulo';
  v_end_local:=v_ends_at at time zone 'America/Sao_Paulo';
  select * into v_hours from public.business_hours where weekday=extract(dow from v_local)::smallint;
  if v_hours is null or not v_hours.is_open or v_local::date<>v_end_local::date or v_local::time<v_hours.opens_at or v_end_local::time>v_hours.closes_at then raise exception 'Horário fora do funcionamento da barbearia.'; end if;
  if exists(select 1 from public.professional_time_off where professional_id=p_professional_id and tstzrange(starts_at,ends_at,'[)')&&tstzrange(p_starts_at,v_ends_at,'[)')) then raise exception 'O profissional está bloqueado neste período.'; end if;

  v_membership:=public.membership_for_service(p_client_id,p_service_id,p_starts_at);
  insert into public.appointments(client_id,professional_id,service_id,starts_at,ends_at,payment_mode,membership_id,admin_notes)
  values(p_client_id,p_professional_id,p_service_id,p_starts_at,v_ends_at,case when v_membership is null then 'at_shop'::public.payment_mode else 'membership'::public.payment_mode end,v_membership,'Encaixe criado pelo painel administrativo')
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  raise exception 'Este horário já está ocupado para o profissional.';
end;
$$;

create or replace function public.admin_block_slots(
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer default 30,
  p_occurrences integer default 1
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_index integer;
  v_start timestamptz;
  v_end timestamptz;
  v_local timestamp;
  v_end_local timestamp;
  v_hours public.business_hours%rowtype;
begin
  if not private.is_admin() then raise exception 'Acesso negado.'; end if;
  if p_professional_id is null or p_starts_at is null then raise exception 'Profissional e horário são obrigatórios.'; end if;
  if p_duration_minutes not between 30 and 480 or p_duration_minutes%30<>0 then raise exception 'A duração deve usar blocos de 30 minutos.'; end if;
  if p_occurrences not between 1 and 52 then raise exception 'A recorrência deve ter entre 1 e 52 ocorrências.'; end if;
  if not exists(select 1 from public.professionals where id=p_professional_id) then raise exception 'Profissional não encontrado.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_professional_id::text,0));
  for v_index in 0..p_occurrences-1 loop
    v_start:=p_starts_at+make_interval(days=>(7*v_index));
    v_end:=v_start+make_interval(mins=>p_duration_minutes);
    if v_start<=now() then raise exception 'Todos os bloqueios devem estar no futuro.'; end if;
    v_local:=v_start at time zone 'America/Sao_Paulo';
    v_end_local:=v_end at time zone 'America/Sao_Paulo';
    select * into v_hours from public.business_hours where weekday=extract(dow from v_local)::smallint;
    if v_hours is null or not v_hours.is_open or v_local::date<>v_end_local::date or v_local::time<v_hours.opens_at or v_end_local::time>v_hours.closes_at then raise exception 'Um dos bloqueios está fora do horário de funcionamento.'; end if;
    if exists(select 1 from public.appointments where professional_id=p_professional_id and status in ('scheduled','confirmed') and tstzrange(starts_at,ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Existe atendimento marcado em uma das ocorrências.'; end if;
    if exists(select 1 from public.professional_time_off where professional_id=p_professional_id and tstzrange(starts_at,ends_at,'[)')&&tstzrange(v_start,v_end,'[)')) then raise exception 'Um dos horários já está fechado.'; end if;
    insert into public.professional_time_off(professional_id,starts_at,ends_at,reason)
    values(p_professional_id,v_start,v_end,case when p_occurrences=1 then 'Bloqueio administrativo' else 'Bloqueio administrativo semanal' end);
  end loop;
  return p_occurrences;
end;
$$;

revoke all on function public.admin_create_walk_in(uuid,uuid,uuid,timestamptz) from public;
revoke all on function public.admin_block_slots(uuid,timestamptz,integer,integer) from public;
grant execute on function public.admin_create_walk_in(uuid,uuid,uuid,timestamptz) to authenticated;
grant execute on function public.admin_block_slots(uuid,timestamptz,integer,integer) to authenticated;
