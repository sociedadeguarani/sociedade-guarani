import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario"]);
  if ("response" in auth) return auth.response;
  try {
    const supabase = getServiceClient();
    const { searchParams } = new URL(request.url);
    const de = searchParams.get("de");
    const ate = searchParams.get("ate");
    let query = supabase.from("acessos_sociedade").select("id,socio_id,usuario_id,entrada_em,resultado,observacao").order("entrada_em", { ascending: false }).limit(500);
    if (de) query = query.gte("entrada_em", `${de}T00:00:00`);
    if (ate) query = query.lte("entrada_em", `${ate}T23:59:59`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ acessos: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar acessos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario"]);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const qr = String(body?.qr || "").trim();
    const socioId = String(body?.socio_id || "").trim();
    const supabase = getServiceClient();
    let id = socioId;
    if (!id && qr.startsWith("guarani:socio:")) id = qr.replace("guarani:socio:", "");
    if (!id) return NextResponse.json({ error: "QR Code inválido." }, { status: 400 });
    const { data: socio, error: socioError } = await supabase.from("socios").select("id,matricula,nome,cpf,tipo_socio,categoria,situacao,situacao_financeira").eq("id", id).maybeSingle();
    if (socioError) throw socioError;
    if (!socio) return NextResponse.json({ error: "Associado não encontrado." }, { status: 404 });
    const situacao = String(socio.situacao || "").toLowerCase();
    const liberado = ["ativo", "ativa", "em_dia"].includes(situacao) || !situacao;
    const resultado = liberado ? "liberado" : "bloqueado";
    const { data: acesso, error } = await supabase.from("acessos_sociedade").insert({ socio_id: socio.id, usuario_id: auth.usuario.id, resultado }).select("id,socio_id,usuario_id,entrada_em,resultado,observacao").single();
    if (error) throw error;
    return NextResponse.json({ acesso, socio, liberado });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao registrar acesso." }, { status: 500 });
  }
}
