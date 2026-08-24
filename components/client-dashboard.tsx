"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppointmentsDashboard from "@/components/appointments-dashboard";
import styles from "./client-dashboard.module.css";

type Service = { id:string; name:string; price_cents:number; duration_minutes:number };
type Professional = { id:string; name:string };
type Appointment = { id:string; service_id:string; professional_id:string; starts_at:string; ends_at:string; status:string; payment_mode:string; services:{name:string;price_cents:number;duration_minutes:number}|null; professionals:{name:string}|null };
type Profile = {full_name:string;phone:string|null;booking_blocked_until:string|null;role:string};
type Props = { profile:Profile|null; accountEmail:string; services:Service[]; professionals:Professional[]; appointments:Appointment[]; membership:{active:boolean;plans:{name:string;price_cents:number}|null}|null };
type DayOption = { value:string; week:string; day:string; month:string; closed:boolean; today:boolean };

const money = (c:number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(c/100);
const dateTime = (v:string) => new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(v));
const time = (v:string) => new Date(v).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});

function localDateValue(date:Date) {
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
  const get = (type:string) => parts.find(part=>part.type===type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function nextSevenDays():DayOption[] {
  const base = new Date();
  return Array.from({length:7},(_,index)=>{
    const item = new Date(base); item.setDate(base.getDate()+index);
    const weekKey = new Intl.DateTimeFormat("en-US",{weekday:"short",timeZone:"America/Sao_Paulo"}).format(item);
    return {value:localDateValue(item),week:index===0?"Hoje":new Intl.DateTimeFormat("pt-BR",{weekday:"short",timeZone:"America/Sao_Paulo"}).format(item).replace(".",""),day:new Intl.DateTimeFormat("pt-BR",{day:"2-digit",timeZone:"America/Sao_Paulo"}).format(item),month:new Intl.DateTimeFormat("pt-BR",{month:"short",timeZone:"America/Sao_Paulo"}).format(item).replace(".",""),closed:weekKey==="Sun"||weekKey==="Mon",today:index===0};
  });
}

export default function ClientDashboard({profile:initialProfile,accountEmail,services,professionals,appointments:initial,membership}:Props) {
  const days = useMemo(()=>nextSevenDays(),[]);
  const [appointments,setAppointments] = useState(initial);
  const [service,setService] = useState(services[0]?.id||"");
  const [professional,setProfessional] = useState(professionals[0]?.id||"");
  const [date,setDate] = useState(days.find(day=>!day.closed)?.value||days[0]?.value||"");
  const [slots,setSlots] = useState<string[]>([]);
  const [slot,setSlot] = useState("");
  const [loading,setLoading] = useState(false);
  const [feedback,setFeedback] = useState("");
  const [success,setSuccess] = useState(false);
  const [profile,setProfile] = useState(initialProfile);
  const [view,setView] = useState<"home"|"appointments"|"profile">("home");
  const blocked = Boolean(profile?.booking_blocked_until&&new Date(profile.booking_blocked_until)>new Date());
  const next = useMemo(()=>appointments.filter(a=>["scheduled","confirmed"].includes(a.status)&&new Date(a.starts_at)>new Date()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at))[0],[appointments]);
  const selected = services.find(item=>item.id===service);
  const selectedProfessional = professionals.find(item=>item.id===professional);
  const selectedDay = days.find(item=>item.value===date);

  useEffect(()=>{if(!service||!professional||!date)return;let active=true;(async()=>{setLoading(true);setFeedback("");const {data,error}=await createClient().rpc("available_slots",{p_professional_id:professional,p_service_id:service,p_date:date});if(active){setSlots(error?[]:(data||[]).map((item:{starts_at:string})=>item.starts_at));setSlot("");setLoading(false);if(error)setFeedback("Não foi possível consultar a agenda agora.");}})();return()=>{active=false};},[service,professional,date]);
  useEffect(()=>{const syncHash=()=>{if(window.location.hash==="#meus-agendamentos")setView("appointments");};const timer=window.setTimeout(syncHash,0);window.addEventListener("hashchange",syncHash);return()=>{window.clearTimeout(timer);window.removeEventListener("hashchange",syncHash);};},[]);
  async function book(){if(!slot)return;setLoading(true);setFeedback("");const {error}=await createClient().rpc("create_appointment",{p_professional_id:professional,p_service_id:service,p_starts_at:slot,p_client_notes:null});if(error){setFeedback(error.message);setLoading(false);return;}setSuccess(true);setLoading(false);}
  async function cancel(id:string){if(!confirm("Cancelar este horário? Você poderá reagendar conforme a disponibilidade."))return;const {error}=await createClient().rpc("cancel_my_appointment",{p_appointment_id:id});if(error)setFeedback(error.message);else setAppointments(list=>list.map(item=>item.id===id?{...item,status:"cancelled"}:item));}
  function showAppointments(){window.history.replaceState(null,"","/cliente#meus-agendamentos");setView("appointments");window.scrollTo({top:0,behavior:"instant"});}
  function showProfile(){window.history.replaceState(null,"","/cliente#perfil");setView("profile");window.scrollTo({top:0,behavior:"instant"});}
  function showHome(section="inicio"){setView("home");window.history.replaceState(null,"",`/cliente#${section}`);window.setTimeout(()=>document.getElementById(section)?.scrollIntoView({behavior:"smooth"}),0);}

  if(view==="appointments") return <AppointmentsDashboard profile={profile} appointments={appointments} professionals={professionals} onNavigateHome={showHome}/>;
  if(view==="profile") return <ProfilePanel profile={profile} accountEmail={accountEmail} onUpdated={setProfile} onBack={showHome}/>;
  const morning=slots.filter(item=>Number(time(item).slice(0,2))<12), afternoon=slots.filter(item=>{const h=Number(time(item).slice(0,2));return h>=12&&h<18}), evening=slots.filter(item=>Number(time(item).slice(0,2))>=18);

  return <main className={`${styles.root} portal-shell`}>
    <aside className="portal-side"><Link href="/" className="prime-brand"><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={48} height={48}/><span>NEEMIAS <b>PRIME</b></span></Link><nav><a className="active" href="#inicio"><i>⌂</i> Visão geral</a><a href="#agendar"><i>＋</i> Agendar</a><button type="button" onClick={showAppointments}><i>◷</i> Meus agendamentos</button><a href="#plano"><i>♙</i> Meu plano</a><button type="button" onClick={showProfile}><i>◎</i> Editar perfil</button>{profile?.role==="admin"&&<Link prefetch={false} href="/admin"><i>▦</i> Administração</Link>}</nav><Link className="logout" href="/sair">Sair da conta</Link></aside>
    <section className="portal-main">
      <header className="portal-top"><Link href="/" className="mobile-brand"><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={35} height={35}/><b>NEEMIAS PRIME</b></Link><div><small>ÁREA DO CLIENTE</small><strong>{profile?.full_name||"Cliente Prime"}</strong></div><button type="button" className="profile-trigger" onClick={showProfile} aria-label="Abrir e editar meu perfil"><span className="client-avatar">{(profile?.full_name||"NP").split(" ").slice(0,2).map(x=>x[0]).join("")}</span><i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Zm9.7-13.7 4 4M14.8 5.2l1.4-1.4a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2l-1.4 1.4"/></svg></i><small>Editar</small></button></header>
      <div className="portal-content" id="inicio">
        {blocked&&<div className="blocked-banner"><b>!</b><div><strong>Agendamentos bloqueados temporariamente</strong><span>Você poderá marcar novamente em {dateTime(profile!.booking_blocked_until!)}</span></div></div>}
        <section className="portal-welcome"><div><p className="metal-kicker">SUA ÁREA PRIME</p><h1>Olá, {profile?.full_name?.split(" ")[0]||"cliente"}<em>.</em></h1><p>Seu próximo cuidado, sem ligação e sem espera.</p></div>{membership&&<span className="member-seal">MEMBRO<br/><b>PRIME</b></span>}</section>
        <section className={`next-booking ${next?"has-booking":"empty-booking"}`}><div className="next-copy"><p className="metal-kicker">{next?"PRÓXIMO ATENDIMENTO":"SUA AGENDA ESTÁ LIVRE"}</p>{next?<><time>{new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long",timeZone:"America/Sao_Paulo"}).format(new Date(next.starts_at))}</time><h2>{time(next.starts_at)}</h2><p>{next.services?.name} <span>com {next.professionals?.name}</span></p><div className="next-actions"><span className={next.payment_mode==="membership"?"covered":"pay-shop"}>{next.payment_mode==="membership"?"✓ Coberto pelo plano":"Pagamento na barbearia"}</span><button onClick={()=>cancel(next.id)}>Cancelar</button></div></>:<><h2>Que tal renovar o visual?</h2><p>Os melhores horários dos próximos dias estão logo abaixo.</p><a href="#agendar">ESCOLHER HORÁRIO ↓</a></>}</div><div className="next-watermark">NP</div><Image src="/logo-neemias-prime.png" alt="" width={145} height={145}/></section>

        <section className="booking-builder" id="agendar"><header className="booking-head"><div><p className="metal-kicker">AGENDAMENTO ONLINE</p><h2>Escolha. Toque. Pronto.</h2><p>Mostramos apenas horários realmente disponíveis.</p></div><span><b>30</b> min<br/>entre horários</span></header>
          {blocked?<p className="empty-state">Você poderá voltar a agendar após o fim do bloqueio informado acima.</p>:<div className="booking-flow">
            <section className="booking-step service-step"><header><b>01</b><div><h3>O que vamos fazer?</h3><p>Toque no serviço desejado</p></div></header><div className="service-catalog">{services.map((item,index)=><button type="button" key={item.id} className={service===item.id?"selected":""} onClick={()=>setService(item.id)}><span className="service-symbol">{item.name.includes("Barba")?"B":item.name.includes("Corte")?"C":item.name.includes("pele")?"P":"✦"}</span><span className="service-name"><strong>{item.name}</strong><small>{Math.max(30,item.duration_minutes)} min</small></span><b>{money(item.price_cents)}</b><i>{service===item.id?"✓":String(index+1).padStart(2,"0")}</i></button>)}</div>{selected&&<div className="service-detail"><span><small>ESCOLHIDO</small><b>{selected.name}</b></span><i/><span><small>VALOR</small><b>{money(selected.price_cents)}</b></span><em>{membership?"Plano aplicado automaticamente quando houver cobertura":"Pagamento somente na barbearia"}</em></div>}</section>
            <section className="booking-step"><header><b>02</b><div><h3>Com quem?</h3><p>Selecione seu profissional</p></div></header><div className="professional-picker">{professionals.map((item,index)=><button type="button" className={professional===item.id?"selected":""} onClick={()=>setProfessional(item.id)} key={item.id}><span>{item.name.split(" ").map(part=>part[0]).slice(0,2).join("")}</span><strong>{item.name}</strong><small>{professional===item.id?"✓ Selecionado":"Disponível"}</small><i>0{index+1}</i></button>)}</div></section>
            <section className="booking-step date-step"><header><b>03</b><div><h3>Qual o melhor dia?</h3><p>Próximos 7 dias</p></div></header><div className="seven-days">{days.map(item=><button type="button" key={item.value} disabled={item.closed} className={`${date===item.value?"selected":""} ${item.today?"today":""}`} onClick={()=>setDate(item.value)}><small>{item.week}</small><strong>{item.day}</strong><span>{item.closed?"Fechado":item.month}</span></button>)}</div></section>
            <section className="booking-step slot-step"><header><b>04</b><div><h3>Escolha o horário</h3><p>{selectedDay?`${selectedDay.week}, ${selectedDay.day} de ${selectedDay.month}`:"Selecione um dia"}</p></div></header>{loading?<div className="slots-loading"><i/><span>Consultando a agenda...</span></div>:slots.length?<div className="slot-groups">{([["Manhã",morning],["Tarde",afternoon],["Noite",evening]] as [string,string[]][]).map(([label,items])=>items.length?<div key={label}><small>{label}</small><div>{items.map(item=><button type="button" className={slot===item?"selected":""} onClick={()=>setSlot(item)} key={item}>{time(item)}{slot===item&&<i>✓</i>}</button>)}</div></div>:null)}</div>:<div className="no-slots"><b>Agenda preenchida neste dia</b><span>Escolha outro dia acima para ver novos horários.</span></div>}</section>
            <section className={`booking-summary ${slot?"ready":""}`}><div className="summary-icon">✦</div><div><small>SEU AGENDAMENTO</small><strong>{selected?.name||"Escolha um serviço"}</strong><span>{slot?`${selectedProfessional?.name} · ${selectedDay?.week}, ${selectedDay?.day}/${selectedDay?.month} às ${time(slot)}`:"Escolha um horário para continuar"}</span></div><div className="summary-price"><small>VALOR</small><b>{selected?money(selected.price_cents):"—"}</b></div><button disabled={!slot||loading} onClick={book}>{loading?"AGUARDE...":"CONFIRMAR HORÁRIO"}<span>→</span></button></section>
          </div>}{feedback&&<div className="inline-feedback">{feedback}<button onClick={()=>setFeedback("")}>×</button></div>}</section>

        <section id="plano" className="membership-card"><div><p className="metal-kicker">MEU CLUBE</p><h2>{membership?.plans?.name||"Mais frequência. Mais presença."}</h2><p>{membership?"Seu benefício aparece automaticamente nos serviços e dias cobertos.":"Conheça os planos para manter corte e barba sempre em dia."}</p></div>{membership?<strong>{money(membership.plans?.price_cents||0)}<small>/mês</small></strong>:<a href="https://wa.me/5521959438832" target="_blank">CONHECER PLANOS →</a>}</section>
        <button type="button" onClick={showAppointments} className="appointments-shortcut"><span>◷</span><div><small>SEUS HORÁRIOS EM UM SÓ LUGAR</small><strong>Ver meus agendamentos</strong><p>Acompanhe, cancele ou reagende seus atendimentos.</p></div><i>→</i></button>
      </div>
    </section>
    <nav className="mobile-nav"><a href="#inicio"><i>⌂</i><span>Início</span></a><a className="book-tab" href="#agendar"><i>＋</i><span>Agendar</span></a><button type="button" onClick={showAppointments}><i>◷</i><span>Horários</span></button><a href="#plano"><i>♙</i><span>Plano</span></a><button type="button" className="profile-tab" onClick={showProfile} aria-label="Editar perfil"><i><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.7-4 2.9-6 6.5-6s5.8 2 6.5 6"/></svg></i><span>Perfil</span></button></nav>
    {success&&<div className="booking-success"><section><div className="success-mark">✓</div><p>HORÁRIO RESERVADO</p><h2>Está marcado!</h2><span>{selected?.name} com <b>{selectedProfessional?.name}</b><br/>{selectedDay?.week}, {selectedDay?.day} de {selectedDay?.month} às <b>{time(slot)}</b></span><button onClick={()=>location.reload()}>VER MEU AGENDAMENTO <i>→</i></button></section></div>}
  </main>;
}

function ProfilePanel({profile,accountEmail,onUpdated,onBack}:{profile:Profile|null;accountEmail:string;onUpdated:(profile:Profile|null)=>void;onBack:(section?:string)=>void}) {
  const [fullName,setFullName]=useState(profile?.full_name||"");
  const [phone,setPhone]=useState(profile?.phone||"");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  async function save(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setError("");setMessage("");
    if(fullName.trim().length<3){setError("Digite seu nome completo.");return;}
    if(password&&password.length<6){setError("A nova senha precisa ter pelo menos 6 caracteres.");return;}
    if(password!==confirmation){setError("As senhas não são iguais.");return;}
    setSaving(true);
    const supabase=createClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setError("Sua sessão expirou. Entre novamente para continuar.");setSaving(false);return;}
    const cleanName=fullName.trim(); const cleanPhone=phone.trim()||null;
    const {error:profileError}=await supabase.from("profiles").update({full_name:cleanName,phone:cleanPhone}).eq("id",user.id);
    if(profileError){setError("Não foi possível atualizar seus dados agora.");setSaving(false);return;}
    if(password){const {error:passwordError}=await supabase.auth.updateUser({password});if(passwordError){setError("Os dados foram salvos, mas não foi possível alterar a senha.");setSaving(false);return;}}
    onUpdated(profile?{...profile,full_name:cleanName,phone:cleanPhone}:profile);
    setPassword("");setConfirmation("");setMessage("Perfil atualizado com sucesso.");setSaving(false);
  }

  return <main className={`${styles.root} profile-shell`}>
    <header className="profile-mobile-head"><button type="button" onClick={()=>onBack("inicio")}>←</button><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={36} height={36}/><div><small>ÁREA DO CLIENTE</small><strong>Meu perfil</strong></div></header>
    <section className="profile-page">
      <button type="button" className="profile-back" onClick={()=>onBack("inicio")}>← VOLTAR PARA O INÍCIO</button>
      <div className="profile-intro"><div className="profile-avatar-large">{(profile?.full_name||"NP").split(" ").slice(0,2).map(x=>x[0]).join("")}</div><div><p>MINHA CONTA PRIME</p><h1>Seu perfil, do seu jeito.</h1><span>Mantenha seus dados atualizados para facilitar o atendimento.</span></div></div>
      <form className="profile-form" onSubmit={save}>
        <section><header><span>01</span><div><h2>Dados pessoais</h2><p>Informações utilizadas pela barbearia.</p></div></header><div className="profile-fields"><label>Nome completo<input value={fullName} onChange={event=>setFullName(event.target.value)} autoComplete="name" required/></label><label>Telefone<input value={phone} onChange={event=>setPhone(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="(21) 99999-9999"/></label><label className="full-field">E-mail da conta<input value={accountEmail} disabled/><small>O e-mail de acesso não pode ser alterado por aqui.</small></label></div></section>
        <section><header><span>02</span><div><h2>Segurança</h2><p>Preencha somente se quiser trocar sua senha.</p></div></header><div className="profile-fields"><label>Nova senha<input value={password} onChange={event=>setPassword(event.target.value)} type="password" minLength={6} autoComplete="new-password" placeholder="Mínimo de 6 caracteres"/></label><label>Confirmar nova senha<input value={confirmation} onChange={event=>setConfirmation(event.target.value)} type="password" minLength={6} autoComplete="new-password" placeholder="Repita a nova senha"/></label></div></section>
        {error&&<div className="profile-feedback error">{error}</div>}{message&&<div className="profile-feedback success">✓ {message}</div>}
        <footer><div><small>PRIVACIDADE</small><span>Seus dados são usados apenas para sua experiência na Neemias Prime.</span></div><button disabled={saving}>{saving?"SALVANDO...":"SALVAR ALTERAÇÕES"}<i>→</i></button></footer>
      </form>
    </section>
  </main>;
}
