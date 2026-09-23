import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

function mensagemErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (msg) return String(msg);
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
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

    // Evitamos o embedding automático do Supabase (socio:socios(...), etc.)
    // porque ele depende do nome exato da chave estrangeira no banco — se
    // essa constraint tiver outro nome (ou nunca tiver sido criada com esse
    // nome específico), a consulta inteira falha. Buscamos os acessos
    // primeiro e os dados de sócio/dependente/usuário depois, separadamente.
    let query = supabase
      .from("acessos_sociedade")
      .select("id,socio_id,dependente_id,data_hora_entrada,data_hora_saida,autorizado,motivo_negacao,registrado_por")
      .order("data_hora_entrada", { ascending: false })
      .limit(1000);
    if (de) query = query.gte("data_hora_entrada", `${de}T00:00:00`);
    if (ate) query = query.lte("data_hora_entrada", `${ate}T23:59:59`);

    const { data: acessos, error } = await query;
    if (error) throw error;

    const lista = acessos || [];
    const socioIds = [...new Set(lista.map((a) => a.socio_id).filter(Boolean))];
    const dependenteIds = [...new Set(lista.map((a) => a.dependente_id).filter(Boolean))];
    const usuarioIds = [...new Set(lista.map((a) => a.registrado_por).filter(Boolean))];

    const [sociosResult, dependentesResult, usuariosResult] = await Promise.all([
      socioIds.length
        ? supabase.from("socios").select("id,nome,matricula,foto_url").in("id", socioIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      dependenteIds.length
        ? supabase.from("dependentes").select("id,nome").in("id", dependenteIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      usuarioIds.length
        ? supabase.from("usuarios_sistema").select("id,nome_exibicao").in("id", usuarioIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    if (sociosResult.error) throw sociosResult.error;
    if (dependentesResult.error) throw dependentesResult.error;
    if (usuariosResult.error) throw usuariosResult.error;

    const mapaSocios = new Map((sociosResult.data || []).map((s: any) => [s.id, s]));
    const mapaDependentes = new Map((dependentesResult.data || []).map((d: any) => [d.id, d]));
    const mapaUsuarios = new Map((usuariosResult.data || []).map((u: any) => [u.id, u]));

    const resultado = lista.map((a) => ({
      ...a,
      socio: a.socio_id ? mapaSocios.get(a.socio_id) || null : null,
      dependente: a.dependente_id ? mapaDependentes.get(a.dependente_id) || null : null,
      usuario: a.registrado_por ? mapaUsuarios.get(a.registrado_por) || null : null,
    }));

    return NextResponse.json({ acessos: resultado });
  } catch (error) {
    return NextResponse.json(
      { error: `Erro ao carregar acessos: ${mensagemErro(error, "erro desconhecido")}` },
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
      if (matriculaError) throw matriculaError;
      if (!socioPorMatricula) return NextResponse.json({ error: `Nenhum associado encontrado com a matrícula ${matricula}.` }, { status: 404 });
      id = socioPorMatricula.id;
    }

    let dependente: { id: string; socio_id: string; nome: string; situacao_financeira?: string | null; ativo: boolean | null } | null = null;

    if (dependenteId) {
      etapa = "buscando dependente";
      const { data: dep, error: depError } = await supabase
        .from("dependentes").select("id,socio_id,nome,situacao_financeira,ativo").eq("id", dependenteId).maybeSingle();
      if (depError) throw depError;
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
    if (socioError) throw socioError;
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
    if (acessoError) throw acessoError;

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
      { error: `Erro ao registrar acesso (${etapa}): ${mensagemErro(error, "erro desconhecido")}` },
      { status: 500 }
    );
  }
}
