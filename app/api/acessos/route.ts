import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

function extrairSocioId(qr: string) {
  const valor = String(qr || "").trim();
  if (!valor) return "";
  if (valor.startsWith("guarani:socio:")) return valor.replace("guarani:socio:", "").trim();
  try {
    const url = new URL(valor);
    const id = url.searchParams.get("id") || url.searchParams.get("socio_id");
    if (id) return id.trim();
  } catch {
    // Não é uma URL; abaixo tratamos como possível UUID direto.
  }
  return valor;
}

function statusExame(dataValidade: string | null | undefined) {
  if (!dataValidade) return { codigo: "nao_informado", texto: "Exame não informado", cor: "cinza" };
  const validade = new Date(dataValidade);
  if (Number.isNaN(validade.getTime())) return { codigo: "nao_informado", texto: "Exame não informado", cor: "cinza" };
  const agora = new Date();
  const fimDoDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);
  if (validade >= fimDoDia) return { codigo: "em_dia", texto: "Exame em dia", cor: "verde" };

  const doisMesesAtras = new Date(agora);
  doisMesesAtras.setMonth(doisMesesAtras.getMonth() - 2);
  if (validade >= doisMesesAtras) return { codigo: "atrasado_ate_2_meses", texto: "Exame atrasado até 2 meses", cor: "amarelo" };
  return { codigo: "muito_atrasado", texto: "Exame muito atrasado", cor: "vermelho" };
}

async function buscarExame(supabase: ReturnType<typeof getServiceClient>, socioId: string) {
  // O cadastro de exame é mantido no módulo de acessos/piscina. Se a instalação
  // ainda não tiver esses campos, o acesso continua sendo registrado e o exame
  // aparece como "não informado" em vez de bloquear a portaria.
  try {
    const { data, error } = await supabase
      .from("acessos_piscina")
      .select("exame_validade,exame_verificado,data_hora_entrada")
      .eq("socio_id", socioId)
      .order("data_hora_entrada", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { validade: null, verificado: false, status: statusExame(null) };
    return {
      validade: data.exame_validade || null,
      verificado: Boolean(data.exame_verificado),
      status: statusExame(data.exame_validade),
    };
  } catch {
    return { validade: null, verificado: false, status: statusExame(null) };
  }
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario"]);
  if ("response" in auth) return auth.response;
  try {
    const supabase = getServiceClient();
    const { searchParams } = new URL(request.url);
    const de = searchParams.get("de");
    const ate = searchParams.get("ate");
    let query = supabase.from("acessos_sociedade").select("id,socio_id,usuario_id,entrada_em,local,resultado,observacao,socio:socios(matricula,nome,tipo_socio,categoria,situacao),usuario:usuarios_sistema(nome_exibicao)").order("entrada_em", { ascending: false }).limit(500);
    if (de) query = query.gte("entrada_em", `${de}T00:00:00`);
    if (ate) query = query.lte("entrada_em", `${ate}T23:59:59`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ acessos: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar acessos." }, { status: 500 });
  }
}

async function verificarInadimplencia(supabase: ReturnType<typeof getServiceClient>, socioId: string) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("mensalidades")
    .select("id,competencia,valor,situacao,data_vencimento")
    .eq("socio_id", socioId)
    .in("situacao", ["em_atraso"])
    .order("competencia", { ascending: true });

  if (error || !data) return { atrasado: false, quantidade: 0, valorTotal: 0 };

  // Também considera "em aberto" e já vencida como atraso, caso o job que
  // marca "em_atraso" ainda não tenha rodado para essa competência.
  const { data: emAberto } = await supabase
    .from("mensalidades")
    .select("id,competencia,valor,situacao,data_vencimento")
    .eq("socio_id", socioId)
    .eq("situacao", "em_aberto")
    .lt("data_vencimento", hoje);

  const todasAtrasadas = [...data, ...(emAberto || [])];
  const valorTotal = todasAtrasadas.reduce((soma, m) => soma + Number(m.valor || 0), 0);

  return { atrasado: todasAtrasadas.length > 0, quantidade: todasAtrasadas.length, valorTotal };
}

async function avisarAdministradoresInadimplencia(
  supabase: ReturnType<typeof getServiceClient>,
  socio: { nome: string; matricula: number | string | null },
  quantidade: number,
  valorTotal: number,
  criadoPor: string
) {
  try {
    await supabase.from("avisos").insert({
      titulo: `⚠️ Sócio inadimplente acessou a sociedade`,
      mensagem: `${socio.nome} (matrícula ${socio.matricula || "—"}) entrou na sociedade com ${quantidade} mensalidade(s) em atraso, totalizando ${valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      tipo: "urgente",
      prioridade: "alta",
      fixado: false,
      ativo: true,
      publico: "administradores",
      criado_por: criadoPor,
    });
  } catch {
    // Não deixamos a falha ao gerar o aviso interromper o registro do acesso.
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
    const id = socioId || extrairSocioId(qr);
    if (!id) return NextResponse.json({ error: "QR Code inválido." }, { status: 400 });

    const { data: socio, error: socioError } = await supabase
      .from("socios")
      .select("id,matricula,nome,cpf,tipo_socio,categoria,situacao,situacao_financeira,foto_url")
      .eq("id", id)
      .maybeSingle();
    if (socioError) throw socioError;
    if (!socio) return NextResponse.json({ error: "Associado não encontrado." }, { status: 404 });

    const situacao = String(socio.situacao || "").toLowerCase().replace(/\s+/g, "_");
    const liberado = ["ativo", "ativa", "em_dia", "emdia"].includes(situacao) || !situacao;
    const resultado = liberado ? "liberado" : "bloqueado";
    const exame = await buscarExame(supabase, socio.id);
    const inadimplencia = await verificarInadimplencia(supabase, socio.id);

    const { data: acesso, error } = await supabase
      .from("acessos_sociedade")
      .insert({ socio_id: socio.id, usuario_id: auth.usuario.id, resultado, local: body?.local || "Portaria" })
      .select("id,socio_id,usuario_id,entrada_em,local,resultado,observacao")
      .single();
    if (error) throw error;

    if (inadimplencia.atrasado) {
      await avisarAdministradoresInadimplencia(supabase, socio, inadimplencia.quantidade, inadimplencia.valorTotal, auth.usuario.id);
    }

    return NextResponse.json({ acesso, socio, liberado, exame, inadimplencia });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao registrar acesso." }, { status: 500 });
  }
}
