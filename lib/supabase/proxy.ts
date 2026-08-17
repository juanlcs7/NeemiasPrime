import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
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
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = Boolean(user);
  const protectedRoute = request.nextUrl.pathname.startsWith("/cliente") || request.nextUrl.pathname.startsWith("/admin");

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
