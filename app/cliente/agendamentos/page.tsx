import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppointmentsDashboard from "@/components/appointments-dashboard";

export const dynamic = "force-dynamic";

export default async function AgendamentosPage() {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const userId=user?.id;
  if(!userId) redirect("/entrar?retorno=/cliente/agendamentos");
  const [{data:profile},{data:appointments},{data:professionals}]=await Promise.all([
    supabase.from("profiles").select("full_name,role,booking_blocked_until").eq("id",userId).single(),
    supabase.from("appointments").select("id,service_id,professional_id,starts_at,ends_at,status,payment_mode,services(name,price_cents,duration_minutes),professionals(name)").eq("client_id",userId).order("starts_at",{ascending:false}).limit(60),
    supabase.from("professionals").select("id,name").eq("active",true).order("display_order"),
  ]);
  const normalized=(appointments||[]).map(item=>({...item,services:Array.isArray(item.services)?item.services[0]??null:item.services,professionals:Array.isArray(item.professionals)?item.professionals[0]??null:item.professionals}));
  return <AppointmentsDashboard profile={profile} appointments={normalized} professionals={professionals||[]}/>;
}
