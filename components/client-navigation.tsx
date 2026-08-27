"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "./client-navigation.module.css";

export type ClientSection="home"|"booking"|"appointments"|"plans"|"profile";
type Props={active:ClientSection;profileName:string;isAdmin:boolean;onNavigate:(section:ClientSection)=>void};

const items:{id:ClientSection;label:string;mobile:string}[]=[
  {id:"home",label:"Visão geral",mobile:"Início"},
  {id:"booking",label:"Agendar",mobile:"Agendar"},
  {id:"appointments",label:"Meus agendamentos",mobile:"Horários"},
  {id:"plans",label:"Meu plano",mobile:"Plano"},
  {id:"profile",label:"Editar perfil",mobile:"Perfil"},
];

function NavIcon({id}:{id:ClientSection}){
  if(id==="home")return <svg viewBox="0 0 24 24"><path d="m4 10 8-6 8 6v10h-6v-6h-4v6H4V10Z"/></svg>;
  if(id==="booking")return <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>;
  if(id==="appointments")return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5h4"/></svg>;
  if(id==="plans")return <svg viewBox="0 0 24 24"><path d="M8 20h8M12 17v3M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z"/><path d="M7 14h10"/></svg>;
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20c.7-4 2.9-6 6.5-6s5.8 2 6.5 6"/></svg>;
}

function initials(name:string){return(name||"NP").split(" ").filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase();}

export function ClientSidebar({active,profileName,isAdmin,onNavigate}:Props){
  return <aside className={styles.sidebar}>
    <Link href="/" className={styles.brand}><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={48} height={48}/><span>NEEMIAS <b>PRIME</b><small>ÁREA DO CLIENTE</small></span></Link>
    <div className={styles.sideProfile}><span>{initials(profileName)}</span><div><small>BEM-VINDO</small><strong>{profileName||"Cliente Prime"}</strong></div></div>
    <nav>{items.map(item=><button type="button" key={item.id} className={active===item.id?styles.active:""} aria-current={active===item.id?"page":undefined} onClick={()=>onNavigate(item.id)}><i><NavIcon id={item.id}/></i><span>{item.label}</span>{active===item.id&&<b/>}</button>)}</nav>
    {isAdmin&&<Link href="/admin" className={styles.adminAccess}><i><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg></i><span><small>ACESSO LIBERADO</small>Painel administrativo</span><b>→</b></Link>}
    <Link className={styles.logout} href="/sair"><span>Sair da conta</span><b>→</b></Link>
  </aside>;
}

export function ClientTopbar({active,profileName,isAdmin,onNavigate}:{active:ClientSection;profileName:string;isAdmin:boolean;onNavigate:(section:ClientSection)=>void}){
  const current=items.find(item=>item.id===active)?.label||"Visão geral";
  return <header className={styles.topbar}>
    <Link href="/" className={styles.mobileBrand}><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={37} height={37}/><span>NEEMIAS <b>PRIME</b></span></Link>
    <div className={styles.location}><small>ÁREA DO CLIENTE</small><strong>{current}</strong></div>
    {isAdmin&&<Link href="/admin" className={styles.topAdmin} aria-label="Abrir painel administrativo"><span>ADMIN</span><b>▦</b></Link>}
    <button type="button" className={`${styles.profileButton} ${active==="profile"?styles.profileActive:""}`} onClick={()=>onNavigate("profile")} aria-label="Abrir meu perfil"><span>{initials(profileName)}</span><div><small>MINHA CONTA</small><strong>{profileName||"Cliente Prime"}</strong></div><i>›</i></button>
  </header>;
}

export function ClientMobileNav({active,onNavigate}:{active:ClientSection;onNavigate:(section:ClientSection)=>void}){
  return <nav className={styles.mobileNav} aria-label="Navegação do cliente">{items.map(item=><button type="button" key={item.id} className={`${active===item.id?styles.mobileActive:""} ${item.id==="booking"?styles.bookingButton:""}`} aria-current={active===item.id?"page":undefined} onClick={()=>onNavigate(item.id)}><i><NavIcon id={item.id}/></i><span>{item.mobile}</span></button>)}</nav>;
}
