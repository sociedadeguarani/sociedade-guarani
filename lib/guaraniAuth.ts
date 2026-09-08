import { createClient } from "@supabase/supabase-js";

export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração do Supabase incompleta.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getUsuarioAutenticado(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return null;
  const auth = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } } = await auth.auth.getUser(token);
  if (!user) return null;
  const admin = getServiceClient();
  const { data: usuario } = await admin.from("usuarios_sistema").select("id,nome_exibicao,socio_id,perfil_id,ativo").eq("id", user.id).maybeSingle();
  if (!usuario?.ativo) return null;
  const { data: perfil } = await admin.from("perfis").select("nome").eq("id", usuario.perfil_id).maybeSingle();
  return { ...usuario, perfil: perfil?.nome || "" };
}

export async function requireRoles(request: Request, roles: string[]) {
  const usuario = await getUsuarioAutenticado(request);
  if (!usuario) return { response: new Response(JSON.stringify({ error: "Não autorizado." }), { status: 401, headers: { "Content-Type": "application/json" } }) };
  if (!roles.includes(usuario.perfil)) return { response: new Response(JSON.stringify({ error: "Sem permissão para esta operação." }), { status: 403, headers: { "Content-Type": "application/json" } }) };
  return { usuario };
}

