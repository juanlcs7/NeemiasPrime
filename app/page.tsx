import Image from "next/image";
import Link from "next/link";
import { LandingEffects } from "@/components/landing-effects";
import { PrimeArrowIcon } from "@/components/prime-icons";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const serviceCards = [
  { n:"01",name:"Corte",price:"R$ 40",note:"Clássico, social ou fade",mark:"C" },
  { n:"02",name:"Corte + Barba",price:"R$ 70",note:"A experiência completa",mark:"C+B" },
  { n:"03",name:"Barbaterapia",price:"R$ 60",note:"Toalha quente e cuidado",mark:"BT" },
  { n:"04",name:"Platinado",price:"R$ 150",note:"Transformação de presença",mark:"PL" },
  { n:"05",name:"Corte Infantil",price:"R$ 45",note:"Dos 7 aos 11 anos",mark:"K" },
  { n:"06",name:"Todos os serviços",price:"15 opções",note:"Do acabamento à coloração",mark:"+" },
];
const professionals=["Breno Sousa","Agatha Sousa","Matheus Francisco","Neemias Prime"];
const plans=[
  {name:"Prime 2x",price:"79,90",caption:"Corte ilimitado",days:"Terça e quinta"},
  {name:"Prime Week",price:"99,90",caption:"Corte ilimitado",days:"Terça a sábado",popular:true},
  {name:"Prime Beard",price:"99,90",caption:"Barba ilimitada",days:"Terça a sábado"},
  {name:"Prime Total",price:"149,90",caption:"Corte + barba",days:"Ilimitados"},
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role,full_name").eq("id", user.id).maybeSingle()
    : { data: null };
  const isAdmin = profile?.role === "admin";

  return <main className="landing new-landing">
    <LandingEffects />
    <div className="landing-cursor-glow" aria-hidden="true" />
    <header className="neo-nav">
      <Link href="/" className="prime-brand"><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={46} height={46}/><span>NEEMIAS <b>PRIME</b></span></Link>
      <nav><a href="#experiencia">Experiência</a><a href="#servicos">Serviços</a><a href="#equipe">Equipe</a><a href="#planos">Clube</a></nav>
      <div className="nav-actions">
        {isAdmin && <Link className="nav-admin" href="/admin"><span aria-hidden="true">A</span><b>ADMINISTRAÇÃO</b></Link>}
        <Link className="nav-login" href={user ? "/cliente" : "/entrar"}>{user ? "Minha conta" : "Entrar"}</Link>
        <Link className="lime-button nav-book" href="/entrar?retorno=/cliente"><span className="nav-book-label">AGENDAR</span><PrimeArrowIcon /></Link>
      </div>
    </header>

    <section className="neo-hero">
      <div className="chrome-orbit orbit-one"/><div className="chrome-orbit orbit-two"/>
      <div className="hero-index"><span>BARBEARIA</span><b>01</b><i/></div>
      <div className="neo-copy"><p className="neo-kicker"><i/> BELFORD ROXO · RJ</p><h1>EXPRESSE<br/><span>SUA MELHOR</span><br/>VERSÃO.</h1><p className="neo-lead">Técnica, presença e cuidado em uma experiência criada para quem não aceita qualquer resultado.</p><div className="neo-actions"><Link className="lime-button large" href="/entrar?retorno=/cliente">ESCOLHER MEU HORÁRIO <PrimeArrowIcon /></Link><a href="#experiencia">Explorar a experiência ↓</a></div></div>
      <div className="hero-person hero-real-place"><div className="hero-image-wrap"><Image className="hero-real-image" src="/neemias-prime-fachada-instagram.jpg" alt="Fachada real da Barbearia Neemias Prime em Belford Roxo" fill sizes="(max-width: 900px) 100vw, 65vw" priority/></div><div className="hero-caption"><span>FOTO REAL · INSTAGRAM OFICIAL</span><b>NEEMIAS PRIME · BELFORD ROXO</b></div></div>
      <div className="floating-badge"><b>5.0</b><span>★★★★★</span><small>EXCELÊNCIA<br/>COMPROVADA</small></div>
      <div className="scroll-cue"><i/> ROLE PARA DESCOBRIR</div>
    </section>

    <div className="kinetic-strip"><div>{Array.from({length:2}).map((_,i)=><span key={i}>CORTE <b>✦</b> BARBA <b>✦</b> ESTILO <b>✦</b> PRESENÇA <b>✦</b> NEEMIAS PRIME <b>✦</b></span>)}</div></div>

    <section id="experiencia" className="manifesto-section">
      <div className="manifesto-side"><span>02 / MANIFESTO</span><div className="line"/><small>RUA GONÇALVES<br/>GATTO, 296</small></div>
      <div className="manifesto-main"><p className="neo-kicker"><i/> MAIS QUE UM CORTE</p><h2>Não é vaidade.<br/>É a forma como você<br/><em>entra no mundo.</em></h2><div className="manifesto-copy"><p>A Neemias Prime reúne profissionais treinados, serviço preciso e um ambiente feito para você desacelerar — enquanto sua presença ganha outra força.</p><div><span><b>08+</b> anos elevando o padrão</span><span><b>15</b> serviços em um só lugar</span><span><b>04</b> profissionais Prime</span></div></div></div>
      <div className="manifesto-card manifesto-cut-card"><Image className="manifesto-cut-photo" src="/neemias-prime-corte-real.jpg" alt="Corte masculino realizado pela Barbearia Neemias Prime" fill sizes="(max-width: 1000px) 0px, 30vw"/><div className="manifesto-cut-shade"/><span className="card-number">NP<br/>17</span><p><small>RESULTADO REAL · NEEMIAS PRIME</small>UM CORTE QUE<br/><strong>MUDA A PRESENÇA.</strong></p></div>
    </section>

    <section id="servicos" className="bento-services">
      <header><div><p className="neo-kicker"><i/> CUIDADO COMPLETO</p><h2>Escolha como<br/><em>quer chegar.</em></h2></div><p>Cada serviço é uma construção de imagem. Selecione o seu e veja os horários disponíveis em tempo real.</p></header>
      <div className="service-bento">{serviceCards.map((s,index)=><article className={index===1?"featured-service":""} key={s.name}><div><span>{s.n}</span><b>{s.mark}</b></div><h3>{s.name}</h3><p>{s.note}</p><footer><strong>{s.price}</strong><Link href="/entrar?retorno=/cliente">AGENDAR <PrimeArrowIcon /></Link></footer></article>)}</div>
      <Link className="service-all" href="/entrar?retorno=/cliente"><span>VER CATÁLOGO COMPLETO</span><b>Relaxamento · Reflexo · Pigmentação · Hidratação · Coloração · Limpeza de pele · e mais</b><PrimeArrowIcon /></Link>
    </section>

    <section className="booking-story">
      <div className="booking-phone"><div className="phone-notch"/><p>SEU PRÓXIMO HORÁRIO</p><div className="mini-calendar"><span>TER<small>18</small></span><span className="active">QUA<small>19</small></span><span>QUI<small>20</small></span></div><div className="mini-time"><b>14:30</b><span>Neemias Prime<br/><small>Corte · 45 min</small></span><i>✓</i></div><button>Confirmar agendamento</button></div>
      <div className="booking-story-copy"><span>03 / SEM COMPLICAÇÃO</span><h2>Da vontade<br/>à cadeira em<br/><em>três movimentos.</em></h2><ol><li><b>01</b><span><strong>Escolha o serviço</strong><small>Preço e duração claros, sem surpresa.</small></span></li><li><b>02</b><span><strong>Encontre seu profissional</strong><small>Veja apenas horários realmente livres.</small></span></li><li><b>03</b><span><strong>Confirme. Está marcado.</strong><small>Seu horário fica reservado na hora.</small></span></li></ol><Link className="lime-button large" href="/entrar?retorno=/cliente">AGENDAR AGORA <PrimeArrowIcon /></Link></div>
    </section>

    <section id="equipe" className="team-showcase"><header><p className="neo-kicker"><i/> QUEM FAZ A PRIME</p><h2>Quatro profissionais.<br/><em>Um único padrão.</em></h2></header><div className="team-type">{professionals.map((p,i)=><article key={p}><span>0{i+1}</span><h3>{p}</h3><i>PRIME PROFESSIONAL</i><Link href="/entrar?retorno=/cliente">AGENDAR <PrimeArrowIcon /></Link></article>)}</div></section>

    <section id="planos" className="plans-stage">
      <div className="plans-intro"><p className="neo-kicker"><i/> CLUBE DE ASSINATURA</p><h2>Seu visual não<br/>espera a próxima<br/><em>ocasião.</em></h2><p>Planos para manter corte e barba sempre em dia. O administrador vincula seu plano e o benefício aparece automaticamente no agendamento.</p><div className="club-stamp"><span>CLUBE</span><strong>NP</strong><small>MEMBRO PRIME</small></div></div>
      <div className="plan-stack">{plans.map((p)=><article className={p.popular?"popular-plan":""} key={p.name}>{p.popular&&<span className="popular-label">MAIS ESCOLHIDO</span>}<header><small>{p.name}</small><b>{p.caption}</b></header><div className="plan-price"><span>R$</span><strong>{p.price}</strong><small>/mês</small></div><p>✓ {p.days}<br/>✓ Agendamento online<br/>✓ Benefício automático</p><Link href="https://wa.me/5521959438832" target="_blank">QUERO ESTE PLANO <PrimeArrowIcon /></Link></article>)}</div>
    </section>

    <section className="social-proof"><div><span>5.0</span><div><b>★★★★★</b><p>“Atenção e o capricho<br/>que você merece.”</p></div></div><aside><p>28 AVALIAÇÕES</p><h2>O padrão é percebido.<br/><em>E lembrado.</em></h2><a href="https://www.instagram.com/barbearianeemiasprime/" target="_blank" rel="noreferrer">VER @BARBEARIANEEMIASPRIME <PrimeArrowIcon /></a></aside></section>

    <section className="final-cta"><div className="cta-orbit"/><p className="neo-kicker"><i/> SUA VEZ</p><h2>O próximo nível<br/>do seu estilo está<br/><em>a um horário.</em></h2><Link className="lime-button xlarge" href="/entrar?retorno=/cliente">AGENDAR NA NEEMIAS PRIME <PrimeArrowIcon /></Link><div className="cta-meta"><span>TER–SEX · 9H–20H</span><span>SÁB · 9H–19H</span><span>BELFORD ROXO · RJ</span></div></section>

    <footer className="neo-footer"><Link href="/" className="prime-brand"><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={50} height={50}/><span>NEEMIAS <b>PRIME</b></span></Link><div><a href="#servicos">Serviços</a><a href="#equipe">Equipe</a><a href="#planos">Clube</a><Link href="/entrar">Área do cliente</Link></div><p>Rua Gonçalves Gatto, 296<br/>Centro · Belford Roxo/RJ<br/>(21) 95943-8832</p><small>© 2026 NEEMIAS PRIME<br/>PRESENÇA É TUDO.</small></footer>
  </main>;
}
