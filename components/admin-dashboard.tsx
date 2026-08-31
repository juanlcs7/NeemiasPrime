/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./admin-dashboard.module.css";

type Item = Record<string, any>;
type Tab = "overview" | "agenda" | "clientes" | "servicos" | "equipe";

const money = (cents = 0) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const dateKey = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(value));
const dayLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)).replace(".", "");
const timeLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const initials = (name = "Cliente") => name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const whatsapp = (phone = "") => { const digits=phone.replace(/\D/g, ""); return `https://wa.me/${digits.startsWith("55")?digits:`55${digits}`}`; };
const statusLabel: Record<string, string> = { scheduled: "Agendado", confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado", no_show: "Não compareceu" };
const statusTone: Record<string, string> = { scheduled: "blue", confirmed: "green", completed: "neutral", cancelled: "red", no_show: "orange" };
const DEFAULT_CLIENT_PASSWORD="Clienteprime123";
function saoPauloIso(value:string){const date=new Date(`${value}:00-03:00`);if(!Number.isFinite(date.getTime()))throw new Error("Data e horário inválidos.");return date.toISOString();}
function planState(membership: Item) {
  const today=dateKey(new Date());
  if(!membership?.active)return "Encerrado";
  if(!membership.ends_on||membership.ends_on<today)return "Vencido";
  const days=Math.round((Date.parse(`${membership.ends_on}T00:00:00Z`)-Date.parse(`${today}T00:00:00Z`))/86400000);
  return days<=5?`Vence em ${days} dia${days===1?"":"s"}`:"Ativo";
}

const nav: { id: Tab; label: string; short: string }[] = [
  { id: "overview", label: "Visão geral", short: "VG" },
  { id: "agenda", label: "Agenda", short: "AG" },
  { id: "clientes", label: "Clientes", short: "CL" },
  { id: "servicos", label: "Serviços", short: "SV" },
  { id: "equipe", label: "Equipe", short: "EQ" },
];

export default function AdminDashboard({ adminName, appointments: initialAppointments, services: initialServices, professionals: initialPros, plans, clients, memberships }: any) {
  const [tab, setTab] = useState<Tab>("overview");
  const [appointments, setAppointments] = useState<Item[]>(initialAppointments);
  const [services, setServices] = useState<Item[]>(initialServices);
  const [pros, setPros] = useState<Item[]>(initialPros);
  const [memberRows, setMemberRows] = useState<Item[]>(memberships);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState("");
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("today");
  const [statusFilter, setStatusFilter] = useState("all");
  const [proFilter, setProFilter] = useState("all");
  const [clientSearch, setClientSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("active");
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => { const timer=window.setInterval(() => setClock(Date.now()), 30000); return () => window.clearInterval(timer); }, []);

  const today = dateKey(new Date());
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = dateKey(tomorrowDate);
  const activeStatuses = ["scheduled", "confirmed"];
  const todayAppointments = useMemo(() => appointments.filter((a) => dateKey(a.starts_at) === today), [appointments, today]);
  const activeToday = todayAppointments.filter((a) => activeStatuses.includes(a.status));
  const nextAppointment = appointments.find((a) => activeStatuses.includes(a.status) && new Date(a.starts_at) >= new Date());
  const todayRevenue = todayAppointments.filter((a) => a.status !== "cancelled" && a.status !== "no_show" && a.payment_mode !== "membership").reduce((total, a) => total + (a.services?.price_cents || 0), 0);
  const todayMembers = todayAppointments.filter((a) => a.payment_mode === "membership" && a.status !== "cancelled").length;

  const appointmentView = useMemo(() => {
    const maxWeek = new Date(); maxWeek.setDate(maxWeek.getDate() + 7);
    const term = appointmentSearch.toLowerCase().trim();
    return appointments.filter((a) => {
      const key = dateKey(a.starts_at);
      const dateOk = dateFilter === "all" || (dateFilter === "today" && key === today) || (dateFilter === "tomorrow" && key === tomorrow) || (dateFilter === "week" && new Date(a.starts_at) < maxWeek && new Date(a.starts_at) >= new Date(new Date().setHours(0, 0, 0, 0)));
      const searchOk = !term || a.profiles?.full_name?.toLowerCase().includes(term) || a.profiles?.phone?.includes(term) || a.services?.name?.toLowerCase().includes(term);
      return dateOk && searchOk && (statusFilter === "all" || a.status === statusFilter) && (proFilter === "all" || a.professionals?.id === proFilter);
    });
  }, [appointments, appointmentSearch, dateFilter, statusFilter, proFilter, today, tomorrow]);

  const membershipByClient = useMemo(() => new Map(memberRows.filter((m) => m.active).map((m) => [m.client_id, m])), [memberRows]);
  const clientView = useMemo(() => {
    const term = clientSearch.toLowerCase().trim();
    return clients.filter((client: Item) => {
      const member = membershipByClient.has(client.id);
      const blocked = client.booking_blocked_until && new Date(client.booking_blocked_until) > new Date();
      const typeOk = clientFilter === "all" || (clientFilter === "members" && member) || (clientFilter === "without" && !member) || (clientFilter === "blocked" && blocked);
      return typeOk && (!term || client.full_name?.toLowerCase().includes(term) || client.phone?.includes(term));
    });
  }, [clients, clientSearch, clientFilter, membershipByClient]);

  const serviceView = services.filter((service) => (serviceFilter === "all" || (serviceFilter === "active" ? service.active : !service.active)) && service.name.toLowerCase().includes(serviceSearch.toLowerCase()));

  function notify(message: string) { setFeedback(message); window.setTimeout(() => setFeedback(""), 4000); }

  async function adminAction(payload:Record<string,unknown>){
    const {data:{session}}=await createClient().auth.getSession();
    const headers:Record<string,string>={"Content-Type":"application/json"};
    if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
    const response=await fetch("/api/admin/action",{method:"POST",credentials:"include",cache:"no-store",headers,body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({error:"Resposta inválida do servidor."}));
    if(!response.ok)throw new Error(result.error||"Não foi possível concluir a alteração.");
    return result;
  }

  async function changeStatus(id: string, nextStatus: string) {
    if (nextStatus === "no_show" && !window.confirm("Marcar como não compareceu? O cliente ficará bloqueado por 24 horas.")) return;
    if (nextStatus === "cancelled" && !window.confirm("Cancelar este agendamento? Esta ação ficará registrada no histórico.")) return;
    setBusy(id + nextStatus);
    let error:Error|null=null;try{await adminAction({action:"appointment_status",appointmentId:id,status:nextStatus});}catch(cause){error=cause instanceof Error?cause:new Error("Falha desconhecida.");}
    setBusy("");
    if (error) return notify(`Não foi possível atualizar: ${error.message}`);
    setAppointments((rows) => rows.map((row) => row.id === id ? { ...row, status: nextStatus } : row));
    notify(nextStatus === "no_show" ? "Falta registrada e cliente bloqueado por 24 horas." : `Agendamento marcado como ${statusLabel[nextStatus].toLowerCase()}.`);
  }

  async function saveService(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); setBusy(id + "service");
    const form = new FormData(event.currentTarget);
    const payload = { name: String(form.get("name")), price_cents: Math.round(Number(form.get("price")) * 100), duration_minutes: Number(form.get("duration")), active: form.get("active") === "on" };
    let error:Error|null=null;try{await adminAction({action:"service_update",serviceId:id,name:payload.name,priceCents:payload.price_cents,durationMinutes:payload.duration_minutes,active:payload.active});}catch(cause){error=cause instanceof Error?cause:new Error("Falha desconhecida.");}
    setBusy("");
    if (error) return notify(`Erro ao salvar: ${error.message}`);
    setServices((rows) => rows.map((row) => row.id === id ? { ...row, ...payload } : row));
    notify("Serviço atualizado com sucesso.");
  }

  async function toggleProfessional(id: string, active: boolean) {
    setBusy(id + "pro");
    let error:Error|null=null;try{await adminAction({action:"professional_active",professionalId:id,active});}catch(cause){error=cause instanceof Error?cause:new Error("Falha desconhecida.");}
    setBusy("");
    if (error) return notify(`Erro ao atualizar profissional: ${error.message}`);
    setPros((rows) => rows.map((row) => row.id === id ? { ...row, active } : row)); notify(active ? "Profissional disponível para agendamentos." : "Profissional pausado na agenda.");
  }

  async function assignPlan(clientId: string, planId: string) {
    setBusy(clientId + "plan");
    const current=membershipByClient.get(clientId);
    let data:any=null;let error:Error|null=null;try{data=planId?await adminAction({action:"membership_assign",clientId,planId}):await adminAction({action:"membership_remove",membershipId:current?.id});}catch(cause){error=cause instanceof Error?cause:new Error("Falha desconhecida.");}
    setBusy("");
    if (error) return notify(`Erro ao atribuir plano: ${error.message}`);
    if (!planId) setMemberRows((rows) => rows.map((row) => row.id === current?.id ? {...row,active:false} : row));
    else {
      const plan = plans.find((row: Item) => row.id === planId);
      const membership=data?.membership;
      const updated = { id: membership?.id || crypto.randomUUID(), client_id: clientId, plan_id: planId, active: true, starts_on:membership?.starts_on, ends_on:membership?.ends_on, plans: { name: plan?.name } };
      setMemberRows((rows) => [...rows.map((row) => row.client_id === clientId ? {...row,active:false} : row), updated]);
    }
    notify(planId ? "Plano do cliente atualizado." : "Plano removido do cliente.");
  }

  async function renewPlan(membership: Item) {
    setBusy(membership.id + "renew");
    let data:any=null;let error:Error|null=null;try{data=await adminAction({action:"membership_renew",membershipId:membership.id});}catch(cause){error=cause instanceof Error?cause:new Error("Falha desconhecida.");}
    setBusy("");
    if(error)return notify(`Não foi possível renovar: ${error.message}`);
    setMemberRows((rows)=>rows.map((row)=>row.id===membership.id?{...row,ends_on:data?.membership?.ends_on||row.ends_on}:row));
    notify("Plano renovado para um novo ciclo mensal.");
  }

  async function setClientPassword(client:Item){
    const password=window.prompt(`Nova senha para ${client.full_name}:`,DEFAULT_CLIENT_PASSWORD);
    if(password===null)return;
    setBusy(client.id+"password");
    let error:Error|null=null;try{await adminAction({action:"client_password",clientId:client.id,password});}catch(cause){error=cause instanceof Error?cause:new Error("Falha desconhecida.");}
    setBusy("");
    if(error)return notify(`Erro ao definir senha: ${error.message}`);
    notify("Senha do cliente atualizada. Oriente a troca após o primeiro acesso.");
  }

  async function createWalkIn(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const formElement=event.currentTarget;const form=new FormData(formElement);setBusy("walk-in");
    let result:any=null;let error:Error|null=null;try{result=await adminAction({action:"walk_in_create",clientId:String(form.get("clientId")),professionalId:String(form.get("professionalId")),serviceId:String(form.get("serviceId")),startsAt:saoPauloIso(String(form.get("startsAt")))});}catch(cause){error=cause instanceof Error?cause:new Error("Falha desconhecida.");}
    setBusy("");if(error)return notify(`Erro no encaixe: ${error.message}`);if(result?.appointment)setAppointments((rows)=>[result.appointment,...rows]);formElement.reset();notify(`Encaixe criado com sucesso${result?.appointmentId?".":""}`);
  }

  async function blockSlots(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const formElement=event.currentTarget;const form=new FormData(formElement);setBusy("time-block");
    let result:any=null;let error:Error|null=null;try{result=await adminAction({action:"time_block_create",professionalId:String(form.get("professionalId")),startsAt:saoPauloIso(String(form.get("startsAt"))),durationMinutes:Number(form.get("durationMinutes")),occurrences:Number(form.get("occurrences"))});}catch(cause){error=cause instanceof Error?cause:new Error("Falha desconhecida.");}
    setBusy("");if(error)return notify(`Erro ao fechar horário: ${error.message}`);formElement.reset();notify(`${result?.created||1} horário${Number(result?.created||1)===1?"":"s"} fechado${Number(result?.created||1)===1?"":"s"} com sucesso.`);
  }

  function openAgenda(filter = "today") { setDateFilter(filter); setStatusFilter("all"); setProFilter("all"); setTab("agenda"); }

  return <div className={styles.root}>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}><Image src="/logo-neemias-prime.png" width={42} height={42} alt="Neemias Prime"/><span>NEEMIAS<small>PRIME</small></span></Link>
      <div className={styles.adminTag}><span>{initials(adminName)}</span><div><strong>{adminName || "Administrador"}</strong><small>Administração</small></div></div>
      <nav>{nav.map((item) => <button type="button" key={item.id} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? styles.activeNav : ""} onClick={() => setTab(item.id)}><i>{item.short}</i>{item.label}{item.id === "agenda" && activeToday.length > 0 && <b>{activeToday.length}</b>}</button>)}</nav>
      <div className={styles.sideFooter}><Link prefetch={false} href="/cliente">Ver área do cliente</Link><Link href="/sair">Sair da conta</Link></div>
    </aside>

    <header className={styles.mobileHeader}><Link href="/"><Image src="/logo-neemias-prime.png" width={38} height={38} alt="Neemias Prime"/></Link><div><small>Administração</small><strong>{adminName?.split(" ")[0]}</strong></div><Link href="/sair" className={styles.mobileLogout}>Sair</Link></header>

    <main className={styles.main}>
      {feedback && <div className={styles.toast} role="status" aria-live="polite"><span><Image src="/logo-neemias-prime.png" alt="" width={22} height={22}/></span>{feedback}</div>}
      {tab === "overview" && <Overview adminName={adminName} todayAppointments={todayAppointments} activeToday={activeToday} nextAppointment={nextAppointment} todayRevenue={todayRevenue} todayMembers={todayMembers} professionals={pros} openAgenda={openAgenda} setTab={setTab}/>} 
      {tab === "agenda" && <Agenda appointments={appointmentView} search={appointmentSearch} setSearch={setAppointmentSearch} dateFilter={dateFilter} setDateFilter={setDateFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} proFilter={proFilter} setProFilter={setProFilter} professionals={pros} services={services} clients={clients} busy={busy} changeStatus={changeStatus} createWalkIn={createWalkIn} blockSlots={blockSlots} clock={clock}/>}
      {tab === "clientes" && <Clients clients={clientView} allClients={clients} plans={plans} memberships={membershipByClient} search={clientSearch} setSearch={setClientSearch} filter={clientFilter} setFilter={setClientFilter} busy={busy} assignPlan={assignPlan} renewPlan={renewPlan} setClientPassword={setClientPassword}/>}
      {tab === "servicos" && <Services services={serviceView} total={services.length} search={serviceSearch} setSearch={setServiceSearch} filter={serviceFilter} setFilter={setServiceFilter} busy={busy} saveService={saveService}/>} 
      {tab === "equipe" && <Team professionals={pros} appointments={appointments} busy={busy} toggleProfessional={toggleProfessional} openAgenda={openAgenda}/>} 
    </main>

    <nav className={styles.mobileNav} aria-label="Navegação administrativa">{nav.map((item) => <button type="button" key={item.id} aria-current={tab === item.id ? "page" : undefined} className={tab === item.id ? styles.activeMobile : ""} onClick={() => setTab(item.id)}><i>{item.short}</i><span>{item.label.replace("Visão geral", "Início")}</span></button>)}</nav>
  </div>;
}

function PageHead({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <header className={styles.pageHead}><div><span>{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</header>;
}

function Overview({ adminName, todayAppointments, activeToday, nextAppointment, todayRevenue, todayMembers, professionals, openAgenda, setTab }: any) {
  const confirmed = todayAppointments.filter((a: Item) => a.status === "confirmed").length;
  return <>
    <PageHead eyebrow="CENTRAL DE OPERAÇÕES" title={`Olá, ${adminName?.split(" ")[0] || "admin"}.`} text="Tudo que importa para o funcionamento da barbearia, em um só lugar." action={<button className={styles.primaryButton} onClick={() => openAgenda("today")}>Abrir agenda de hoje</button>}/>
    <section className={styles.metrics}>
      <button onClick={() => openAgenda("today")}><span>Hoje</span><strong>{activeToday.length}</strong><small>horários ativos</small></button>
      <button onClick={() => openAgenda("today")}><span>Confirmados</span><strong>{confirmed}</strong><small>clientes confirmados</small></button>
      <button onClick={() => setTab("clientes")}><span>Planos</span><strong>{todayMembers}</strong><small>atendimentos no plano</small></button>
      <div><span>Receita prevista</span><strong>{money(todayRevenue)}</strong><small>pagamentos na barbearia</small></div>
    </section>
    <section className={styles.overviewGrid}>
      <article className={styles.nextCard}>
        <div className={styles.sectionTitle}><div><span>PRÓXIMO ATENDIMENTO</span><h2>Na cadeira</h2></div><button onClick={() => openAgenda("all")}>Ver agenda</button></div>
        {nextAppointment ? <div className={styles.nextContent}><div className={styles.bigTime}>{timeLabel(nextAppointment.starts_at)}</div><div className={styles.nextInfo}><span className={styles.avatar}>{initials(nextAppointment.profiles?.full_name)}</span><div><strong>{nextAppointment.profiles?.full_name}</strong><p>{nextAppointment.services?.name} · {nextAppointment.professionals?.name}</p><small>{dayLabel(nextAppointment.starts_at)} · {nextAppointment.payment_mode === "membership" ? "Plano ativo" : money(nextAppointment.services?.price_cents)}</small></div></div></div> : <Empty title="Agenda livre" text="Nenhum próximo atendimento encontrado."/>}
      </article>
      <article className={styles.todayCard}>
        <div className={styles.sectionTitle}><div><span>RITMO DO DIA</span><h2>Agenda de hoje</h2></div><em>{activeToday.length} ativos</em></div>
        <div className={styles.timeline}>{todayAppointments.slice(0, 5).map((a: Item) => <button key={a.id} onClick={() => openAgenda("today")}><time>{timeLabel(a.starts_at)}</time><span><strong>{a.profiles?.full_name}</strong><small>{a.services?.name} com {a.professionals?.name}</small></span><i className={`${styles.dot} ${styles[statusTone[a.status]]}`}/></button>)}</div>
        {!todayAppointments.length && <Empty title="Dia tranquilo" text="Ainda não há horários marcados para hoje."/>}
      </article>
    </section>
    <section className={styles.teamStrip}><div><span>EQUIPE HOJE</span><strong>{professionals.filter((p: Item) => p.active).length} profissionais disponíveis</strong></div>{professionals.map((p: Item) => <span key={p.id} className={p.active ? styles.proOn : styles.proOff}>{initials(p.name)}<small>{p.name.split(" ")[0]}</small></span>)}</section>
  </>;
}

function Agenda({ appointments, search, setSearch, dateFilter, setDateFilter, statusFilter, setStatusFilter, proFilter, setProFilter, professionals, services, clients, busy, changeStatus, createWalkIn, blockSlots, clock }: any) {
  return <><PageHead eyebrow="ATENDIMENTOS" title="Agenda" text="Encontre horários rapidamente e atualize cada etapa do atendimento."/>
    <ScheduleTools clients={clients} professionals={professionals} services={services} busy={busy} createWalkIn={createWalkIn} blockSlots={blockSlots}/>
    <section className={styles.filters}>
      <label className={styles.search}><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente, telefone ou serviço"/></label>
      <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}><option value="today">Hoje</option><option value="tomorrow">Amanhã</option><option value="week">Próximos 7 dias</option><option value="all">Próximos 30 dias</option></select>
      <select value={proFilter} onChange={(e) => setProFilter(e.target.value)}><option value="all">Todos os barbeiros</option>{professionals.map((p: Item) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="all">Todos os status</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </section>
    <div className={styles.resultLine}><strong>{appointments.length}</strong> atendimento{appointments.length === 1 ? "" : "s"} encontrado{appointments.length === 1 ? "" : "s"}</div>
    <section className={styles.appointmentList}>{appointments.map((a: Item) => <AppointmentCard key={a.id} appointment={a} busy={busy} changeStatus={changeStatus} clock={clock}/>)}</section>
    {!appointments.length && <Empty title="Nada por aqui" text="Tente mudar os filtros ou confira outro período."/>}
  </>;
}

function ScheduleTools({clients,professionals,services,busy,createWalkIn,blockSlots}:any){
  return <section className={styles.scheduleTools}>
    <form onSubmit={createWalkIn}><header><span>ENCAIXE</span><h2>Adicionar cliente à agenda</h2><p>Cria um atendimento respeitando expediente, bloqueios e conflitos.</p></header><div><label>Cliente<select name="clientId" required defaultValue=""><option value="" disabled>Escolha o cliente</option>{clients.map((client:Item)=><option key={client.id} value={client.id}>{client.full_name||"Cliente sem nome"}</option>)}</select></label><label>Profissional<select name="professionalId" required defaultValue=""><option value="" disabled>Escolha o profissional</option>{professionals.filter((item:Item)=>item.active).map((item:Item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Serviço<select name="serviceId" required defaultValue=""><option value="" disabled>Escolha o serviço</option>{services.filter((item:Item)=>item.active).map((item:Item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Data e horário<input name="startsAt" type="datetime-local" step="1800" required/></label></div><button disabled={busy==="walk-in"}>{busy==="walk-in"?"Criando encaixe...":"Criar encaixe"}</button></form>
    <form onSubmit={blockSlots}><header><span>FECHAR HORÁRIO</span><h2>Bloquear disponibilidade</h2><p>Fecha um período único ou repete o bloqueio semanalmente.</p></header><div><label>Profissional<select name="professionalId" required defaultValue=""><option value="" disabled>Escolha o profissional</option>{professionals.map((item:Item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Início<input name="startsAt" type="datetime-local" step="1800" required/></label><label>Duração<select name="durationMinutes" defaultValue="30"><option value="30">30 minutos</option><option value="60">1 hora</option><option value="90">1h30</option><option value="120">2 horas</option><option value="240">4 horas</option></select></label><label>Recorrência<select name="occurrences" defaultValue="1"><option value="1">Não recorrente</option><option value="4">Semanal · 4 vezes</option><option value="8">Semanal · 8 vezes</option><option value="12">Semanal · 12 vezes</option></select></label></div><button disabled={busy==="time-block"}>{busy==="time-block"?"Fechando horários...":"Fechar horário"}</button></form>
  </section>;
}

function AppointmentCard({ appointment: a, busy, changeStatus, clock }: any) {
  const canNoShow = clock >= new Date(a.starts_at).getTime() + 15 * 60 * 1000;
  const finished = ["completed", "cancelled", "no_show"].includes(a.status);
  return <article className={styles.appointmentCard}>
    <div className={styles.dateBlock}><strong>{timeLabel(a.starts_at)}</strong><span>{dayLabel(a.starts_at)}</span></div>
    <div className={styles.personBlock}><span className={styles.avatar}>{initials(a.profiles?.full_name)}</span><div><strong>{a.profiles?.full_name || "Cliente"}</strong>{a.profiles?.phone?<a href={whatsapp(a.profiles.phone)} target="_blank" rel="noreferrer">{a.profiles.phone} · WhatsApp</a>:<small className={styles.noContact}>Sem telefone cadastrado</small>}</div></div>
    <div className={styles.serviceBlock}><span>{a.services?.name}</span><small>{a.professionals?.name} · {a.payment_mode === "membership" ? "Incluso no plano" : money(a.services?.price_cents)}</small></div>
    <span className={`${styles.status} ${styles[statusTone[a.status]]}`}>{statusLabel[a.status]}</span>
    <div className={styles.actions}>
      {!finished && a.status === "scheduled" && <button disabled={busy} onClick={() => changeStatus(a.id, "confirmed")}>Confirmar</button>}
      {!finished && <button disabled={busy} className={styles.actionMain} onClick={() => changeStatus(a.id, "completed")}>Concluir</button>}
      {!finished && <button disabled={busy || !canNoShow} title={!canNoShow ? "Disponível 15 minutos após o horário" : ""} className={styles.dangerText} onClick={() => changeStatus(a.id, "no_show")}>Faltou</button>}
      {!finished && <button disabled={busy} className={styles.iconButton} title="Cancelar" onClick={() => changeStatus(a.id, "cancelled")}>×</button>}
    </div>
  </article>;
}

function Clients({ clients, allClients, plans, memberships, search, setSearch, filter, setFilter, busy, assignPlan, renewPlan, setClientPassword }: any) {
  const blockedCount = allClients.filter((c: Item) => c.booking_blocked_until && new Date(c.booking_blocked_until) > new Date()).length;
  return <><PageHead eyebrow="RELACIONAMENTO" title="Clientes e planos" text="Consulte contatos, identifique bloqueios e gerencie o clube mensal sem sair da tela."/>
    <section className={styles.clientSummary}><div><strong>{allClients.length}</strong><span>clientes cadastrados</span></div><div><strong>{memberships.size}</strong><span>planos ativos</span></div><div><strong>{blockedCount}</strong><span>bloqueados agora</span></div></section>
    <section className={styles.filters}><label className={styles.search}><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou telefone"/></label><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos os clientes</option><option value="members">Com plano</option><option value="without">Sem plano</option><option value="blocked">Bloqueados</option></select></section>
    <section className={styles.clientGrid}>{clients.map((client: Item) => { const membership = memberships.get(client.id); const blocked = client.booking_blocked_until && new Date(client.booking_blocked_until) > new Date(); return <article className={styles.clientCard} key={client.id}>
      <div className={styles.clientIdentity}><span className={styles.avatar}>{initials(client.full_name)}</span><div><strong>{client.full_name}</strong>{client.phone?<a href={whatsapp(client.phone)} target="_blank" rel="noreferrer">{client.phone}</a>:<small className={styles.noContact}>Sem telefone cadastrado</small>}</div>{blocked && <em>Bloqueado</em>}</div>
      <div className={styles.planControl}><label>Plano atual</label><select disabled={busy === client.id + "plan"} value={membership?.plan_id || ""} onChange={(e) => assignPlan(client.id, e.target.value)}><option value="">Sem plano</option>{plans.filter((p: Item) => p.active).map((plan: Item) => <option key={plan.id} value={plan.id}>{plan.name} · {money(plan.price_cents)}</option>)}</select>{membership?<><small>{planState(membership)} · até {membership.ends_on}</small><button type="button" disabled={busy===membership.id+"renew"} onClick={()=>renewPlan(membership)}>{busy===membership.id+"renew"?"Renovando...":"Renovar ciclo"}</button></>:<small>Atendimentos cobrados na barbearia</small>}<button type="button" className={styles.passwordButton} disabled={busy===client.id+"password"} onClick={()=>setClientPassword(client)}>{busy===client.id+"password"?"Definindo senha...":"Criar ou trocar senha"}</button></div>
    </article>; })}</section>
    {!clients.length && <Empty title="Cliente não encontrado" text="Revise a busca ou selecione outro filtro."/>}
  </>;
}

function Services({ services, total, search, setSearch, filter, setFilter, busy, saveService }: any) {
  return <><PageHead eyebrow="CATÁLOGO" title="Serviços" text="Ajuste preço, duração e disponibilidade. As mudanças aparecem no agendamento."/>
    <section className={styles.filters}><label className={styles.search}><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar serviço"/></label><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="active">Ativos</option><option value="inactive">Pausados</option><option value="all">Todos os serviços</option></select><div className={styles.filterNote}>{total} serviços no catálogo</div></section>
    <section className={styles.serviceGrid}>{services.map((service: Item) => <form key={service.id} className={styles.serviceCard} onSubmit={(event) => saveService(event, service.id)}><div className={styles.serviceCardHead}><span>{service.display_order?.toString().padStart(2, "0") || "—"}</span><label className={styles.switch}><input name="active" type="checkbox" defaultChecked={service.active}/><i/><b>{service.active ? "Ativo" : "Pausado"}</b></label></div><label>Nome<input name="name" defaultValue={service.name} required/></label><div className={styles.serviceFields}><label>Valor (R$)<input name="price" type="number" min="0" step="0.01" defaultValue={(service.price_cents / 100).toFixed(2)} required/></label><label>Duração<input name="duration" type="number" min="15" step="15" defaultValue={service.duration_minutes} required/><small>min</small></label></div><button disabled={busy === service.id + "service"}>{busy === service.id + "service" ? "Salvando..." : "Salvar alterações"}</button></form>)}</section>
    {!services.length && <Empty title="Serviço não encontrado" text="Revise a busca ou altere o filtro."/>}
  </>;
}

function Team({ professionals, appointments, busy, toggleProfessional, openAgenda }: any) {
  return <><PageHead eyebrow="OPERAÇÃO" title="Equipe" text="Controle quem aparece na agenda e acompanhe a carga de cada profissional."/>
    <section className={styles.teamGrid}>{professionals.map((pro: Item, index: number) => { const upcoming = appointments.filter((a: Item) => a.professionals?.id === pro.id && ["scheduled", "confirmed"].includes(a.status)).length; return <article className={styles.teamCard} key={pro.id}><div className={styles.proPortrait}>{pro.photo_url?<Image src={pro.photo_url} alt={`Foto de ${pro.name}`} fill sizes="(max-width: 560px) 74px, 90px"/>:<span>{initials(pro.name)}</span>}<em>0{index + 1}</em></div><div><span className={pro.active ? styles.available : styles.paused}>{pro.active ? "Disponível" : "Pausado"}</span><h2>{pro.name}</h2><p>{upcoming} atendimento{upcoming === 1 ? "" : "s"} nos próximos 30 dias</p></div><div className={styles.teamActions}><button onClick={() => openAgenda("all")}>Ver agenda</button><button disabled={busy === pro.id + "pro"} className={pro.active ? styles.pauseButton : styles.enableButton} onClick={() => toggleProfessional(pro.id, !pro.active)}>{pro.active ? "Pausar agenda" : "Ativar agenda"}</button></div></article>; })}</section>
  </>;
}

function Empty({ title, text }: { title: string; text: string }) { return <div className={styles.empty}><span><Image src="/logo-neemias-prime.png" alt="" width={34} height={34}/></span><strong>{title}</strong><p>{text}</p></div>; }
