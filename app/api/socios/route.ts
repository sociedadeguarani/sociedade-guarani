import { NextResponse } from "next/server";
import { dependenteTemMensalidade } from "@/lib/regrasMensalidade";
import { exigirAdministrador, getServiceClient, requireRoles } from "@/lib/guaraniAuth";
import { classificarStatusFinanceiroCarteirinha, dataHojeBrasil, normalizarPoliticaInadimplencia, POLITICA_INADIMPLENCIA_PADRAO } from "@/lib/politicaInadimplencia";

export const dynamic = "force-dynamic";

const COLUNAS_BASE = [
  "matricula", "nome", "cpf", "rg", "data_nascimento", "telefone", "whatsapp", "email",
  "endereco", "numero", "bairro", "cidade", "estado", "cep", "data_associacao", "categoria",
  "situacao", "observacoes", "tipo_socio", "responsavel_id", "possui_mensalidade", "remido",
];
const COLUNAS_EXTRAS = [
  "foto_url", "parentesco", "valor_mensalidade",
  "dia_vencimento", "tipo_pagamento", "conta_bancaria_id", "modalidade_temporada", "inicio_temporada", "fim_temporada",
  "situacao_financeira", "data_ultimo_pagamento",
];

function limparObjeto(body: Record<string, unknown>, colunas: string[]) {
  return Object.fromEntries(colunas.filter((c) => body[c] !== undefined).map((c) => [c, body[c]]));
}
function erroBanco(error: unknown) {
  const e = error as { message?: string; details?: string; hint?: string; code?: string } | null;
  return [e?.message, e?.details, e?.hint, e?.code ? `Código ${e.code}` : ""].filter(Boolean).join(" — ");
}

function normalizarClassificacao(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}


function mensalidadePaga(situacao: unknown) {
  const status = String(situacao || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return ["pago", "paga", "paid", "quitado", "quitada", "recebido", "recebida", "baixado", "baixada", "confirmado", "confirmada", "compensado", "compensada", "isento", "isenta", "cancelado", "cancelada"].includes(status);
}

function agruparAtrasos(mensalidades: Array<Record<string, unknown>>, hoje: string) {
  const mapa = new Map<string, Set<string>>();
  for (const m of mensalidades) {
    const id = String(m.socio_id || "");
    const competenciaInformada = String(m.competencia || "").slice(0, 7);
    const vencimentoInformado = String(m.data_vencimento || "").slice(0, 10);
    // Em registros antigos sem data_vencimento, competência de mês anterior
    // ainda identifica uma cobrança vencida. A competência do mês corrente
    // não é marcada como atraso sem uma data de vencimento confirmada.
    const vencimento = vencimentoInformado || (/^\d{4}-\d{2}$/.test(competenciaInformada) && competenciaInformada < hoje.slice(0, 7) ? `${competenciaInformada}-01` : "");
    if (!id || !vencimento || vencimento >= hoje || mensalidadePaga(m.situacao)) continue;
    const competencia = String(m.competencia || vencimento).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(competencia)) continue;
    const lista = mapa.get(id) || new Set<string>();
    lista.add(competencia);
    mapa.set(id, lista);
  }
  return mapa;
}

function deveExibirNaListaSocios(socio: Record<string, unknown>): boolean {
  const matricula = String(socio.matricula ?? "").trim().toUpperCase();
  // A matrícula-base A representa o titular e sempre aparece em Sócios;
  // B representa cônjuge familiar e pertence à listagem de Dependentes.
  if (matricula.endsWith("A")) return true;
  if (matricula.endsWith("B")) return false;

  const tipo = normalizarClassificacao(socio.tipo_socio);
  const categoria = normalizarClassificacao(socio.categoria);
  const ehDependente = Boolean(socio.responsavel_id) || tipo.startsWith("dependente_") || categoria.includes("dependente");

  // Titulares são registros de associados e não podem desaparecer da tela
  // só porque a cobrança própria está desativada ou o cadastro é remido.
  if (!ehDependente) return true;

  // Em dependentes, vale a classificação explícita. Isso evita que um
  // possui_mensalidade antigo ou uma categoria textual genérica gere conflito.
  return dependenteTemMensalidade({
    categoria: typeof socio.categoria === "string" ? socio.categoria : null,
    tipo_socio: typeof socio.tipo_socio === "string" ? socio.tipo_socio : null,
    possui_mensalidade: socio.possui_mensalidade,
  });
}

export async function GET(request: Request) {
  try {
    const auth = await requireRoles(request, ["funcionario", "funcionario_inventario", "administrador_master", "administrador"], ["menu.socios", "socios.consultar"]);
    if ("response" in auth) return auth.response;
    const db = getServiceClient();
    const permissoes = Array.isArray(auth.usuario.permissoes) ? auth.usuario.permissoes : [];
    const podeVerFinanceiro = auth.usuario.perfil === "administrador_master" || permissoes.includes("socios.ver_financeiro");
    const podeVerExameMedico = auth.usuario.perfil === "administrador_master" || permissoes.includes("socios.ver_exame_medico");
    const colunasFinanceiras = new Set(["possui_mensalidade", ...COLUNAS_EXTRAS.filter((coluna) => ["valor_mensalidade", "dia_vencimento", "tipo_pagamento", "conta_bancaria_id", "situacao_financeira", "data_ultimo_pagamento"].includes(coluna))]);
    const colunas = [
      ...COLUNAS_BASE.filter((coluna) => podeVerFinanceiro || !colunasFinanceiras.has(coluna)),
      ...COLUNAS_EXTRAS.filter((coluna) => podeVerFinanceiro || !colunasFinanceiras.has(coluna)),
    ];
    const camposVisiveis = { financeiro: podeVerFinanceiro, exameMedico: podeVerExameMedico };
    const url = new URL(request.url);
    if (url.searchParams.get("resumo") === "1") {
      // O resumo precisa refletir a mesma lista visível em /socios, não apenas
      // quem possui_mensalidade=true. O filtro antigo subcontava titulares
      // remidos e cadastros válidos sem cobrança própria.
      const { data: resumoRaw, error: erroResumo } = await db
        .from("socios")
        .select("id,matricula,nome,categoria,tipo_socio,responsavel_id,possui_mensalidade,remido,situacao")
        .order("matricula", { ascending: true });
      if (erroResumo) return NextResponse.json({ error: erroBanco(erroResumo) }, { status: 500 });

      const registrosResumo = (resumoRaw || []) as unknown as Array<Record<string, unknown>>;
      const exibidos = registrosResumo.filter(deveExibirNaListaSocios);
      const ativos = exibidos.filter((socio) => normalizarClassificacao(socio.situacao) === "ativo").length;
      const inativos = exibidos.filter((socio) => ["inativo", "suspenso"].includes(normalizarClassificacao(socio.situacao))).length;
      return NextResponse.json({ total: exibidos.length, ativos, inativos, camposVisiveis }, {
        headers: { "Cache-Control": "no-store, max-age=0" },
      });
    }
    // Carregamos possui_mensalidade internamente para calcular a visibilidade da lista.
    // Para perfis sem permissão financeira, retornamos apenas o indicador de exibição,
    // nunca o campo financeiro nem valores de mensalidade.
    const colunasConsulta = Array.from(new Set(["id", ...colunas, "possui_mensalidade"]));
    const consulta = await db
      .from("socios")
      .select(colunasConsulta.join(","))
      .order("matricula", { ascending: true });
    if (consulta.error) {
      return NextResponse.json({ error: erroBanco(consulta.error) }, { status: 500 });
    }

    // O select dinâmico do Supabase pode produzir GenericStringError no tipo
    // estático, embora a resposta bem-sucedida seja uma lista de registros.
    // A conversão passa por unknown para manter a fronteira explícita.
    const registros = (consulta.data ?? []) as unknown as Array<Record<string, unknown>>;
    let atrasos = new Map<string, Set<string>>();
    let politica = POLITICA_INADIMPLENCIA_PADRAO;
    if (podeVerFinanceiro) {
      const hoje = dataHojeBrasil();
      const config = await db.from("configuracoes_acessos").select("meses_atencao,meses_bloqueio").eq("id", 1).maybeSingle();
      if (!config.error && config.data) politica = normalizarPoliticaInadimplencia(config.data);
      const ids = registros.map((s) => String(s.id || "")).filter(Boolean);
      const mensalidades: Array<Record<string, unknown>> = [];
      for (let i = 0; i < ids.length; i += 100) {
        const lote = ids.slice(i, i + 100);
        // Pagina os resultados: o limite padrão do PostgREST pode truncar o
        // histórico e deixar associados inadimplentes aparecendo como em dia.
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db
            .from("mensalidades")
            .select("id,socio_id,data_vencimento,competencia,situacao")
            .in("socio_id", lote)
            .order("data_vencimento", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + 999);
          if (error) return NextResponse.json({ error: erroBanco(error) }, { status: 500 });
          const pagina = (data || []) as unknown as Array<Record<string, unknown>>;
          mensalidades.push(...pagina);
          if (pagina.length < 1000) break;
        }
      }
      atrasos = agruparAtrasos(mensalidades, hoje);
    }

    const socioPorMatricula = new Map(
      registros.map((socio) => [String(socio.matricula || "").trim().toUpperCase(), socio])
    );
    const socios = registros.map((socio) => {
      const resultado: Record<string, unknown> = {
        ...socio,
        exibir_na_lista_socios: deveExibirNaListaSocios(socio),
      };
      if (podeVerFinanceiro) {
        // B herda do titular A pela matrícula mesmo quando o vínculo legado
        // responsavel_id está vazio. Dependentes familiares também herdam pelo ID.
        const matricula = String(socio.matricula || "").trim().toUpperCase();
        const ehConjugeFamiliar = matricula.endsWith("B");
        const matriculaTitular = ehConjugeFamiliar ? `${matricula.slice(0, -1)}A` : "";
        const titularPorMatricula = ehConjugeFamiliar ? socioPorMatricula.get(matriculaTitular) : null;
        const responsavelId = socio.responsavel_id || titularPorMatricula?.id || null;
        const herdaTitular = ehConjugeFamiliar || (Boolean(responsavelId) && socio.possui_mensalidade !== true);
        const alvo = String(herdaTitular ? responsavelId : socio.id);
        const meses = atrasos.get(alvo)?.size || 0;
        resultado.financeiro_status = classificarStatusFinanceiroCarteirinha(meses, politica);
        resultado.meses_atraso = meses;
        resultado.meses_atencao = politica.meses_atencao;
        resultado.meses_bloqueio = politica.meses_bloqueio;
      } else {
        delete resultado.possui_mensalidade;
      }
      return resultado;
    });

    return NextResponse.json({ socios, camposVisiveis }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar sócios." }, { status: 500 });
  }
}

async function autenticarAdmin(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  return { supabase: getServiceClient() };
}

export async function POST(request: Request) {
  try {
    const auth = await autenticarAdmin(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    const matricula = String(body.matricula ?? "").trim().toUpperCase();
    const nome = String(body.nome ?? "").trim();
    const cpf = String(body.cpf ?? "").replace(/\D/g, "");
    const possuiMensalidadeTitular = body.possui_mensalidade === true || String(body.possui_mensalidade || "").toLowerCase() === "true";
    const responsavelId = String(body.responsavel_id || "").trim();
    if (!matricula && !responsavelId) {
      return NextResponse.json({ error: "Informe a matrícula-base do associado. Dependentes sem mensalidade recebem a matrícula automaticamente." }, { status: 400 });
    }
    if (!nome) return NextResponse.json({ error: "Informe o nome completo do associado." }, { status: 400 });
    if (cpf && cpf.length < 6) return NextResponse.json({ error: "Informe um CPF válido com pelo menos 6 números." }, { status: 400 });
    const ehDependente = Boolean(responsavelId);
    const possuiMensalidade = ehDependente
      ? dependenteTemMensalidade({
          categoria: body.categoria,
          tipo_socio: body.tipo_socio,
          possui_mensalidade: body.possui_mensalidade,
        })
      : possuiMensalidadeTitular;
    const dadosNormalizados = {
      ...body,
      matricula: matricula || null,
      nome,
      cpf: body.cpf || null,
      possui_mensalidade: possuiMensalidade,
      ...(ehDependente && !possuiMensalidade ? { valor_mensalidade: 0, situacao_financeira: "isento" } : {}),
    };
    const dadosCompletos = { ...limparObjeto(dadosNormalizados, COLUNAS_BASE), ...limparObjeto(dadosNormalizados, COLUNAS_EXTRAS) };
    if (!dadosCompletos.foto_url) delete dadosCompletos.foto_url;
    const { data, error } = await auth.supabase.from("socios").insert(dadosCompletos).select("*").single();
    if (error) {
      if (String(error.code) === "23505") return NextResponse.json({ error: "Esta matrícula já está cadastrada." }, { status: 409 });
      return NextResponse.json({ error: `Não foi possível cadastrar o sócio: ${erroBanco(error)}` }, { status: 500 });
    }
    return NextResponse.json({ socio: data, avisos: [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao cadastrar sócio." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await autenticarAdmin(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Sócio não informado." }, { status: 400 });
    const matricula = String(body.matricula ?? "").trim().toUpperCase();
    const nome = String(body.nome ?? "").trim();
    const cpf = String(body.cpf ?? "").replace(/\D/g, "");
    if (!matricula || !nome) return NextResponse.json({ error: "Matrícula-base e nome são obrigatórios para este cadastro." }, { status: 400 });
    const { data: atual } = await auth.supabase.from("socios").select("responsavel_id,possui_mensalidade,categoria,tipo_socio").eq("id", id).maybeSingle();
    const responsavelId = body.responsavel_id !== undefined
      ? String(body.responsavel_id || "").trim()
      : String(atual?.responsavel_id || "").trim();
    const possuiMensalidadeInformada = body.possui_mensalidade !== undefined
      ? body.possui_mensalidade === true || String(body.possui_mensalidade || "").toLowerCase() === "true"
      : atual?.possui_mensalidade === true;
    const ehDependente = Boolean(responsavelId);
    const categoriaFinal = body.categoria !== undefined ? body.categoria : atual?.categoria;
    const tipoFinal = body.tipo_socio !== undefined ? body.tipo_socio : atual?.tipo_socio;
    const possuiMensalidade = ehDependente
      ? dependenteTemMensalidade({
          categoria: categoriaFinal,
          tipo_socio: tipoFinal,
          possui_mensalidade: possuiMensalidadeInformada,
        })
      : possuiMensalidadeInformada;
    const dadosNormalizados = {
      ...body,
      matricula: matricula || null,
      nome,
      cpf: body.cpf || null,
      responsavel_id: responsavelId || null,
      possui_mensalidade: possuiMensalidade,
      ...(ehDependente && !possuiMensalidade ? { valor_mensalidade: 0, situacao_financeira: "isento" } : {}),
    };
    const dadosCompletos = { ...limparObjeto(dadosNormalizados, COLUNAS_BASE), ...limparObjeto(dadosNormalizados, COLUNAS_EXTRAS) };
    if (!dadosCompletos.foto_url) delete dadosCompletos.foto_url;
    const { data, error } = await auth.supabase.from("socios").update(dadosCompletos).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: `Não foi possível atualizar o sócio: ${erroBanco(error)}` }, { status: 500 });
    return NextResponse.json({ socio: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar sócio." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await autenticarAdmin(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Sócio não informado." }, { status: 400 });
    const { error } = await auth.supabase.from("socios").delete().eq("id", id);
    if (error) return NextResponse.json({ error: `Não foi possível excluir o sócio: ${erroBanco(error)}` }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir sócio." }, { status: 500 });
  }
}
