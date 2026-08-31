import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type AdminAction =
  | { action:"appointment_status"; appointmentId:string; status:string }
  | { action:"service_update"; serviceId:string; name:string; priceCents:number; durationMinutes:number; active:boolean }
  | { action:"professional_active"; professionalId:string; active:boolean }
  | { action:"membership_assign"; clientId:string; planId:string }
  | { action:"membership_renew"; membershipId:string }
  | { action:"membership_remove"; membershipId:string };

const appointmentStatuses = ["scheduled","confirmed","completed","cancelled","no_show"];
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const failure = (message:string,status=400) => NextResponse.json({error:message},{status});

export async function POST(request:Request) {
  const supabase = await createClient();
  const {data:{user},error:userError} = await supabase.auth.getUser();
  if (userError || !user) return failure("Faça login para continuar.",401);

  // Reconfirma o cargo na sessão a cada alteração; o banco confirma de novo nos RPCs.
  const {data:profile} = await supabase.from("profiles").select("role").eq("id",user.id).single();
  if (profile?.role !== "admin") return failure("Acesso permitido somente para administradores.",403);

  let body:AdminAction;
  try { body = await request.json() as AdminAction; } catch { return failure("Solicitação inválida."); }

  if (body.action === "service_update") {
    const name = body.name?.trim();
    if (!uuid(body.serviceId) || typeof body.active !== "boolean" || !name) return failure("Dados do serviço inválidos.");
    if (!Number.isInteger(body.priceCents) || body.priceCents < 0) return failure("Valor inválido.");
    if (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 5 || body.durationMinutes > 480) return failure("Duração inválida.");
    const {error} = await supabase.rpc("admin_update_service",{p_service_id:body.serviceId,p_name:name,p_price_cents:body.priceCents,p_duration_minutes:body.durationMinutes,p_active:body.active});
    if (error) return failure(`Não foi possível salvar o serviço: ${error.message}`);
    return NextResponse.json({ok:true});
  }

  if (body.action === "professional_active") {
    if (!uuid(body.professionalId) || typeof body.active !== "boolean") return failure("Dados do profissional inválidos.");
    const {error} = await supabase.rpc("admin_set_professional_active",{p_professional_id:body.professionalId,p_active:body.active});
    if (error) return failure(`Não foi possível atualizar o profissional: ${error.message}`);
    return NextResponse.json({ok:true});
  }

  if (body.action === "membership_assign") {
    if (!uuid(body.clientId) || !uuid(body.planId)) return failure("Dados do plano inválidos.");
    const {data,error} = await supabase.rpc("admin_assign_membership",{p_client_id:body.clientId,p_plan_id:body.planId}).single();
    if (error) return failure(`Não foi possível atribuir o plano: ${error.message}`);
    return NextResponse.json({ok:true,membership:data});
  }

  if (body.action === "membership_renew") {
    if (!uuid(body.membershipId)) return failure("Plano inválido.");
    const {data,error} = await supabase.rpc("admin_renew_membership",{p_membership_id:body.membershipId}).single();
    if (error) return failure(`Não foi possível renovar o plano: ${error.message}`);
    return NextResponse.json({ok:true,membership:data});
  }

  if (body.action === "membership_remove") {
    if (!uuid(body.membershipId)) return failure("Plano inválido.");
    const {error} = await supabase.rpc("admin_remove_membership",{p_membership_id:body.membershipId});
    if (error) return failure(`Não foi possível remover o plano: ${error.message}`);
    return NextResponse.json({ok:true});
  }

  if (body.action === "appointment_status") {
    if (!uuid(body.appointmentId) || !appointmentStatuses.includes(body.status)) return failure("Status inválido.");
    if (body.status === "no_show") {
      const {data,error} = await supabase.rpc("admin_mark_no_show",{p_appointment_id:body.appointmentId});
      if (error) return failure(`Não foi possível registrar a falta: ${error.message}`);
      return NextResponse.json({ok:true,blockedUntil:data});
    }
    const now = new Date().toISOString();
    const {data,error} = await supabase.from("appointments").update({status:body.status,updated_at:now,...(body.status === "cancelled" ? {cancelled_at:now} : {})}).eq("id",body.appointmentId).in("status",["scheduled","confirmed"]).select("id");
    if (error) return failure(`Não foi possível atualizar o agendamento: ${error.message}`);
    if (!data?.length) return failure("Agendamento não encontrado ou já encerrado.",404);
    return NextResponse.json({ok:true});
  }

  return failure("Ação administrativa desconhecida.");
}
