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
    let query = supabase
      .from("acessos_sociedade")
      .select("id,socio_id,dependente_id,data_hora_entrada,data_hora_saida,autorizado,motivo_negacao,registrado_por,observacoes,socio:socios(nome,matricula,foto_url),dependente:dependentes(nome),usuario:usuarios_sistema!acessos_sociedade_registrado_por_fkey(nome_exibicao)")
      .order("data_hora_entrada", { ascending: false })
      .limit(1000);
    if (de) query = query.gte("data_hora_entrada", `${de}T00:00:00`);
    if (ate) query = query.lte("data_hora_entrada", `${ate}T23:59:59`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ acessos: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: `Erro ao carregar acessos: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

function situacaoMensalidade(situacaoFinanceira: string | null | undefined) {
  const v = String(situacaoFinanceira || "").toLowerCase();
  if (v === "em_atraso") return { texto: "Em atraso", cor: "vermelho" };
  if (v === "em_dia") return { texto: "Em dia", cor: "verde" };
  if (v === "isento") return { texto: "Isento", cor: "cinza" };
  return { texto: "Não informado", cor: "cinza" };
}

async function verificarMensalidadesAtrasadas(supabase: ReturnType<typeof getServiceClient>, socioId: string) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [emAtraso, emAbertoVencida] = await Promise.all([
    supabase.from("mensalidades").select("id,valor").eq("socio_id", socioId).eq("situacao", "em_atraso"),
    supabase.from("mensalidades").select("id,valor").eq("socio_id", socioId).eq("situacao", "em_aberto").lt("data_vencimento", hoje),
  ]);
  const itens = [...(emAtraso.data || []), ...(emAbertoVencida.data || [])];
  const valorTotal = itens.reduce((soma, m) => soma + Number(m.valor || 0), 0);
  return { atrasado: itens.length > 0, criticoTresMesesOuMais: itens.length >= 3, quantidade: itens.length, valorTotal };
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
      titulo: "🔴 Sócio com 3+ meses de atraso acessou a sociedade",
      mensagem: `${socio.nome} (matrícula ${socio.matricula || "—"}) entrou na sociedade com ${quantidade} mensalidade(s) em atraso (3 meses ou mais), totalizando ${valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      tipo: "urgente",
      prioridade: "alta",
      fixado: false,
      ativo: true,
      publico: "administradores",
      criado_por: criadoPor,
    });
  } catch (e) {
    console.error("Falha ao gerar aviso de inadimplência:", e);
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario"]);
  if ("response" in auth) return auth.response;

  let etapa = "iniciando";

  try {
    const body = await request.json().catch(() => ({}));
    const qr = String(body?.qr || "").trim();
    const socioId = String(body?.socio_id || "").trim();
    const matricula = String(body?.matricula || "").trim();
    let dependenteId = String(body?.dependente_id || "").trim();
    const supabase = getServiceClient();

    let id = socioId;
    if (!id && qr.startsWith("guarani:socio:")) id = qr.replace("guarani:socio:", "");
    if (!dependenteId && qr.startsWith("guarani:dependente:")) dependenteId = qr.replace("guarani:dependente:", "");

    if (!id && !dependenteId && matricula) {
      etapa = "buscando sócio pela matrícula";
      const { data: socioPorMatricula, error: matriculaError } = await supabase
        .from("socios").select("id").eq("matricula", matricula).maybeSingle();
      if (matriculaError) throw new Error(`Falha ao buscar pela matrícula: ${matriculaError.message}`);
      if (!socioPorMatricula) return NextResponse.json({ error: `Nenhum associado encontrado com a matrícula ${matricula}.` }, { status: 404 });
      id = socioPorMatricula.id;
    }

    let dependente: { id: string; socio_id: string; nome: string; situacao_financeira?: string | null; ativo: boolean | null } | null = null;

    if (dependenteId) {
      etapa = "buscando dependente";
      const { data: dep, error: depError } = await supabase
        .from("dependentes").select("id,socio_id,nome,situacao_financeira,ativo").eq("id", dependenteId).maybeSingle();
      if (depError) throw new Error(`Falha ao buscar dependente: ${depError.message}`);
      if (!dep || dep.ativo === false) return NextResponse.json({ error: "Dependente não encontrado ou inativo." }, { status: 404 });
      dependente = dep;
      id = String(dep.socio_id);
    }

    if (!id) return NextResponse.json({ error: "QR Code inválido ou sem identificação do associado." }, { status: 400 });

    etapa = "buscando sócio";
    const { data: socio, error: socioError } = await supabase
      .from("socios")
      .select("id,matricula,nome,cpf,tipo_socio,categoria,situacao,situacao_financeira,foto_url")
      .eq("id", id).maybeSingle();
    if (socioError) throw new Error(`Falha ao buscar associado: ${socioError.message}`);
    if (!socio) return NextResponse.json({ error: "Associado não encontrado." }, { status: 404 });

    const situacao = String(socio.situacao || "").toLowerCase();
    const autorizado = ["ativo", "ativa", "em_dia"].includes(situacao) || !situacao;
    const motivoNegacao = autorizado ? null : `Situação do sócio: ${socio.situacao || "não informada"}`;

    etapa = "registrando acesso";
    const { data: acesso, error: acessoError } = await supabase
      .from("acessos_sociedade")
      .insert({
        socio_id: socio.id,
        dependente_id: dependenteId || null,
        registrado_por: auth.usuario.id,
        autorizado,
        motivo_negacao: motivoNegacao,
      })
      .select("id,socio_id,dependente_id,data_hora_entrada,autorizado,motivo_negacao")
      .single();
    if (acessoError) throw new Error(`Falha ao registrar a entrada: ${acessoError.message}`);

    etapa = "verificando mensalidades";
    const statusMensalidadeSocio = situacaoMensalidade(socio.situacao_financeira);
    const statusMensalidadeDependente = dependente ? situacaoMensalidade(dependente.situacao_financeira) : null;

    const inadimplenciaSocio = await verificarMensalidadesAtrasadas(supabase, socio.id);
    if (inadimplenciaSocio.criticoTresMesesOuMais) {
      etapa = "gerando aviso de inadimplência";
      await avisarAdministradoresInadimplencia(supabase, socio, inadimplenciaSocio.quantidade, inadimplenciaSocio.valorTotal, auth.usuario.id);
    }

    const exame = {
      status: { texto: "Controle de exame médico ainda não configurado", cor: "cinza" },
      validade: null,
      verificado: false,
    };

    return NextResponse.json({
      acesso,
      socio,
      dependente,
      liberado: autorizado,
      exame,
      mensalidade: dependente ? statusMensalidadeDependente : statusMensalidadeSocio,
      inadimplencia: inadimplenciaSocio,
    });
  } catch (error) {
    console.error(`Erro ao registrar acesso (etapa: ${etapa}):`, error);
    return NextResponse.json(
      { error: `Erro ao registrar acesso (${etapa}): ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
