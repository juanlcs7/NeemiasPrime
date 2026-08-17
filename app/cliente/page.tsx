import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientDashboard from "@/components/client-dashboard";

export const dynamic = "force-dynamic";

export default async function ClientePage() {
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); const userId=user?.id;
  if(!userId) redirect("/entrar");
  const [{data:profile},{data:services},{data:professionals},{data:appointments},{data:membership}]=await Promise.all([
    supabase.from("profiles").select("id,full_name,phone,role,booking_blocked_until").eq("id",userId).single(),
    supabase.from("services").select("id,name,price_cents,duration_minutes").eq("active",true).order("display_order"),
    supabase.from("professionals").select("id,name").eq("active",true).order("display_order"),
    supabase.from("appointments").select("id,service_id,professional_id,starts_at,ends_at,status,payment_mode,services(name,price_cents),professionals(name)").eq("client_id",userId).order("starts_at",{ascending:false}).limit(30),
    supabase.from("memberships").select("id,starts_on,ends_on,active,plans(name,price_cents)").eq("client_id",userId).eq("active",true).maybeSingle(),
  ]);
  const normalizedAppointments=(appointments||[]).map((item)=>({...item,services:Array.isArray(item.services)?item.services[0]??null:item.services,professionals:Array.isArray(item.professionals)?item.professionals[0]??null:item.professionals}));
  const normalizedMembership=membership?{...membership,plans:Array.isArray(membership.plans)?membership.plans[0]??null:membership.plans}:null;
  return <ClientDashboard profile={profile} services={services||[]} professionals={professionals||[]} appointments={normalizedAppointments} membership={normalizedMembership}/>;
}
