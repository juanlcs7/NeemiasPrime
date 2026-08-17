"use client";

import Image from "next/image";
import Link from "next/link";
import { PrimeArrowIcon } from "@/components/prime-icons";
import { CSSProperties, FormEvent, MouseEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./auth.module.css";

type AuthMode = "login" | "register" | "forgot" | "sent";

function EntrarForm() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const router = useRouter();
  const search = useSearchParams();

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const supabase = createClient();

    if (mode === "forgot") {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/callback?next=/redefinir-senha`,
      });
      if (resetError) setError("Não foi possível enviar o link. Confira o e-mail e tente novamente.");
      else { setSentEmail(email); setMode("sent"); }
      setLoading(false);
      return;
    }

    if (mode === "register") {
      const fullName = String(form.get("name") || "").trim();
      const phone = String(form.get("phone") || "").trim();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, phone }, emailRedirectTo: `${location.origin}/auth/callback?next=/cliente` },
      });
      if (signUpError) setError(signUpError.message);
      else if (signUpData.session) {
        router.push(search.get("retorno") || "/cliente");
        router.refresh();
      } else setConfirmationEmail(email);
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) setError("E-mail ou senha incorretos.");
      else { router.push(search.get("retorno") || "/cliente"); router.refresh(); }
    }
    setLoading(false);
  }

  async function signInWithGoogle() {
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=/cliente` },
    });
    if (oauthError) {
      setError("O acesso com Google ainda não está disponível. Use seu e-mail e senha.");
      setLoading(false);
    }
  }

  const title = mode === "register" ? "Crie sua conta Prime" : mode === "forgot" ? "Recupere seu acesso" : "Bem-vindo de volta";
  const subtitle = mode === "register" ? "Seus próximos horários começam aqui." : mode === "forgot" ? "Enviaremos um link seguro para criar uma nova senha." : "Entre para agendar e acompanhar seus horários.";

  function moveLight(event: MouseEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mouse-x", `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty("--mouse-y", `${event.clientY - bounds.top}px`);
  }

  return (
    <main className={styles.root} onMouseMove={moveLight} style={{ "--mouse-x": "72%", "--mouse-y": "38%" } as CSSProperties}>
      <section className="auth-scene" aria-label="Experiência Neemias Prime">
        <Image src="/neemias-hero.webp" alt="Cliente na cadeira da Barbearia Neemias Prime" fill priority sizes="(max-width: 820px) 100vw, 54vw" />
        <div className="auth-scene-shade" />
        <div className="auth-light-follow" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
        <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
        <div className="auth-particles" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
        <Link href="/" className="auth-logo"><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={46} height={46} /><span>NEEMIAS <b>PRIME</b></span></Link>
        <div className="auth-scene-copy">
          <p><i /> BARBEARIA · ESTILO · EXPERIÊNCIA</p>
          <h1>Seu estilo,<br /><em>no seu tempo.</em></h1>
          <span>Agende com Breno, Agatha, Matheus ou Neemias.</span>
        </div>
        <div className="auth-availability"><small>AGENDA ONLINE</small><strong><i /> Horários em tempo real</strong></div>
        <div className="auth-place">BELFORD ROXO · RJ <b><PrimeArrowIcon /></b></div>
      </section>

      <section className="auth-form-side">
        <Link href="/" className="auth-mobile-logo"><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={36} height={36} /><span>NEEMIAS PRIME</span></Link>
        <div className="auth-form-wrap" key={mode}>
          {mode === "sent" ? (
            <div className="auth-sent-state">
              <div className="sent-icon">✓</div><p className="auth-eyebrow">LINK ENVIADO</p><h2>Confira seu e-mail.</h2>
              <p>Enviamos as instruções para <strong>{sentEmail}</strong>. O link permite cadastrar uma nova senha com segurança.</p>
              <button type="button" className="auth-primary" onClick={() => changeMode("login")}>VOLTAR PARA ENTRAR <span>→</span></button>
            </div>
          ) : (
            <>
              <div className="auth-heading">
                <span className="auth-step">{mode === "register" ? "02" : mode === "forgot" ? "03" : "01"} / 03</span>
                <p className="auth-eyebrow">ÁREA DO CLIENTE</p><h2>{title}</h2><p>{subtitle}</p>
              </div>
              <div className="auth-progress" aria-hidden="true"><i className={mode === "login" ? "active" : ""}/><i className={mode === "register" ? "active" : ""}/><i className={mode === "forgot" ? "active" : ""}/></div>
              {mode !== "forgot" && <button type="button" className="oauth-button" onClick={signInWithGoogle} disabled={loading}><span className="google-mark" aria-hidden="true">G</span> Continuar com Google</button>}
              {mode !== "forgot" && <div className="auth-divider"><span>ou continue com e-mail</span></div>}
              <form onSubmit={submit} className="prime-auth-form">
                {mode === "register" && <div className="auth-row"><label>Nome completo<input name="name" autoComplete="name" required placeholder="Como podemos chamar você?" /></label><label>WhatsApp<input name="phone" type="tel" autoComplete="tel" required placeholder="(21) 99999-9999" /></label></div>}
                <label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="voce@email.com" /></label>
                {mode !== "forgot" && <label><span className="label-line">Senha {mode === "login" && <button type="button" onClick={() => changeMode("forgot")}>Esqueci minha senha</button>}</span><span className="password-field"><input name="password" type={showPassword ? "text" : "password"} minLength={6} autoComplete={mode === "register" ? "new-password" : "current-password"} required placeholder="Mínimo de 6 caracteres" /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? "—" : "◉"}</button></span></label>}
                {error && <div className="auth-feedback error" role="alert">{error}</div>}
                {message && <div className="auth-feedback success" role="status">{message}</div>}
                <button className="auth-primary" disabled={loading}>{loading ? "AGUARDE..." : mode === "login" ? "ENTRAR NA MINHA CONTA" : mode === "register" ? "CRIAR MINHA CONTA" : "ENVIAR LINK"}<span>→</span></button>
              </form>
              <p className="auth-switch">{mode === "login" ? "Ainda não tem uma conta?" : mode === "register" ? "Já possui uma conta?" : "Lembrou sua senha?"}<button type="button" onClick={() => changeMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Criar conta" : "Entrar"}</button></p>
            </>
          )}
        </div>
        <footer className="auth-footer"><span>© 2026 NEEMIAS PRIME</span><span>SEUS DADOS PROTEGIDOS</span></footer>
      </section>
      {confirmationEmail && (
        <div className="signup-modal-backdrop" role="presentation">
          <section className="signup-modal" role="dialog" aria-modal="true" aria-labelledby="signup-modal-title">
            <button className="signup-modal-close" type="button" aria-label="Fechar confirmação" onClick={() => { setConfirmationEmail(""); changeMode("login"); }}>×</button>
            <div className="signup-modal-glow" aria-hidden="true" />
            <div className="signup-modal-orbit" aria-hidden="true"><span>✦</span></div>
            <p className="signup-modal-kicker">FALTA SÓ UM PASSO</p>
            <h2 id="signup-modal-title">Quase lá!</h2>
            <p className="signup-modal-lead">Agora confirme seu e-mail para vir para <strong>a melhor da Baixada.</strong></p>
            <div className="signup-email"><span>ENVIAMOS PARA</span><b>{confirmationEmail}</b></div>
            <p className="signup-modal-hint">Abra a mensagem da Neemias Prime e toque no link de confirmação. Depois é só entrar e escolher seu horário.</p>
            <button className="auth-primary" type="button" onClick={() => { setConfirmationEmail(""); changeMode("login"); }}>ENTENDI, VOU CONFIRMAR <span>→</span></button>
            <small>Não encontrou? Verifique também a caixa de spam.</small>
          </section>
        </div>
      )}
    </main>
  );
}

export default function Entrar() { return <Suspense fallback={<main className={styles.root} />}><EntrarForm /></Suspense>; }
