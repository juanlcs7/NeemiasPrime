import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configure as variáveis públicas do Supabase.");
  return createBrowserClient(url, key, {
    isSingleton: true,
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  });
}

// Usa o token que o servidor já validou ao renderizar a área privada. Isso
// evita perder auth.uid() quando o navegador ainda não reconstruiu o cookie.
export function createAuthenticatedClient(accessToken:string) {
  if(!accessToken)return createClient();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error("Configure as variáveis públicas do Supabase.");
  return createSupabaseJsClient(url,key,{
    global:{headers:{Authorization:`Bearer ${accessToken}`}},
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
}
