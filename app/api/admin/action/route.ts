import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseKey, verifyAdminActionToken } from "@/lib/admin-token";

type AdminAction =
  | { action:"appointment_status"; appointmentId:string; status:string }
  | { action:"service_update"; serviceId:string; name:string; priceCents:number; durationMinutes:number; active:boolean }
  | { action:"professional_active"; professionalId:string; active:boolean }
  | { action:"membership_assign"; clientId:string; planId:string|null };

const appointmentStatuses = ["scheduled","confirmed","completed","cancelled","no_show"];

function failure(message:string,status=400){return NextResponse.json({error:message},{status});}

export async function POST(request:Request){
  const authorization=request.headers.get("authorization");
  const token=authorization?.startsWith("Admin ")?authorization.slice(6):null;
  const verified=token?verifyAdminActionToken(token):null;
  if(!verified)return failure("Autorização administrativa inválida ou expirada.",401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if(!url)return failure("Supabase não configurado no servidor.",500);
  let key:string;try{key=getAdminSupabaseKey();}catch{return failure("Chave administrativa não configurada na Vercel.",500);}
  const supabase=createSupabaseClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data:profile}=await supabase.from("profiles").select("role").eq("id",verified.userId).single();
  if(profile?.role!=="admin")return failure("Acesso permitido somente para administradores.",403);

  let body:AdminAction;
  try{body=await request.json() as AdminAction;}catch{return failure("Solicitação inválida.");}

  if(body.action==="service_update"){
    const name=body.name?.trim();
    if(!name)return failure("Informe o nome do serviço.");
    if(!Number.isInteger(body.priceCents)||body.priceCents<0)return failure("Valor inválido.");
    if(!Number.isInteger(body.durationMinutes)||body.durationMinutes<5||body.durationMinutes>480)return failure("Duração inválida.");
    const {error}=await supabase.from("services").update({name,price_cents:body.priceCents,duration_minutes:body.durationMinutes,active:body.active,updated_at:new Date().toISOString()}).eq("id",body.serviceId);
    if(error)return failure(`Não foi possível salvar o serviço: ${error.message}`);
    return NextResponse.json({ok:true});
  }

  if(body.action==="professional_active"){
    const {error}=await supabase.from("professionals").update({active:body.active}).eq("id",body.professionalId);
    if(error)return failure(`Não foi possível atualizar o profissional: ${error.message}`);
    return NextResponse.json({ok:true});
  }

  if(body.action==="membership_assign"){
    const {error:deactivateError}=await supabase.from("memberships").update({active:false,ends_on:new Date().toISOString().slice(0,10)}).eq("client_id",body.clientId).eq("active",true);
    if(deactivateError)return failure(`Não foi possível atualizar o plano: ${deactivateError.message}`);
    if(!body.planId)return NextResponse.json({ok:true,membershipId:null});
    const today=new Date().toISOString().slice(0,10);
    const {data,error}=await supabase.from("memberships").upsert({client_id:body.clientId,plan_id:body.planId,starts_on:today,ends_on:null,active:true},{onConflict:"client_id,plan_id,starts_on"}).select("id").single();
    if(error)return failure(`Não foi possível atribuir o plano: ${error.message}`);
    return NextResponse.json({ok:true,membershipId:data.id});
  }

  if(body.action==="appointment_status"){
    if(!appointmentStatuses.includes(body.status))return failure("Status inválido.");
    if(body.status==="no_show"){
      const {data:appointment,error:readError}=await supabase.from("appointments").select("client_id,starts_at,status").eq("id",body.appointmentId).single();
      if(readError||!appointment)return failure("Agendamento não encontrado.",404);
      if(!["scheduled","confirmed"].includes(appointment.status))return failure("Este agendamento já foi encerrado.");
      if(new Date(appointment.starts_at).getTime()+15*60_000>Date.now())return failure("A falta só pode ser registrada após 15 minutos de atraso.");
      const blockedUntil=new Date(Date.now()+24*60*60_000).toISOString();
      const {error:appointmentError}=await supabase.from("appointments").update({status:"no_show",no_show_marked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",body.appointmentId);
      if(appointmentError)return failure(`Não foi possível registrar a falta: ${appointmentError.message}`);
      const {error:profileError}=await supabase.from("profiles").update({booking_blocked_until:blockedUntil,updated_at:new Date().toISOString()}).eq("id",appointment.client_id);
      if(profileError)return failure(`A falta foi registrada, mas o bloqueio falhou: ${profileError.message}`);
      return NextResponse.json({ok:true});
    }
    const update:{status:string;updated_at:string;cancelled_at?:string}={status:body.status,updated_at:new Date().toISOString()};
    if(body.status==="cancelled")update.cancelled_at=new Date().toISOString();
    const {error}=await supabase.from("appointments").update(update).eq("id",body.appointmentId);
    if(error)return failure(`Não foi possível atualizar o agendamento: ${error.message}`);
    return NextResponse.json({ok:true});
  }

  return failure("Ação administrativa desconhecida.");
}
