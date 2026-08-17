import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

type AuthBody = {
  action?: "login" | "register";
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
};

export async function POST(request: NextRequest) {
  const body = await request.json() as AuthBody;
  const email = body.email?.trim() || "";
  const password = body.password || "";

  if (!email || !password || !["login", "register"].includes(body.action || "")) {
    return NextResponse.json({ ok: false, message: "Dados de acesso inválidos." }, { status: 400 });
  }

  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, { ...options, path: "/" });
          });
        },
      },
    },
  );

  if (body.action === "register") {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: body.fullName?.trim() || "", phone: body.phone?.trim() || "" },
        emailRedirectTo: `${request.nextUrl.origin}/auth/callback?next=/cliente`,
      },
    });
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    const result = NextResponse.json(
      { ok: true, needsConfirmation: !data.session },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    return result;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ ok: false, message: "E-mail ou senha incorretos." }, { status: 401 });
  return response;
}
