import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // A agenda do cliente agora é uma aba interna. Mantemos o endereço antigo
  // funcionando sem submetê-lo a uma segunda autenticação de rota.
  if (request.nextUrl.pathname === "/cliente/agendamentos") {
    const url = request.nextUrl.clone();
    url.pathname = "/cliente";
    url.search = "";
    url.hash = "meus-agendamentos";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const protectedRoute = request.nextUrl.pathname.startsWith("/cliente") || request.nextUrl.pathname.startsWith("/admin");
  const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // A vitrine pública e a tela de entrada continuam disponíveis mesmo durante
  // uma indisponibilidade de configuração. Rotas privadas permanecem fechadas.
  if(!supabaseUrl||!supabaseKey){
    if(protectedRoute){
      const url=request.nextUrl.clone();
      url.pathname="/entrar";
      url.searchParams.set("retorno",request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
    return response;
  }
  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // getUser valida e renova a sessão. Isso evita que uma troca de rota use
  // um token antigo e mande o cliente de volta para o login.
  let user=null;
  try {
    const result=await supabase.auth.getUser();
    user=result.data.user;
  } catch {
    user=null;
  }
  const loggedIn = Boolean(user);

  function redirectWithSession(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (protectedRoute && !loggedIn) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("retorno", request.nextUrl.pathname);
    return redirectWithSession(url);
  }

  // Links públicos ainda apontam para /entrar. Se a pessoa já estiver
  // conectada, ela segue direto para a área dela sem precisar logar de novo.
  if (request.nextUrl.pathname === "/entrar" && loggedIn) {
    const requestedReturn = request.nextUrl.searchParams.get("retorno");
    const destination = requestedReturn?.startsWith("/") ? requestedReturn : "/cliente";
    const url = request.nextUrl.clone();
    url.pathname = destination;
    url.search = "";
    return redirectWithSession(url);
  }
  return response;
}
