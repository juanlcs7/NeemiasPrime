"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./client-dashboard.module.css";

type Service = { id:string; name:string; price_cents:number; duration_minutes:number };
type Professional = { id:string; name:string };
type Appointment = { id:string; service_id:string; professional_id:string; starts_at:string; ends_at:string; status:string; payment_mode:string; services:{name:string;price_cents:number}|null; professionals:{name:string}|null };
type Props = { profile:{full_name:string;booking_blocked_until:string|null;role:string}|null; services:Service[]; professionals:Professional[]; appointments:Appointment[]; membership:{active:boolean;plans:{name:string;price_cents:number}|null}|null };
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

export default function ClientDashboard({profile,services,professionals,appointments:initial,membership}:Props) {
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
  const blocked = Boolean(profile?.booking_blocked_until&&new Date(profile.booking_blocked_until)>new Date());
  const next = useMemo(()=>appointments.filter(a=>["scheduled","confirmed"].includes(a.status)&&new Date(a.starts_at)>new Date()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at))[0],[appointments]);
  const selected = services.find(item=>item.id===service);
  const selectedProfessional = professionals.find(item=>item.id===professional);
  const selectedDay = days.find(item=>item.value===date);

  useEffect(()=>{if(!service||!professional||!date)return;let active=true;(async()=>{setLoading(true);setFeedback("");const {data,error}=await createClient().rpc("available_slots",{p_professional_id:professional,p_service_id:service,p_date:date});if(active){setSlots(error?[]:(data||[]).map((item:{starts_at:string})=>item.starts_at));setSlot("");setLoading(false);if(error)setFeedback("Não foi possível consultar a agenda agora.");}})();return()=>{active=false};},[service,professional,date]);
  async function book(){if(!slot)return;setLoading(true);setFeedback("");const {error}=await createClient().rpc("create_appointment",{p_professional_id:professional,p_service_id:service,p_starts_at:slot,p_client_notes:null});if(error){setFeedback(error.message);setLoading(false);return;}setSuccess(true);setLoading(false);}
  async function cancel(id:string){if(!confirm("Cancelar este horário? Você poderá reagendar conforme a disponibilidade."))return;const {error}=await createClient().rpc("cancel_my_appointment",{p_appointment_id:id});if(error)setFeedback(error.message);else setAppointments(list=>list.map(item=>item.id===id?{...item,status:"cancelled"}:item));}
  const morning=slots.filter(item=>Number(time(item).slice(0,2))<12), afternoon=slots.filter(item=>{const h=Number(time(item).slice(0,2));return h>=12&&h<18}), evening=slots.filter(item=>Number(time(item).slice(0,2))>=18);

  return <main className={`${styles.root} portal-shell`}>
    <aside className="portal-side"><Link href="/" className="prime-brand"><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={48} height={48}/><span>NEEMIAS <b>PRIME</b></span></Link><nav><a className="active" href="#inicio"><i>⌂</i> Visão geral</a><a href="#agendar"><i>＋</i> Agendar</a><Link prefetch={false} href="/cliente/agendamentos"><i>◷</i> Meus agendamentos</Link><a href="#plano"><i>♙</i> Meu plano</a>{profile?.role==="admin"&&<Link prefetch={false} href="/admin"><i>▦</i> Administração</Link>}</nav><Link className="logout" href="/sair">Sair da conta</Link></aside>
    <section className="portal-main">
      <header className="portal-top"><Link href="/" className="mobile-brand"><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={35} height={35}/><b>NEEMIAS PRIME</b></Link><div><small>ÁREA DO CLIENTE</small><strong>{profile?.full_name||"Cliente Prime"}</strong></div><span className="client-avatar">{(profile?.full_name||"NP").split(" ").slice(0,2).map(x=>x[0]).join("")}</span></header>
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
        <Link prefetch={false} href="/cliente/agendamentos" className="appointments-shortcut"><span>◷</span><div><small>SEUS HORÁRIOS EM UM SÓ LUGAR</small><strong>Ver meus agendamentos</strong><p>Acompanhe, cancele ou reagende seus atendimentos.</p></div><i>→</i></Link>
      </div>
    </section>
    <nav className="mobile-nav"><a href="#inicio"><i>⌂</i><span>Início</span></a><a className="book-tab" href="#agendar"><i>＋</i><span>Agendar</span></a><Link prefetch={false} href="/cliente/agendamentos"><i>◷</i><span>Horários</span></Link><a href="#plano"><i>♙</i><span>Plano</span></a></nav>
    {success&&<div className="booking-success"><section><div className="success-mark">✓</div><p>HORÁRIO RESERVADO</p><h2>Está marcado!</h2><span>{selected?.name} com <b>{selectedProfessional?.name}</b><br/>{selectedDay?.week}, {selectedDay?.day} de {selectedDay?.month} às <b>{time(slot)}</b></span><button onClick={()=>location.reload()}>VER MEU AGENDAMENTO <i>→</i></button></section></div>}
  </main>;
}
