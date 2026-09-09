import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

function statusExame(dataValidade: string | null | undefined) {
  if (!dataValidade) return { status: "nao_informado", label: "Não informado", cor: "cinza", validade: null };
  const validade = new Date(`${dataValidade}T23:59:59`), hoje = new Date();
  if (validade >= hoje) return { status: "em_dia", label: "Em dia", cor: "verde", validade: dataValidade };
  const doisMeses = new Date(hoje); doisMeses.setMonth(doisMeses.getMonth() - 2);
  if (validade >= doisMeses) return { status: "atrasado", label: "Atrasado até 2 meses", cor: "amarelo", validade: dataValidade };
  return { status: "bem_atrasado", label: "Bem atrasado", cor: "vermelho", validade: dataValidade };
}

async function exame(supabase: ReturnType<typeof getServiceClient>, socioId: string) {
  try {
    const { data, error } = await supabase.from("acessos_piscina").select("*").eq("socio_id", socioId).order("data_hora_entrada", { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return statusExame(null);
    return statusExame(data.exame_validade || data.validade_exame || null);
  } catch { return statusExame(null); }
}

async function inserir(supabase: ReturnType<typeof getServiceClient>, socioId: string, usuarioId: string, resultado: string) {
  const tentativas = [
    { socio_id: socioId, usuario_id: usuarioId, resultado, local: "Portaria - QR Code" },
    { socio_id: socioId, usuario_id: usuarioId, resultado },
    { socio_id: socioId, usuario_id: usuarioId, local: "Portaria - QR Code" },
    { socio_id: socioId, usuario_id: usuarioId },
    { socio_id: socioId, resultado, local: "Portaria - QR Code" },
    { socio_id: socioId },
  ];
  let erro = "Não foi possível registrar o acesso.";
  for (const payload of tentativas) {
    const r = await supabase.from("acessos_sociedade").insert(payload);
    if (!r.error) return { socio_id: socioId, usuario_id: usuarioId, resultado, local: "Portaria - QR Code", entrada_em: new Date().toISOString() };
    erro = r.error.message;
  }
  throw new Error(erro);
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario"]);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const id = String(body?.id || body?.socio_id || "").trim();
    if (!id) return NextResponse.json({ error: "Associado não informado." }, { status: 400 });
    const supabase = getServiceClient();
    const { data: socio, error } = await supabase.from("socios").select("id,matricula,nome,cpf,tipo_socio,categoria,situacao,situacao_financeira,foto_url").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!socio) return NextResponse.json({ error: "Associado não encontrado." }, { status: 404 });
    const situacao = String(socio.situacao || "").toLowerCase().replace(/\s+/g, "_");
    const liberado = ["ativo", "ativa", "em_dia", "emdia"].includes(situacao) || !situacao;
    const resultado = liberado ? "liberado" : "bloqueado";
    const acesso = await inserir(supabase, socio.id, auth.usuario.id, resultado);
    return NextResponse.json({ socio, exame: await exame(supabase, socio.id), liberado, acesso });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao registrar acesso." }, { status: 500 });
  }
}
