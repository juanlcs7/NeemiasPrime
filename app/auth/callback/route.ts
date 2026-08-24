import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requested = searchParams.get("next");
  const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/cliente";
  if (!code) return NextResponse.redirect(`${origin}/entrar?erro=callback`);
  const supabase = await createClient();
  const {error}=await supabase.auth.exchangeCodeForSession(code);
  if(error)return NextResponse.redirect(`${origin}/entrar?erro=callback`);
  return NextResponse.redirect(`${origin}${next}`);
}
