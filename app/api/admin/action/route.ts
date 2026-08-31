import "server-only";
import { NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type AdminAction =
  | { action:"appointment_status"; appointmentId:string; status:string }
  | { action:"service_update"; serviceId:string; name:string; priceCents:number; durationMinutes:number; active:boolean }
  | { action:"professional_active"; professionalId:string; active:boolean }
  | { action:"membership_assign"; clientId:string; planId:string }
  | { action:"membership_renew"; membershipId:string }
  | { action:"membership_remove"; membershipId:string }
  | { action:"client_password"; clientId:string; password:string }
  | { action:"walk_in_create"; clientId:string; professionalId:string; serviceId:string; startsAt:string }
  | { action:"time_block_create"; professionalId:string; startsAt:string; durationMinutes:number; occurrences:number };

const appointmentStatuses = ["scheduled","confirmed","completed","cancelled","no_show"];
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validDate = (value:unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const failure = (message:string,status=400) => NextResponse.json({error:message},{status});

function privilegedClient() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!secret)return null;
  return createSupabaseJsClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}

function bearerClient(accessToken:string) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)return null;
  return createSupabaseJsClient(url,key,{
    global:{headers:{Authorization:`Bearer ${accessToken}`}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
}

export async function POST(request:Request) {
  let supabase = await createClient();
  let {data:{user},error:userError} = await supabase.auth.getUser();
  const authorization=request.headers.get("authorization");
  const accessToken=authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if((userError||!user)&&accessToken){
    const authenticated=bearerClient(accessToken);
    if(authenticated){
      const verified=await authenticated.auth.getUser(accessToken);
      user=verified.data.user;
      userError=verified.error;
      if(user)supabase=authenticated;
    }
  }
  if (userError || !user) return failure("Faça login para continuar.",401);

  // O servidor confirma o cargo; cada RPC transacional confirma novamente no banco.
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
    const {data,error} = await supabase.rpc("admin_assign_membership",{p_client_id:body.clientId,p_plan_id:body.planId});
    if (error) return failure(`Não foi possível atribuir o plano: ${error.message}`);
    let membership=Array.isArray(data)?data[0]:data;
    if(!membership)return failure("O banco não retornou o plano criado. Reexecute a migração de estabilização.",409);
    // Compatibilidade com a função antiga, que retornava somente o UUID.
    if(typeof membership==="string"){
      const {data:row,error:rowError}=await supabase.from("memberships").select("id,client_id,plan_id,starts_on,ends_on,active,plans(name)").eq("id",membership).single();
      if(rowError||!row)return failure("O plano foi atribuído, mas o banco ainda usa a função antiga. Execute 20260831_final_stabilization.sql.",409);
      membership=row;
    }
    return NextResponse.json({ok:true,membership});
  }

  if (body.action === "membership_renew") {
    if (!uuid(body.membershipId)) return failure("Plano inválido.");
    const {data,error} = await supabase.rpc("admin_renew_membership",{p_membership_id:body.membershipId});
    if (error) return failure(`Não foi possível renovar o plano: ${error.message}`);
    const membership=Array.isArray(data)?data[0]:data;
    if(!membership)return failure("O banco não retornou o ciclo renovado.",409);
    return NextResponse.json({ok:true,membership});
  }

  if (body.action === "membership_remove") {
    if (!uuid(body.membershipId)) return failure("Plano inválido.");
    const {error} = await supabase.rpc("admin_remove_membership",{p_membership_id:body.membershipId});
    if (error) return failure(`Não foi possível remover o plano: ${error.message}`);
    return NextResponse.json({ok:true});
  }

  if(body.action==="client_password"){
    if(!uuid(body.clientId)||typeof body.password!=="string"||body.password.length<8||body.password.length>72)return failure("A senha deve ter entre 8 e 72 caracteres.");
    const admin=privilegedClient();
    if(!admin)return failure("Configure SUPABASE_SECRET_KEY na Vercel para definir senhas.",503);
    const {error}=await admin.auth.admin.updateUserById(body.clientId,{password:body.password});
    if(error)return failure(`Não foi possível definir a senha: ${error.message}`);
    return NextResponse.json({ok:true});
  }

  if(body.action==="walk_in_create"){
    if(!uuid(body.clientId)||!uuid(body.professionalId)||!uuid(body.serviceId)||!validDate(body.startsAt))return failure("Dados do encaixe inválidos.");
    const {data,error}=await supabase.rpc("admin_create_walk_in",{p_client_id:body.clientId,p_professional_id:body.professionalId,p_service_id:body.serviceId,p_starts_at:body.startsAt});
    if(error)return failure(`Não foi possível criar o encaixe: ${error.message}`);
    const {data:appointment,error:appointmentError}=await supabase.from("appointments").select("*,profiles!appointments_client_id_fkey(full_name,phone),professionals(id,name),services(name,price_cents,duration_minutes)").eq("id",data).single();
    if(appointmentError||!appointment)return failure("O encaixe foi criado, mas não foi possível atualizar a agenda. Recarregue a página.",409);
    return NextResponse.json({ok:true,appointmentId:data,appointment});
  }

  if(body.action==="time_block_create"){
    if(!uuid(body.professionalId)||!validDate(body.startsAt)||!Number.isInteger(body.durationMinutes)||body.durationMinutes<30||body.durationMinutes>480||!Number.isInteger(body.occurrences)||body.occurrences<1||body.occurrences>52)return failure("Dados do bloqueio inválidos.");
    const {data,error}=await supabase.rpc("admin_block_slots",{p_professional_id:body.professionalId,p_starts_at:body.startsAt,p_duration_minutes:body.durationMinutes,p_occurrences:body.occurrences});
    if(error)return failure(`Não foi possível fechar o horário: ${error.message}`);
    return NextResponse.json({ok:true,created:data});
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
