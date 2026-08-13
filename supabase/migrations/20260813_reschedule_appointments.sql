-- Adiciona a remarcação segura para bancos que já executaram a migração principal.
-- Não apaga nem altera os agendamentos existentes.

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

grant execute on function public.reschedule_my_appointment(uuid,uuid,timestamptz) to authenticated;
