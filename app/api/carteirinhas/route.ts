import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";
import { dataHojeBrasil, normalizarPoliticaInadimplencia, POLITICA_INADIMPLENCIA_PADRAO, type PoliticaInadimplencia } from "@/lib/politicaInadimplencia";

// The selected column list is built dynamically according to permissions. The
// generated Supabase type cannot infer that runtime string, so narrow only the
// fields needed for family grouping before using the query result.
type SocioGrupoFamiliar = {
  id: string;
  responsavel_id: string | null;
};

function isPago(situacao: unknown) {
  const status = String(situacao || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return ["pago", "paid", "quitado", "recebido", "isento", "isenta", "cancelado", "cancelada"].includes(status);
}

async function carregarPolitica(supabase: ReturnType<typeof getServiceClient>): Promise<PoliticaInadimplencia> {
  try {
    const { data, error } = await supabase
      .from("configuracoes_acessos")
      .select("meses_atencao,meses_bloqueio")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      console.error("Usando política padrão nas carteirinhas:", error.message);
      return POLITICA_INADIMPLENCIA_PADRAO;
    }
    return normalizarPoliticaInadimplencia(data || POLITICA_INADIMPLENCIA_PADRAO);
  } catch (error) {
    console.error("Falha ao carregar política nas carteirinhas:", error);
    return POLITICA_INADIMPLENCIA_PADRAO;
  }
}

function statusPorMensalidades(mensalidades: any[], hoje: string) {
  const mapa = new Map<string, { competencias: Set<string>; dias: number; valor: number }>();

  for (const m of mensalidades) {
    const id = String(m.socio_id || "");
    const vencimento = String(m.data_vencimento || "").slice(0, 10);
    if (!id || !vencimento || vencimento >= hoje || isPago(m.situacao)) continue;

    const referencia = String(m.competencia || vencimento).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(referencia)) continue;

    const atual = mapa.get(id) || { competencias: new Set<string>(), dias: 0, valor: 0 };
    atual.competencias.add(referencia);
    atual.valor += Number(m.valor || 0);

    const venc = new Date(`${vencimento}T00:00:00`);
    const h = new Date(`${hoje}T00:00:00`);
    if (!Number.isNaN(venc.getTime())) {
      atual.dias = Math.max(
        atual.dias,
        Math.max(0, Math.floor((h.getTime() - venc.getTime()) / 86400000))
      );
    }

    mapa.set(id, atual);
  }

  return new Map(Array.from(mapa.entries()).map(([id, item]) => [id, {
    quantidade: item.competencias.size,
    dias: item.dias,
    valor: item.valor,
  }]));
}

function statusFinanceiro(quantidade: number, dias: number, politica: PoliticaInadimplencia) {
  const financeiro_status = quantidade >= politica.meses_bloqueio
    ? "muito_atrasado"
    : quantidade >= politica.meses_atencao
      ? "atrasado"
      : "em_dia";

  return {
    financeiro_status,
    dias_atraso: dias,
    meses_atraso: quantidade,
    meses_atencao: politica.meses_atencao,
    meses_bloqueio: politica.meses_bloqueio,
  };
}

function emLotes<T>(lista: T[], tamanho = 100): T[][] {
  const lotes: T[][] = [];

  for (let i = 0; i < lista.length; i += tamanho) {
    lotes.push(lista.slice(i, i + tamanho));
  }

  return lotes;
}

function dataHoje() {
  return dataHojeBrasil();
}

function temporadaValida(temporada: any) {
  const hoje = dataHoje();
  const situacao = String(temporada?.situacao || "").toLowerCase();
  const inicio = String(temporada?.inicio || "").slice(0, 10);
  const fim = String(temporada?.fim || "").slice(0, 10);

  if (["cancelada", "encerrada"].includes(situacao)) return false;
  if (inicio && inicio > hoje) return false;
  if (fim && fim < hoje) return false;
  return true;
}

export async function GET(request: Request) {
  const modoDependentes = new URL(request.url).searchParams.get("modo") === "dependentes";
  const auth = await requireRoles(
    request,
    ["administrador", "administrador_master", "funcionario", "funcionario_inventario", "associado"],
    "menu.carteirinhas"
  );

  if ("response" in auth) return auth.response;

  try {
    const supabase = getServiceClient();
    const permissoes = Array.isArray(auth.usuario.permissoes) ? auth.usuario.permissoes : [];
    const podeVerFinanceiro = auth.usuario.perfil === "administrador_master" || permissoes.includes("socios.ver_financeiro");
    const podeVerExameMedico = auth.usuario.perfil === "administrador_master" || permissoes.includes("socios.ver_exame_medico");
    const politicaInadimplencia = podeVerFinanceiro
      ? await carregarPolitica(supabase)
      : POLITICA_INADIMPLENCIA_PADRAO;
    const hoje = dataHojeBrasil();

    const colunasBase = [
      "id", "matricula", "nome", "cpf", "categoria", "tipo_socio", "situacao",
      "data_associacao", "foto_url", "inicio_temporada", "fim_temporada", "responsavel_id", "parentesco",
    ];
    if (podeVerExameMedico) colunasBase.push("exame_medico_validade");
    if (podeVerFinanceiro) colunasBase.push("possui_mensalidade", "valor_mensalidade");
    const base = colunasBase.join(",");

    let socios: any[] = [];

    if (auth.usuario.perfil === "associado") {
      const { data: proprioRaw, error: proprioError } = await supabase
        .from("socios")
        .select(base)
        .eq("id", auth.usuario.socio_id)
        .maybeSingle();

      if (proprioError) throw proprioError;
      const proprio = proprioRaw as unknown as SocioGrupoFamiliar | null;

      if (proprio) {
        const { data: todosRaw, error: todosError } = await supabase
          .from("socios")
          .select(base)
          .order("nome")
          .limit(5000);

        if (todosError) throw todosError;
        const todos = (todosRaw || []) as unknown as SocioGrupoFamiliar[];

        const familia = new Set<string>([String(proprio.id)]);
        let mudou = true;

        while (mudou) {
          mudou = false;

          for (const s of todos) {
            if (
              s.responsavel_id &&
              familia.has(String(s.responsavel_id)) &&
              !familia.has(String(s.id))
            ) {
              familia.add(String(s.id));
              mudou = true;
            }
          }
        }

        socios = todos.filter((s) =>
          familia.has(String(s.id))
        );
      }
    } else {
      const { data, error } = await supabase
        .from("socios")
        .select(base)
        .order("nome")
        .limit(5000);

      if (error) throw error;

      socios = data || [];
    }

    const ids = socios
      .map((s) => s.id)
      .filter(Boolean)
      .map(String);

    const mensalidades: any[] = [];

    // Histórico financeiro só é consultado quando a permissão de exibição foi concedida.
    if (podeVerFinanceiro) {
      // Consulta os lotes em paralelo para reduzir o tempo de espera.
      // Mantém o limite de 100 IDs por consulta e só continua se todos os lotes
      // forem lidos com sucesso, preservando os cálculos financeiros existentes.
      const lotesMensalidades = emLotes(ids, 100);
      const resultadosMensalidades = await Promise.all(
        lotesMensalidades.map(async (lote) => {
          const { data, error } = await supabase
            .from("mensalidades")
            .select("socio_id,data_vencimento,competencia,situacao,valor")
            .in("socio_id", lote)
            .lt("data_vencimento", hoje);

          if (error) throw error;
          return data || [];
        })
      );
      mensalidades.push(...resultadosMensalidades.flat());
    }

    const atrasosPorSocio = podeVerFinanceiro ? statusPorMensalidades(mensalidades, hoje) : new Map();
    const resultado = socios.map((s) => {
      if (!podeVerFinanceiro) return { ...s, financeiro_status: "restrito" };
      const alvoId = String(s.responsavel_id || s.id);
      const atraso = atrasosPorSocio.get(alvoId) || { quantidade: 0, dias: 0, valor: 0 };
      return {
        ...s,
        ...statusFinanceiro(atraso.quantidade, atraso.dias, politicaInadimplencia),
      };
    });

    // Os dependentes familiares agora ficam na tabela public.dependentes.
    // A tabela socios contém somente quem possui matrícula própria.
    const colunasDependente = [
      "id", "socio_id", "matricula", "nome", "cpf", "data_nascimento", "parentesco",
      "telefone", "whatsapp", "email", "ativo", "created_at", "updated_at", "foto_url", "observacoes",
    ];
    if (podeVerFinanceiro) colunasDependente.push(
      "possui_mensalidade", "valor_mensalidade", "dia_vencimento", "tipo_pagamento", "situacao_financeira", "data_ultimo_pagamento",
    );
    let dependentesQuery = supabase
      .from("dependentes")
      .select(colunasDependente.join(","))
      .order("nome");

    if (!modoDependentes) {
      dependentesQuery = dependentesQuery.eq("ativo", true);
    }

    // Associado comum vê somente sua família. Administradores e funcionários
    // podem consultar todos os dependentes.
    if (auth.usuario.perfil === "associado") {
      dependentesQuery = dependentesQuery.eq("socio_id", auth.usuario.socio_id);
    }

    const { data: dependentesDb, error: dependentesError } = await dependentesQuery;
    if (dependentesError) throw dependentesError;

    const sociosPorId = new Map(resultado.map((s) => [String(s.id), s]));
    const dependentes = (dependentesDb || []).map((d: any) => {
      const titular = sociosPorId.get(String(d.socio_id));
      const titularId = String(d.socio_id || "");
      const status: { financeiro_status: string; dias_atraso?: number; meses_atraso?: number; meses_atencao?: number; meses_bloqueio?: number } = !podeVerFinanceiro
        ? { financeiro_status: "restrito" }
        : titular
          ? {
              financeiro_status: titular.financeiro_status || "em_dia",
              dias_atraso: titular.dias_atraso || 0,
              meses_atraso: titular.meses_atraso || 0,
              meses_atencao: titular.meses_atencao || politicaInadimplencia.meses_atencao,
              meses_bloqueio: titular.meses_bloqueio || politicaInadimplencia.meses_bloqueio,
            }
          : { financeiro_status: "em_dia", dias_atraso: 0 };

      return {
        id: String(d.id),
        socio_id: titularId,
        matricula: d.matricula || null,
        nome: d.nome,
        cpf: d.cpf || null,
        parentesco: d.parentesco || null,
        data_nascimento: d.data_nascimento || null,
        telefone: d.telefone || d.whatsapp || null,
        whatsapp: d.whatsapp || null,
        email: d.email || null,
        created_at: d.created_at || null,
        updated_at: d.updated_at || null,
        ...(podeVerFinanceiro ? {
          valor_mensalidade: Number(d.valor_mensalidade || 0),
          dia_vencimento: d.dia_vencimento == null ? null : Number(d.dia_vencimento),
          tipo_pagamento: d.tipo_pagamento || null,
          data_ultimo_pagamento: d.data_ultimo_pagamento || null,
          possui_mensalidade: d.possui_mensalidade === true,
          situacao: d.situacao_financeira || "isento",
          ...status,
        } : {
          situacao: d.ativo === false ? "Inativo" : "Ativo",
          financeiro_status: "restrito",
        }),
        observacoes: d.observacoes || null,
        ativo: d.ativo !== false,
        foto_url: d.foto_url || null,
        titular_nome: titular?.nome || null,
        titular_matricula: titular?.matricula || null,
        ...(!podeVerFinanceiro ? {} : {
          dias_atraso: status.dias_atraso,
          meses_atraso: status.meses_atraso,
          meses_atencao: status.meses_atencao,
          meses_bloqueio: status.meses_bloqueio,
        }),
        responsavel_id: titularId,
      };
    });

    // Temporadas são independentes de `socios`: o responsável pode comprar
    // uma temporada sem possuir cadastro de sócio. A carteirinha da temporada
    // usa a matrícula TE e não cria/duplica registro em `socios`.
    let temporadas: any[] = [];

    if (auth.usuario.perfil !== "associado" && !modoDependentes) {
      const colunasTemporada = ["id", "tipo", "modalidade", "codigo", "matricula", "inicio", "fim", "situacao", "responsavel_nome", "responsavel_cpf", "responsavel_telefone", "responsavel_email"];
      if (podeVerFinanceiro) colunasTemporada.push("valor_total");
      const { data: temporadasDb, error: temporadasError } = await supabase
        .from("temporadas")
        .select(colunasTemporada.join(","))
        .order("inicio", { ascending: false })
        .limit(1000);

      if (temporadasError) throw temporadasError;

      const idsTemporadas = (temporadasDb || []).map((t: any) => String(t.id));

      const participantesDb: any[] = [];
      for (const lote of emLotes(idsTemporadas, 100)) {
        if (!lote.length) continue;

        const colunasParticipante = ["id", "temporada_id", "socio_id", "papel", "matricula", "nome", "cpf", "telefone", "parentesco", "foto_url"];
        if (podeVerExameMedico) colunasParticipante.push("exame_medico_validade");
        const { data, error } = await supabase
          .from("temporadas_participantes")
          .select(colunasParticipante.join(","))
          .in("temporada_id", lote)
          .order("papel", { ascending: true })
          .order("nome", { ascending: true });

        if (error) throw error;
        participantesDb.push(...(data || []));
      }

      const participantesPorTemporada = new Map<string, any[]>();

      for (const participante of participantesDb) {
        const key = String(participante.temporada_id);
        const lista = participantesPorTemporada.get(key) || [];
        lista.push(participante);
        participantesPorTemporada.set(key, lista);
      }

      temporadas = (temporadasDb || [])
        .filter(temporadaValida)
        .map((t: any) => ({
          id: String(t.id),
          tipo: t.tipo,
          modalidade: t.modalidade,
          codigo: t.codigo || null,
          matricula: t.matricula || null,
          inicio: t.inicio || null,
          fim: t.fim || null,
          ...(podeVerFinanceiro ? { valor_total: Number(t.valor_total || 0) } : {}),
          situacao: podeVerFinanceiro ? (t.situacao || "pendente") : "restrito",
          responsavel_nome: t.responsavel_nome || null,
          responsavel_cpf: t.responsavel_cpf || null,
          responsavel_telefone: t.responsavel_telefone || null,
          responsavel_email: t.responsavel_email || null,
          participantes: participantesPorTemporada.get(String(t.id)) || [],
        }));
    }

    return NextResponse.json({
      socios: resultado,
      dependentes,
      temporadas,
      politicaInadimplencia,
      statusResponsaveis: Object.fromEntries(resultado.map((s: any) => [String(s.id), s.financeiro_status || "restrito"])),
      camposVisiveis: { financeiro: podeVerFinanceiro, exameMedico: podeVerExameMedico },
    });
  } catch (error) {
    console.error("GET /api/carteirinhas:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar carteirinhas.",
      },
      { status: 500 }
    );
  }
}
