"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "../entrar/auth.module.css";

export default function RedefinirSenha() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password !== confirmation) { setError("As senhas precisam ser iguais."); return; }
    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError("Este link expirou ou já foi usado. Solicite um novo link.");
    else setDone(true);
    setLoading(false);
  }

  return (
    <main className={`${styles.root} reset-auth`}>
      <section className="auth-scene" aria-label="Neemias Prime">
        <Image src="/neemias-prime-fachada-instagram.jpg" alt="Fachada real da Barbearia Neemias Prime" fill priority sizes="(max-width: 820px) 100vw, 54vw" /><div className="auth-scene-shade" />
        <Link href="/" className="auth-logo"><Image src="/logo-neemias-prime.png" alt="Neemias Prime" width={46} height={46} /><span>NEEMIAS <b>PRIME</b></span></Link>
        <div className="auth-scene-copy"><p><i /> ACESSO SEGURO</p><h1>Nova senha,<br /><em>mesma experiência.</em></h1></div>
      </section>
      <section className="auth-form-side"><div className="auth-form-wrap">
        {done ? <div className="auth-sent-state"><div className="sent-icon">✓</div><p className="auth-eyebrow">SENHA ATUALIZADA</p><h2>Tudo pronto.</h2><p>Sua nova senha já está ativa. Agora você pode voltar para sua conta e agendar.</p><Link className="auth-primary" href="/entrar">ENTRAR NA MINHA CONTA <span>→</span></Link></div> : <><div className="auth-heading"><p className="auth-eyebrow">SEGURANÇA DA CONTA</p><h2>Crie uma nova senha</h2><p>Use pelo menos 6 caracteres e não compartilhe sua senha.</p></div><form onSubmit={submit} className="prime-auth-form"><label>Nova senha<span className="password-field"><input name="password" type={showPassword ? "text" : "password"} minLength={6} required placeholder="Mínimo de 6 caracteres" /><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? "—" : "◉"}</button></span></label><label>Confirmar nova senha<input name="confirmation" type={showPassword ? "text" : "password"} minLength={6} required placeholder="Digite a senha novamente" /></label>{error && <div className="auth-feedback error" role="alert">{error}</div>}<button className="auth-primary" disabled={loading}>{loading ? "SALVANDO..." : "SALVAR NOVA SENHA"}<span>→</span></button></form></>}
      </div></section>
    </main>
  );
}
