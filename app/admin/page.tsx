import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminDashboard from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect("/entrar?retorno=/admin");
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token)redirect("/entrar?retorno=/admin");
  const {data:profile} = await supabase.from("profiles").select("role,full_name").eq("id",user.id).single();
  if (profile?.role !== "admin") redirect("/cliente");

  const today = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const start = new Date(`${today}T00:00:00-03:00`);
  const end = new Date(start);
  end.setDate(end.getDate()+30);
  const [{data:appointments},{data:services},{data:professionals},{data:plans},{data:clients},{data:memberships}] = await Promise.all([
    supabase.from("appointments").select("id,starts_at,ends_at,status,payment_mode,client_id,services(id,name,price_cents),professionals(id,name),profiles!appointments_client_id_fkey(full_name,phone,booking_blocked_until)").gte("starts_at",start.toISOString()).lt("starts_at",end.toISOString()).order("starts_at"),
    supabase.from("services").select("id,name,price_cents,duration_minutes,active,display_order").order("display_order"),
    supabase.from("professionals").select("id,name,active,display_order,photo_url").order("display_order"),
    supabase.from("plans").select("id,name,price_cents,active,benefit_type,allowed_weekdays,cycle_months").order("price_cents"),
    supabase.from("profiles").select("id,full_name,phone,booking_blocked_until,created_at").eq("role","client").order("full_name"),
    supabase.from("memberships").select("id,client_id,plan_id,active,starts_on,ends_on,plans(name)").order("starts_on",{ascending:false}),
  ]);
  return <AdminDashboard accessToken={session.access_token} adminName={profile.full_name} appointments={appointments||[]} services={services||[]} professionals={professionals||[]} plans={plans||[]} clients={clients||[]} memberships={memberships||[]}/>;
}
