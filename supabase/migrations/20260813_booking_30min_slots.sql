-- Execute este arquivo no SQL Editor se o banco principal já foi configurado.
-- Padroniza a grade em intervalos de 30 minutos e mantém serviços longos bloqueados
-- durante toda a sua duração.

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
    select timezone('America/Sao_Paulo', slot_local) as slot_start, duration_minutes
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

grant execute on function public.available_slots(uuid,uuid,date) to authenticated;
grant execute on function public.create_appointment(uuid,uuid,timestamptz,text) to authenticated;
