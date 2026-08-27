import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminActionToken } from "@/lib/admin-token";
import AdminDashboard from "@/components/admin-dashboard";

export const dynamic="force-dynamic";
export default async function AdminPage(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();const userId=user?.id;if(!userId)redirect("/entrar?retorno=/admin");const {data:profile}=await supabase.from("profiles").select("role,full_name").eq("id",userId).single();if(profile?.role!=="admin")redirect("/cliente");const adminActionToken=createAdminActionToken(userId);
  const start=new Date();start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+30);
  const [{data:appointments},{data:services},{data:professionals},{data:plans},{data:clients},{data:memberships}]=await Promise.all([
    supabase.from("appointments").select("id,starts_at,ends_at,status,payment_mode,client_id,services(id,name,price_cents),professionals(id,name),profiles!appointments_client_id_fkey(full_name,phone,booking_blocked_until)").gte("starts_at",start.toISOString()).lt("starts_at",end.toISOString()).order("starts_at"),
    supabase.from("services").select("id,name,price_cents,duration_minutes,active,display_order").order("display_order"),
    supabase.from("professionals").select("id,name,active,display_order").order("display_order"),
    supabase.from("plans").select("id,name,price_cents,active,benefit_type,allowed_weekdays").order("price_cents"),
    supabase.from("profiles").select("id,full_name,phone,booking_blocked_until,created_at").eq("role","client").order("full_name"),
    supabase.from("memberships").select("id,client_id,plan_id,active,starts_on,ends_on,plans(name)").eq("active",true),
  ]);
  return <AdminDashboard adminName={profile.full_name} adminActionToken={adminActionToken} appointments={appointments||[]} services={services||[]} professionals={professionals||[]} plans={plans||[]} clients={clients||[]} memberships={memberships||[]}/>;
}
