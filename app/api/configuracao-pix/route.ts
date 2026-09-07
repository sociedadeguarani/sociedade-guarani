import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração do Supabase incompleta.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function exigirAdministrador(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Acesso não autorizado.");
  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Sessão inválida.");
  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios_sistema")
    .select("id,ativo,perfil_id,perfis:perfil_id(nome)")
    .eq("id", data.user.id)
    .single();
  if (usuarioError || !usuario?.ativo) throw new Error("Usuário sem acesso.");
  const perfil = Array.isArray(usuario.perfis) ? usuario.perfis[0] : usuario.perfis;
  if (perfil?.nome !== "administrador") throw new Error("Somente administradores podem alterar o PIX.");
  return supabase;
}

export async function GET() {
  try {
    const supabase = adminClient();
    const { data, error } = await supabase.from("configuracao_pix").select("id,chave_pix,nome_recebedor,cidade,copia_e_cola,ativo").eq("ativo", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ config: data || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar PIX." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await exigirAdministrador(request);
    const body = await request.json();
    const chave_pix = String(body.chave_pix || "").trim();
    const nome_recebedor = String(body.nome_recebedor || "SOCIEDADE GUARANI").trim();
    const cidade = String(body.cidade || "AUGUSTO PESTANA").trim();
    const copia_e_cola = String(body.copia_e_cola || "").trim();
    if (!copia_e_cola) return NextResponse.json({ error: "Informe o PIX copia e cola para gerar o QR Code." }, { status: 400 });
    await supabase.from("configuracao_pix").update({ ativo: false }).eq("ativo", true);
    const { data, error } = await supabase.from("configuracao_pix").insert({ chave_pix, nome_recebedor, cidade, copia_e_cola, ativo: true }).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, config: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar PIX." }, { status: 403 });
  }
}

