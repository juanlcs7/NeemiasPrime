import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function monthlyEnd(start, months = 1) {
  const [year, month, day] = start.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay) - 1)).toISOString().slice(0, 10);
}

test("ciclo mensal calcula vencimentos reais inclusive em fevereiro", () => {
  assert.equal(monthlyEnd("2026-01-31"), "2026-02-27");
  assert.equal(monthlyEnd("2028-01-31"), "2028-02-28");
  assert.equal(monthlyEnd("2026-08-31"), "2026-09-29");
});

test("migração protege planos expirados, cobertura por ID e histórico", async () => {
  const sql = await read("supabase/migrations/20260831_final_stabilization.sql");
  assert.match(sql, /create table if not exists public\.plan_services/i);
  assert.match(sql, /m\.ends_on >= \(p_starts_at at time zone 'America\/Sao_Paulo'\)::date/i);
  assert.match(sql, /set active = false/i);
  assert.match(sql, /make_interval\(months => v_months\)/i);
  assert.match(sql, /for update/i);
});

test("operações administrativas exigem sessão e cargo de administrador", async () => {
  const route = await read("app/api/admin/action/route.ts");
  const dashboard = await read("components/admin-dashboard.tsx");
  assert.match(route, /import "server-only"/);
  assert.match(route, /supabase\.auth\.getUser\(\)/);
  assert.match(route, /authenticated\.auth\.getUser\(accessToken\)/);
  assert.match(dashboard, /Authorization=`Bearer \$\{session\.access_token\}`/);
  assert.match(route, /profile\?\.role !== "admin"/);
  assert.doesNotMatch(route, /Authorization:`Admin/);
  assert.match(route, /admin\.auth\.admin\.updateUserById/);
  for (const rpc of ["admin_assign_membership", "admin_renew_membership", "admin_remove_membership", "admin_mark_no_show"]) assert.match(route, new RegExp(`rpc\\("${rpc}"`));
});

test("encaixes e bloqueios recorrentes validam conflitos dentro do banco", async () => {
  const sql = await read("supabase/migrations/20260901_admin_scheduling_tools.sql");
  const route = await read("app/api/admin/action/route.ts");
  assert.match(sql, /create or replace function public\.admin_create_walk_in/);
  assert.match(sql, /create or replace function public\.admin_block_slots/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /p_occurrences not between 1 and 52/);
  assert.match(sql, /tstzrange\(starts_at,ends_at,'\[\)'\)&&tstzrange\(v_start,v_end,'\[\)'\)/);
  assert.match(route, /rpc\("admin_create_walk_in"/);
  assert.match(route, /rpc\("admin_block_slots"/);
});

test("falta e bloqueio de 24 horas pertencem à mesma operação transacional", async () => {
  const sql = await read("supabase/migrations/20260831_final_stabilization.sql");
  const fn = sql.slice(sql.indexOf("create or replace function public.admin_mark_no_show"));
  assert.match(fn, /starts_at \+ interval '15 minutes' > now\(\)/);
  assert.match(fn, /set status = 'no_show'/);
  assert.match(fn, /booking_blocked_until = v_blocked_until/);
  assert.match(fn, /interval '24 hours'/);
});

test("criação, choque, cancelamento, reagendamento e funcionamento continuam no banco", async () => {
  const core = await read("supabase/migrations/20260813_neemias_prime_core.sql");
  const reschedule = await read("supabase/migrations/20260813_reschedule_appointments.sql");
  assert.match(core, /no_professional_overlap/);
  assert.match(core, /Horário fora do funcionamento/);
  assert.match(core, /create or replace function public\.cancel_my_appointment/);
  assert.match(reschedule, /create or replace function public\.reschedule_my_appointment/);
});

test("navegação interna conserva as cinco áreas e endereço legado redireciona", async () => {
  const nav = await read("components/client-navigation.tsx");
  const legacy = await read("app/cliente/agendamentos/page.tsx");
  for (const label of ["Início", "Agendar", "Horários", "Plano", "Perfil"]) assert.match(nav, new RegExp(label));
  assert.match(legacy, /redirect\("\/cliente#meus-agendamentos"\)/);
});

test("agendamento oferece etapas navegáveis e layouts próprios para desktop e mobile", async () => {
  const dashboard = await read("components/client-dashboard.tsx");
  const styles = await read("components/client-dashboard.module.css");
  assert.match(dashboard, /data-booking-stage="1"/);
  assert.match(dashboard, /aria-current=\{bookingStage===stage\?"step"/);
  assert.match(dashboard, /navigateBookingStage/);
  assert.match(dashboard, /setSuccess\(false\);showAppointments\(\)/);
  for (const service of ["corte","corte + barba","corte infantil","hidratacao","relaxamento capilar","sobrancelha"]) assert.match(dashboard, new RegExp(service.replace("+", "\\+")));
  assert.match(styles, /@media\(min-width:1050px\)/);
  assert.match(styles, /@media\(max-width:850px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});
