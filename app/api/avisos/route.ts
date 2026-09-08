import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario", "associado"]);
  if ("response" in auth) return auth.response;
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("avisos").select("id,titulo,conteudo,categoria,fixado,ativo,publicado_em,criado_por").eq("ativo", true).order("fixado", { ascending: false }).order("publicado_em", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ avisos: data || [] });
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const titulo = String(body?.titulo || "").trim();
    const conteudo = String(body?.conteudo || "").trim();
    if (!titulo || !conteudo) return NextResponse.json({ error: "Título e mensagem são obrigatórios." }, { status: 400 });
    const supabase = getServiceClient();
    const { data, error } = await supabase.from("avisos").insert({ titulo, conteudo, categoria: body?.categoria || "Geral", fixado: body?.fixado === true, ativo: true, criado_por: auth.usuario.id }).select().single();
    if (error) throw error;
    return NextResponse.json({ aviso: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao publicar aviso." }, { status: 500 });
  }
}

