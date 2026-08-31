"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AppointmentsDashboard from "@/components/appointments-dashboard";
import { ClientMobileNav, ClientSection, ClientSidebar, ClientTopbar } from "@/components/client-navigation";
import styles from "./client-dashboard.module.css";

type Service = { id:string; name:string; price_cents:number; duration_minutes:number };
type Professional = { id:string; name:string; photo_url?:string|null };
type Plan = { id:string; name:string; price_cents:number; benefit_type:string; allowed_weekdays:number[] };
type Appointment = { id:string; service_id:string; professional_id:string; starts_at:string; ends_at:string; status:string; payment_mode:string; services:{name:string;price_cents:number;duration_minutes:number}|null; professionals:{name:string}|null };
type Profile = {full_name:string;phone:string|null;booking_blocked_until:string|null;role:string};
type Membership = {active:boolean;starts_on:string;ends_on:string;plans:Plan|null};
type Props = { profile:Profile|null; accountEmail:string; services:Service[]; professionals:Professional[]; appointments:Appointment[]; membership:Membership|null; plans:Plan[] };
type DayOption = { value:string; week:string; day:string; month:string; closed:boolean; today:boolean };

const featuredServiceNames = ["corte","corte + barba","corte infantil","hidratacao","relaxamento capilar","sobrancelha"];
function normalizedName(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
function servicePriority(name:string){const normalized=normalizedName(name);const index=featuredServiceNames.findIndex(item=>normalized===item||(item==="corte infantil"&&normalized.startsWith(item)));return index<0?featuredServiceNames.length:index;}

const money = (c:number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(c/100);
const dateTime = (v:string) => new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Sao_Paulo"}).format(new Date(v));
const time = (v:string) => new Date(v).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Sao_Paulo"});
const planDate = (v:string) => new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"long",year:"numeric",timeZone:"America/Sao_Paulo"}).format(new Date(`${v}T12:00:00-03:00`));

function planBenefit(type:string){return type==="beard"?"Barba incluída":type==="cut_beard"?"Corte + barba incluídos":"Cortes incluídos";}
function planDays(days:number[]){const names:Record<number,string>={0:"domingo",1:"segunda",2:"terça",3:"quarta",4:"quinta",5:"sexta",6:"sábado"};if(days.length===5&&[2,3,4,5,6].every(day=>days.includes(day)))return "Terça a sábado";return days.map(day=>names[day]).filter(Boolean).join(" e ");}
function daysUntilRenewal(value:string){
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const toUtc=(date:string)=>{const [year,month,day]=date.split("-").map(Number);return Date.UTC(year,month-1,day);};
  return Math.max(0,Math.round((toUtc(value)-toUtc(today))/86400000));
}

function ProfessionalPortrait({name,photoUrl,index}:{name:string;photoUrl?:string|null;index:number}) {
  const [photoFailed,setPhotoFailed]=useState(false);
  const initials=name.split(" ").map(part=>part[0]).slice(0,2).join("");
  return <span className="professional-photo">
    {!photoFailed&&photoUrl&&<Image src={photoUrl} alt={`Foto de ${name}`} fill sizes="(max-width: 850px) 72vw, 240px" onError={()=>setPhotoFailed(true)}/>}
    <span className="professional-fallback" aria-hidden={photoFailed?undefined:true}><b>{initials}</b><small>NEEMIAS PRIME</small></span>
    <i>0{index+1}</i>
  </span>;
}

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

export default function ClientDashboard({profile:initialProfile,accountEmail,services,professionals,appointments:initial,membership,plans}:Props) {
  const days = useMemo(()=>nextSevenDays(),[]);
  const orderedServices = useMemo(()=>[...services].sort((a,b)=>servicePriority(a.name)-servicePriority(b.name)),[services]);
  const [appointments,setAppointments] = useState(initial);
  const [service,setService] = useState(orderedServices[0]?.id||"");
  const [professional,setProfessional] = useState(professionals[0]?.id||"");
  const [date,setDate] = useState(days.find(day=>!day.closed)?.value||days[0]?.value||"");
  const [slots,setSlots] = useState<string[]>([]);
  const [slot,setSlot] = useState("");
  const [loading,setLoading] = useState(false);
  const [feedback,setFeedback] = useState("");
  const [success,setSuccess] = useState(false);
  const [profile,setProfile] = useState(initialProfile);
  const [view,setView] = useState<"home"|"appointments"|"profile"|"plans">("home");
  const [bookingStage,setBookingStage] = useState(1);
  const [activeSection,setActiveSection] = useState<ClientSection>("home");
  const blocked = Boolean(profile?.booking_blocked_until&&new Date(profile.booking_blocked_until)>new Date());
  const next = useMemo(()=>appointments.filter(a=>["scheduled","confirmed"].includes(a.status)&&new Date(a.starts_at)>new Date()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at))[0],[appointments]);
  const selected = orderedServices.find(item=>item.id===service);
  const selectedProfessional = professionals.find(item=>item.id===professional);
  const selectedDay = days.find(item=>item.value===date);

  useEffect(()=>{if(!service||!professional||!date)return;let active=true;(async()=>{setLoading(true);setFeedback("");const {data,error}=await createClient().rpc("available_slots",{p_professional_id:professional,p_service_id:service,p_date:date});if(active){setSlots(error?[]:(data||[]).map((item:{starts_at:string})=>item.starts_at));setSlot("");setLoading(false);if(error)setFeedback("Não foi possível consultar a agenda agora.");}})();return()=>{active=false};},[service,professional,date]);
  useEffect(()=>{const syncHash=()=>{const hash=window.location.hash;if(hash==="#meus-agendamentos"){setView("appointments");setActiveSection("appointments");window.scrollTo({top:0,behavior:"auto"});return;}if(hash==="#perfil"){setView("profile");setActiveSection("profile");window.scrollTo({top:0,behavior:"auto"});return;}if(hash==="#plano"){setView("plans");setActiveSection("plans");window.scrollTo({top:0,behavior:"auto"});return;}const booking=hash==="#agendar";setView("home");setActiveSection(booking?"booking":"home");window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{if(booking)document.getElementById("agendar")?.scrollIntoView({block:"start"});else window.scrollTo({top:0,behavior:"auto"});}));};const timer=window.setTimeout(syncHash,0);window.addEventListener("hashchange",syncHash);window.addEventListener("popstate",syncHash);return()=>{window.clearTimeout(timer);window.removeEventListener("hashchange",syncHash);window.removeEventListener("popstate",syncHash);};},[]);
  useEffect(()=>{if(view!=="home")return;const sync=()=>{const booking=document.getElementById("agendar");setActiveSection(booking&&window.scrollY>=booking.offsetTop-180?"booking":"home");};sync();window.addEventListener("scroll",sync,{passive:true});return()=>window.removeEventListener("scroll",sync);},[view]);
  async function book(){
    if(!slot||!selected||!selectedProfessional)return;
    setLoading(true);setFeedback("");
    const supabase=createClient();
    const {data,error}=await supabase.rpc("create_appointment",{p_professional_id:professional,p_service_id:service,p_starts_at:slot,p_client_notes:null});
    if(error){setFeedback(error.message);setLoading(false);return;}
    const endsAt=new Date(new Date(slot).getTime()+Math.max(30,selected.duration_minutes)*60000).toISOString();
    const {data:created}=await supabase.from("appointments").select("id,service_id,professional_id,starts_at,ends_at,status,payment_mode,services(name,price_cents,duration_minutes),professionals(name)").eq("id",data).single();
    const appointment=(created||{id:String(data),service_id:selected.id,professional_id:selectedProfessional.id,starts_at:slot,ends_at:endsAt,status:"scheduled",payment_mode:"at_shop",services:{name:selected.name,price_cents:selected.price_cents,duration_minutes:selected.duration_minutes},professionals:{name:selectedProfessional.name}}) as unknown as Appointment;
    setAppointments(list=>[appointment,...list]);
    setSuccess(true);setLoading(false);
  }
  async function cancel(id:string){if(!confirm("Cancelar este horário? Você poderá reagendar conforme a disponibilidade."))return;const {error}=await createClient().rpc("cancel_my_appointment",{p_appointment_id:id});if(error)setFeedback(error.message);else setAppointments(list=>list.map(item=>item.id===id?{...item,status:"cancelled"}:item));}
  function pushClientHash(hash:string){if(window.location.hash!==hash)window.history.pushState(null,"",`/cliente${hash}`);}
  function showAppointments(){setActiveSection("appointments");pushClientHash("#meus-agendamentos");setView("appointments");window.scrollTo({top:0,behavior:"auto"});}
  function showProfile(){setActiveSection("profile");pushClientHash("#perfil");setView("profile");window.scrollTo({top:0,behavior:"auto"});}
  function showPlans(){setActiveSection("plans");pushClientHash("#plano");setView("plans");window.scrollTo({top:0,behavior:"auto"});}
  function showHome(section="inicio"){if(section==="plano"){showPlans();return;}if(section==="perfil"){showProfile();return;}if(section==="meus-agendamentos"){showAppointments();return;}setActiveSection(section==="agendar"?"booking":"home");setView("home");pushClientHash(`#${section}`);window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>document.getElementById(section)?.scrollIntoView({behavior:"smooth",block:"start"})));}
  function navigateClient(section:ClientSection){if(section==="appointments")showAppointments();else if(section==="plans")showPlans();else if(section==="profile")showProfile();else showHome(section==="booking"?"agendar":"inicio");}
  function navigateBookingStage(stage:number){setBookingStage(stage);window.setTimeout(()=>document.querySelector(`[data-booking-stage="${stage}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}),80);}
  function advanceBooking(stage:number){navigateBookingStage(stage);}
  function chooseService(id:string){setService(id);setSlot("");advanceBooking(2);}
  function chooseProfessional(id:string){setProfessional(id);setSlot("");advanceBooking(3);}
  function chooseDate(value:string){setDate(value);setSlot("");advanceBooking(4);}

  if(view==="appointments") return <AppointmentsDashboard profile={profile} appointments={appointments} professionals={professionals} onNavigate={navigateClient}/>;
  if(view==="profile") return <ProfilePanel profile={profile} accountEmail={accountEmail} onUpdated={setProfile} onNavigate={navigateClient}/>;
  if(view==="plans") return <PlansPanel profile={profile} membership={membership} plans={plans} onNavigate={navigateClient}/>;
  const morning=slots.filter(item=>Number(time(item).slice(0,2))<12), afternoon=slots.filter(item=>{const h=Number(time(item).slice(0,2));return h>=12&&h<18}), evening=slots.filter(item=>Number(time(item).slice(0,2))>=18);

  return <main className={`${styles.root} portal-shell`}>
    <ClientSidebar active={activeSection} profileName={profile?.full_name||"Cliente Prime"} isAdmin={profile?.role==="admin"} onNavigate={navigateClient}/>
    <section className="portal-main">
      <ClientTopbar active={activeSection} profileName={profile?.full_name||"Cliente Prime"} isAdmin={profile?.role==="admin"} onNavigate={navigateClient}/>
      <div className="portal-content" id="inicio">
        {blocked&&<div className="blocked-banner"><b>!</b><div><strong>Agendamentos bloqueados temporariamente</strong><span>Você poderá marcar novamente em {dateTime(profile!.booking_blocked_until!)}</span></div></div>}
        <section className="portal-welcome"><div><p className="metal-kicker">SUA ÁREA PRIME</p><h1>Olá, {profile?.full_name?.split(" ")[0]||"cliente"}<em>.</em></h1><p>Seu próximo cuidado, sem ligação e sem espera.</p></div>{membership&&<span className="member-seal">MEMBRO<br/><b>PRIME</b></span>}</section>
        <section className={`next-booking ${next?"has-booking":"empty-booking"}`}><div className="next-copy"><p className="metal-kicker">{next?"PRÓXIMO ATENDIMENTO":"SUA AGENDA ESTÁ LIVRE"}</p>{next?<><time>{new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"long",timeZone:"America/Sao_Paulo"}).format(new Date(next.starts_at))}</time><h2>{time(next.starts_at)}</h2><p>{next.services?.name} <span>com {next.professionals?.name}</span></p><div className="next-actions"><span className={next.payment_mode==="membership"?"covered":"pay-shop"}>{next.payment_mode==="membership"?"✓ Coberto pelo plano":"Pagamento na barbearia"}</span><button onClick={()=>cancel(next.id)}>Cancelar</button></div></>:<><h2>Que tal renovar o visual?</h2><p>Os melhores horários dos próximos dias estão logo abaixo.</p><button type="button" className="choose-time-link" onClick={()=>showHome("agendar")}>ESCOLHER HORÁRIO ↓</button></>}</div><div className="next-watermark" aria-hidden="true"><Image src="/logo-neemias-prime.png" alt="" fill sizes="180px"/></div><Image src="/logo-neemias-prime.png" alt="" width={145} height={145}/></section>

        <section className="booking-builder" id="agendar"><header className="booking-head"><div><p className="metal-kicker">AGENDAMENTO ONLINE</p><h2>Escolha. Toque. Pronto.</h2><p>Mostramos apenas horários realmente disponíveis.</p></div><span><b>30</b> min<br/>entre horários</span></header>
          {blocked?<p className="empty-state">Você poderá voltar a agendar após o fim do bloqueio informado acima.</p>:<div className="booking-flow">
            <nav className="booking-progress" aria-label="Etapas do agendamento">{[[1,"Serviço"],[2,"Barbeiro"],[3,"Dia"],[4,"Horário"]].map(([stage,label])=><button type="button" key={stage} aria-current={bookingStage===stage?"step":undefined} className={`${bookingStage===stage?"active":""} ${bookingStage>Number(stage)?"complete":""}`} onClick={()=>navigateBookingStage(Number(stage))}><b>{bookingStage>Number(stage)?"✓":String(stage).padStart(2,"0")}</b><span>{label}</span></button>)}</nav>
            <section data-booking-stage="1" className={`booking-step service-step ${bookingStage===1?"stage-active":""}`}><header><b>01</b><div><h3>O que vamos fazer?</h3><p>Os serviços mais procurados aparecem primeiro</p></div></header><div className="service-catalog">{orderedServices.map((item,index)=>{const featured=servicePriority(item.name)<featuredServiceNames.length;return <button type="button" key={item.id} className={`${service===item.id?"selected":""} ${featured?"featured-service":""}`} onClick={()=>chooseService(item.id)}><span className="service-symbol">{item.name.includes("Barba")?"B":item.name.includes("Corte")?"C":item.name.includes("pele")?"P":"✦"}</span><span className="service-name"><strong>{item.name}</strong><small>{featured?"DESTAQUE · ":""}{Math.max(30,item.duration_minutes)} min</small></span><b>{money(item.price_cents)}</b><i>{service===item.id?"✓":String(index+1).padStart(2,"0")}</i></button>})}{!orderedServices.length&&<div className="booking-empty-choice"><Image src="/logo-neemias-prime.png" alt="" width={40} height={40}/><div><strong>Catálogo em atualização</strong><span>Os serviços voltarão a aparecer assim que a equipe concluir os ajustes.</span></div></div>}</div>{selected&&<div className="service-detail"><span><small>ESCOLHIDO</small><b>{selected.name}</b></span><i/><span><small>VALOR</small><b>{money(selected.price_cents)}</b></span><em>{membership?"Plano aplicado automaticamente quando houver cobertura":"Pagamento somente na barbearia"}</em></div>}</section>
            <section data-booking-stage="2" className={`booking-step professional-step ${bookingStage===2?"stage-active":""}`}><header><b>02</b><div><h3>Escolha quem cuida do seu estilo</h3><p>Selecione seu barbeiro favorito</p></div></header><div className="professional-picker">{professionals.map((item,index)=><button type="button" className={professional===item.id?"selected":""} onClick={()=>chooseProfessional(item.id)} key={item.id} aria-pressed={professional===item.id}><ProfessionalPortrait name={item.name} photoUrl={item.photo_url} index={index}/><span className="professional-info"><small><i/> DISPONÍVEL</small><strong>{item.name}</strong><em>{professional===item.id?"Selecionado para o atendimento":"Escolher profissional"}</em></span><span className="professional-check">✓</span></button>)}{!professionals.length&&<div className="booking-empty-choice"><Image src="/logo-neemias-prime.png" alt="" width={40} height={40}/><div><strong>Equipe indisponível agora</strong><span>Fale com a barbearia para consultar um horário.</span></div></div>}</div><p className="photo-hint">Cada profissional tem sua própria agenda. Ao escolher, mostramos somente os horários realmente livres.</p></section>
            <section data-booking-stage="3" className={`booking-step date-step ${bookingStage===3?"stage-active":""}`}><header><b>03</b><div><h3>Qual o melhor dia?</h3><p>Próximos 7 dias</p></div></header><div className="seven-days">{days.map(item=><button type="button" key={item.value} disabled={item.closed} className={`${date===item.value?"selected":""} ${item.today?"today":""}`} onClick={()=>chooseDate(item.value)}><small>{item.week}</small><strong>{item.day}</strong><span>{item.closed?"Fechado":item.month}</span></button>)}</div></section>
            <section data-booking-stage="4" className={`booking-step slot-step ${bookingStage===4?"stage-active":""}`}><header><b>04</b><div><h3>Escolha o horário</h3><p>{selectedDay?`${selectedDay.week}, ${selectedDay.day} de ${selectedDay.month}`:"Selecione um dia"}</p></div></header>{loading?<div className="slots-loading"><i/><span>Consultando a agenda...</span></div>:slots.length?<div className="slot-groups">{([["Manhã",morning],["Tarde",afternoon],["Noite",evening]] as [string,string[]][]).map(([label,items])=>items.length?<div key={label}><small>{label}</small><div>{items.map(item=><button type="button" className={slot===item?"selected":""} onClick={()=>setSlot(item)} key={item}>{time(item)}{slot===item&&<i>✓</i>}</button>)}</div></div>:null)}</div>:<div className="no-slots"><b>Agenda preenchida neste dia</b><span>Escolha outro dia acima para ver novos horários.</span></div>}</section>
            <section className={`booking-summary ${slot?"ready":""}`}><div className="summary-icon">✦</div><div><small>SEU AGENDAMENTO</small><strong>{selected?.name||"Escolha um serviço"}</strong><span>{slot?`${selectedProfessional?.name} · ${selectedDay?.week}, ${selectedDay?.day}/${selectedDay?.month} às ${time(slot)}`:"Escolha um horário para continuar"}</span></div><div className="summary-price"><small>VALOR</small><b>{selected?money(selected.price_cents):"—"}</b></div><button disabled={!slot||loading} onClick={book}>{loading?"AGUARDE...":"CONFIRMAR HORÁRIO"}<span>→</span></button></section>
          </div>}{feedback&&<div className="inline-feedback" role="status" aria-live="polite">{feedback}<button type="button" aria-label="Fechar aviso" onClick={()=>setFeedback("")}>×</button></div>}</section>

        <section id="plano" className="membership-card"><div><p className="metal-kicker">MEU CLUBE</p><h2>{membership?.plans?.name||"Mais frequência. Mais presença."}</h2><p>{membership?`Plano ativo até ${planDate(membership.ends_on)}.` :"Compare os planos disponíveis e fale com a barbearia pelo WhatsApp."}</p></div>{membership?<button type="button" onClick={showPlans}>VER MEU PLANO →</button>:<button type="button" onClick={showPlans}>CONHECER PLANOS →</button>}</section>
        <button type="button" onClick={showAppointments} className="appointments-shortcut"><span>◷</span><div><small>SEUS HORÁRIOS EM UM SÓ LUGAR</small><strong>Ver meus agendamentos</strong><p>Acompanhe, cancele ou reagende seus atendimentos.</p></div><i>→</i></button>
      </div>
    </section>
    <ClientMobileNav active={activeSection} onNavigate={navigateClient}/>
    {success&&<div className="booking-success"><section><div className="success-mark">✓</div><p>HORÁRIO RESERVADO</p><h2>Está marcado!</h2><span>{selected?.name} com <b>{selectedProfessional?.name}</b><br/>{selectedDay?.week}, {selectedDay?.day} de {selectedDay?.month} às <b>{time(slot)}</b></span><button onClick={()=>{setSuccess(false);showAppointments();}}>IR PARA MEUS AGENDAMENTOS <i>→</i></button></section></div>}
  </main>;
}

function PlansPanel({profile,membership,plans,onNavigate}:{profile:Profile|null;membership:Membership|null;plans:Plan[];onNavigate:(section:ClientSection)=>void}) {
  const firstName=profile?.full_name?.split(" ")[0]||"cliente";
  const whatsapp=(plan:Plan)=>`https://wa.me/5521959438832?text=${encodeURIComponent(`Olá! Sou ${profile?.full_name||"cliente"} e quero saber mais sobre o plano ${plan.name}.`)}`;
  const renewalDate=membership?.ends_on||null;
  const renewalDays=renewalDate?daysUntilRenewal(renewalDate):0;
  return <main className={`${styles.root} portal-shell`}>
    <ClientSidebar active="plans" profileName={profile?.full_name||"Cliente Prime"} isAdmin={profile?.role==="admin"} onNavigate={onNavigate}/>
    <section className="portal-main plans-shell"><ClientTopbar active="plans" profileName={profile?.full_name||"Cliente Prime"} isAdmin={profile?.role==="admin"} onNavigate={onNavigate}/><div className="plans-page">
      <header className="plans-hero"><div><p>CLUBE NEEMIAS PRIME</p><h1>{membership?<>Seu plano está<br/><em>em dia.</em></>:<>Seu estilo não precisa<br/><em>esperar.</em></>}</h1><span>{membership?`${firstName}, acompanhe aqui seu benefício e a próxima data de vencimento.`:"Escolha o plano que combina com sua rotina e fale diretamente com nossa equipe."}</span></div><strong><Image src="/logo-neemias-prime.png" alt="" width={68} height={68}/><small>MEMBRO PRIME</small></strong></header>
      {membership?.plans&&renewalDate?<section className="active-membership premium-active-plan"><div className="active-plan-main"><div className="active-plan-top"><span className="active-badge">● ASSINATURA ATIVA</span><Image src="/logo-neemias-prime.png" alt="" width={48} height={48}/></div><p>SEU PLANO PRIME</p><h2>{membership.plans.name}</h2><div className="active-plan-price"><strong>{money(membership.plans.price_cents)}</strong><small>/mês</small></div><ul><li><i>✓</i>{planBenefit(membership.plans.benefit_type)}</li><li><i>✓</i>Válido: {planDays(membership.plans.allowed_weekdays)}</li><li><i>✓</i>Benefício aplicado automaticamente ao agendar</li></ul></div><aside className="renewal-panel"><div className="renewal-countdown"><small>PRÓXIMA RENOVAÇÃO</small><div><strong>{renewalDays}</strong><span>{renewalDays===1?"dia":"dias"}<b>{renewalDays===0?"RENOVA HOJE":"PARA RENOVAR"}</b></span></div><p>{renewalDays===0?"Seu novo ciclo começa hoje.":`Seu benefício continua ativo por mais ${renewalDays} ${renewalDays===1?"dia":"dias"}.`}</p></div><div className="due-date"><small>DATA DE RENOVAÇÃO</small><strong>{planDate(renewalDate)}</strong></div><div className="cycle-start"><small>INÍCIO DA ASSINATURA</small><strong>{planDate(membership.starts_on)}</strong></div><a href="https://wa.me/5521959438832?text=Ol%C3%A1%21%20Preciso%20falar%20sobre%20meu%20plano%20Neemias%20Prime." target="_blank" rel="noreferrer">FALAR SOBRE MEU PLANO <b>→</b></a></aside></section>:<><div className="plans-heading"><div><small>PLANOS DISPONÍVEIS</small><h2>Escolha sua frequência.</h2></div><p>Todos os planos são ativados pela equipe da barbearia e aparecem automaticamente no seu agendamento.</p></div><section className="client-plan-grid">{plans.map((plan,index)=><article className={index===1?"featured-plan":""} key={plan.id}>{index===1&&<span className="plan-popular">MAIS ESCOLHIDO</span>}<header><small>PLANO 0{index+1}</small><h3>{plan.name}</h3></header><div className="client-plan-price"><span>R$</span><strong>{(plan.price_cents/100).toFixed(2).replace(".",",")}</strong><small>/mês</small></div><ul><li><i>✓</i>{planBenefit(plan.benefit_type)}</li><li><i>✓</i>{planDays(plan.allowed_weekdays)}</li><li><i>✓</i>Agendamento online</li><li><i>✓</i>Benefício automático</li></ul><a href={whatsapp(plan)} target="_blank" rel="noreferrer">QUERO ESTE PLANO <b>→</b></a></article>)}{!plans.length&&<div className="plans-empty"><Image src="/logo-neemias-prime.png" alt="" width={54} height={54}/><strong>Novos planos em preparação</strong><p>Fale com nossa equipe para conhecer as opções disponíveis hoje.</p><a href="https://wa.me/5521959438832" target="_blank" rel="noreferrer">CHAMAR NO WHATSAPP →</a></div>}</section></>}
      {!membership?.plans&&<footer className="plans-help"><span>FICOU COM ALGUMA DÚVIDA?</span><p>Nossa equipe explica a cobertura e ajuda você a escolher o melhor plano.</p><a href="https://wa.me/5521959438832" target="_blank" rel="noreferrer">CHAMAR NO WHATSAPP →</a></footer>}
    </div></section><ClientMobileNav active="plans" onNavigate={onNavigate}/>
  </main>;
}

function ProfilePanel({profile,accountEmail,onUpdated,onNavigate}:{profile:Profile|null;accountEmail:string;onUpdated:(profile:Profile|null)=>void;onNavigate:(section:ClientSection)=>void}) {
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

  return <main className={`${styles.root} portal-shell`}>
    <ClientSidebar active="profile" profileName={profile?.full_name||"Cliente Prime"} isAdmin={profile?.role==="admin"} onNavigate={onNavigate}/>
    <section className="portal-main profile-shell"><ClientTopbar active="profile" profileName={profile?.full_name||"Cliente Prime"} isAdmin={profile?.role==="admin"} onNavigate={onNavigate}/><div className="profile-page">
      <div className="profile-intro"><div className="profile-avatar-large">{(profile?.full_name||"Cliente").split(" ").slice(0,2).map(x=>x[0]).join("")}</div><div><p>MINHA CONTA PRIME</p><h1>Seu perfil, do seu jeito.</h1><span>Mantenha seus dados atualizados para facilitar o atendimento.</span></div></div>
      <form className="profile-form" onSubmit={save}>
        <section><header><span>01</span><div><h2>Dados pessoais</h2><p>Informações utilizadas pela barbearia.</p></div></header><div className="profile-fields"><label>Nome completo<input value={fullName} onChange={event=>setFullName(event.target.value)} autoComplete="name" required/></label><label>Telefone<input value={phone} onChange={event=>setPhone(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="(21) 99999-9999"/></label><label className="full-field">E-mail da conta<input value={accountEmail} disabled/><small>O e-mail de acesso não pode ser alterado por aqui.</small></label></div></section>
        <section><header><span>02</span><div><h2>Segurança</h2><p>Preencha somente se quiser trocar sua senha.</p></div></header><div className="profile-fields"><label>Nova senha<input value={password} onChange={event=>setPassword(event.target.value)} type="password" minLength={6} autoComplete="new-password" placeholder="Mínimo de 6 caracteres"/></label><label>Confirmar nova senha<input value={confirmation} onChange={event=>setConfirmation(event.target.value)} type="password" minLength={6} autoComplete="new-password" placeholder="Repita a nova senha"/></label></div></section>
        {error&&<div className="profile-feedback error" role="alert">{error}</div>}{message&&<div className="profile-feedback success" role="status">✓ {message}</div>}
        <footer><div><small>PRIVACIDADE</small><span>Seus dados são usados apenas para sua experiência na Neemias Prime.</span></div><button disabled={saving}>{saving?"SALVANDO...":"SALVAR ALTERAÇÕES"}<i>→</i></button></footer>
      </form>
    </div></section><ClientMobileNav active="profile" onNavigate={onNavigate}/>
  </main>;
}
