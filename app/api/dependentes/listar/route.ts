import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";
import {
  classificarStatusFinanceiroCarteirinha,
  dataHojeBrasil,
  normalizarPoliticaInadimplencia,
  POLITICA_INADIMPLENCIA_PADRAO,
  type PoliticaInadimplencia,
} from "@/lib/politicaInadimplencia";

export const dynamic = "force-dynamic";

const TAMANHO_PAGINA = 1000;
const TAMANHO_LOTE_SOCIOS = 200;

type Socio = {
  id: string;
  matricula: string | null;
  nome: string;
  situacao: string | null;
  responsavel_id: string | null;
  tipo_socio: string | null;
  categoria: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  exame_medico_validade: string | null;
  telefone: string | null;
  whatsapp: string | null;
  foto_url: string | null;
  possui_mensalidade: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
  situacao_financeira: string | null;
  data_ultimo_pagamento: string | null;
  // Campos calculados pela API após o resumo de inadimplência.
  financeiro_status?: string;
  meses_atraso?: number;
  dias_atraso?: number;
};

type DependenteDb = {
  id: string;
  socio_id: string;
  matricula: string | null;
  foto_url: string | null;
  nome: string | null;
  cpf: string | null;
  data_nascimento: string | null;
  exame_medico_validade: string | null;
  parentesco: string | null;
  telefone: string | null;
  whatsapp: string | null;
  ativo: boolean | null;
  created_at: string | null;
  possui_mensalidade?: boolean | null;
  valor_mensalidade?: number | string | null;
  dia_vencimento?: number | string | null;
  tipo_pagamento?: string | null;
  situacao_financeira?: string | null;
  data_ultimo_pagamento?: string | null;
  migrado_para_socio_id?: string | null;
};

type ResumoMensalidade = {
  socio_id: string | null;
  quantidade_atraso: number | string | null;
  dias_atraso: number | string | null;
  possui_lancamentos: boolean | null;
};

function normalizar(valor: unknown): string {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function ehDependenteFamiliarSocio(socio: Socio): boolean {
  if (!socio.responsavel_id) return false;
  const tipo = normalizar(socio.tipo_socio);
  const categoria = normalizar(socio.categoria);
  return tipo === "dependente_patrimonial_familiar" ||
    tipo === "dependente_patrimonial_familiar_mensalidade" ||
    tipo === "dependente_contribuinte_familiar" ||
    tipo === "dependente_contribuinte_familiar_mensalidade" ||
    categoria.includes("dependente patrimonial familiar") ||
    categoria.includes("dependente contribuinte familiar");
}

function ehTitular(matricula: unknown): boolean {
  return String(matricula ?? "").trim().toUpperCase().endsWith("A");
}

async function consultarTodas<T>(consulta: (inicio: number, fim: number) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const registros: T[] = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await consulta(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = data || [];
    registros.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }
  return registros;
}

async function carregarPolitica(db: ReturnType<typeof getServiceClient>): Promise<PoliticaInadimplencia> {
  const { data, error } = await db.from("configuracoes_acessos").select("meses_atencao,meses_bloqueio").eq("id", 1).maybeSingle();
  if (error) return POLITICA_INADIMPLENCIA_PADRAO;
  return normalizarPoliticaInadimplencia(data || POLITICA_INADIMPLENCIA_PADRAO);
}

export async function GET(request: Request) {
  const auth = await requireRoles(
    request,
    ["administrador", "administrador_master", "funcionario", "funcionario_inventario", "associado"],
    "menu.carteirinhas",
  );
  if ("response" in auth) return auth.response;

  try {
    const db = getServiceClient();
    const perfil = auth.usuario.perfil;
    const permissoes = Array.isArray(auth.usuario.permissoes) ? auth.usuario.permissoes : [];
    const podeVerFinanceiro = perfil === "administrador_master" || permissoes.includes("socios.ver_financeiro");
    const podeVerExameMedico = perfil === "administrador_master" || permissoes.includes("socios.ver_exame_medico");
    const politica = podeVerFinanceiro ? await carregarPolitica(db) : POLITICA_INADIMPLENCIA_PADRAO;
    const hoje = dataHojeBrasil();

    const colunasSocio = ["id", "matricula", "nome", "situacao", "responsavel_id", "tipo_socio", "categoria", "cpf", "data_nascimento", "telefone", "whatsapp", "foto_url"];
    if (podeVerExameMedico) colunasSocio.push("exame_medico_validade");
    if (podeVerFinanceiro) colunasSocio.push("possui_mensalidade", "valor_mensalidade", "dia_vencimento", "tipo_pagamento", "situacao_financeira", "data_ultimo_pagamento");

    const socios = await consultarTodas<Socio>(async (inicio, fim) => {
      let query = db.from("socios").select(colunasSocio.join(",")).order("nome").range(inicio, fim);
      if (perfil === "associado") query = query.or(`id.eq.${auth.usuario.socio_id},responsavel_id.eq.${auth.usuario.socio_id}`);
      return await query as unknown as { data: Socio[] | null; error: { message: string } | null };
    });

    const colunasDependente = ["id", "socio_id", "matricula", "foto_url", "nome", "cpf", "data_nascimento", "parentesco", "telefone", "whatsapp", "ativo", "created_at", "migrado_para_socio_id"];
    if (podeVerExameMedico) colunasDependente.push("exame_medico_validade");
    if (podeVerFinanceiro) colunasDependente.push("possui_mensalidade", "valor_mensalidade", "dia_vencimento", "tipo_pagamento", "situacao_financeira", "data_ultimo_pagamento");

    let dependentesDb: DependenteDb[];
    try {
      dependentesDb = await consultarTodas<DependenteDb>(async (inicio, fim) => {
        let query = db.from("dependentes").select(colunasDependente.join(",")).order("nome").range(inicio, fim);
        if (perfil === "associado") query = query.eq("socio_id", auth.usuario.socio_id);
        return await query as unknown as { data: DependenteDb[] | null; error: { message: string } | null };
      });
    } catch (error) {
      if (!/migrado_para_socio_id/i.test(error instanceof Error ? error.message : String(error))) throw error;
      const colunasCompatibilidade = colunasDependente.filter((coluna) => coluna !== "migrado_para_socio_id");
      dependentesDb = await consultarTodas<DependenteDb>(async (inicio, fim) => {
        let query = db.from("dependentes").select(colunasCompatibilidade.join(",")).order("nome").range(inicio, fim);
        if (perfil === "associado") query = query.eq("socio_id", auth.usuario.socio_id);
        return await query as unknown as { data: DependenteDb[] | null; error: { message: string } | null };
      });
    }

    const dependentesBase = dependentesDb.filter((d) => !ehTitular(d.matricula) && !d.migrado_para_socio_id);
    const chaves = new Set(dependentesBase.flatMap((d) => [normalizar(d.nome), normalizar(d.matricula)]).filter(Boolean));
    const dependentesSocios = socios.filter(ehDependenteFamiliarSocio).filter((s) => !ehTitular(s.matricula))
      .filter((s) => !chaves.has(normalizar(s.nome)) && !chaves.has(normalizar(s.matricula)));

    const idsComCobranca = podeVerFinanceiro
      ? Array.from(new Set([
          ...socios.filter((s) => s.possui_mensalidade === true).map((s) => String(s.id)),
          ...dependentesBase.map((d) => String(d.socio_id)),
        ].filter((id) => socios.some((s) => String(s.id) === id))))
      : [];
    // O PostgreSQL agrega o histórico de mensalidades por sócio. A API recebe
    // somente a quantidade de competências em atraso, os dias e a existência
    // de histórico; evita transferir centenas/milhares de linhas ao servidor Next.
    const resumoMensalidades: ResumoMensalidade[] = [];
    for (let inicio = 0; inicio < idsComCobranca.length; inicio += TAMANHO_LOTE_SOCIOS) {
      const lote = idsComCobranca.slice(inicio, inicio + TAMANHO_LOTE_SOCIOS);
      const { data, error } = await db.rpc("dependentes_resumo_inadimplencia", {
        p_socio_ids: lote,
        p_hoje: hoje,
      });
      if (error) throw new Error(`Falha ao resumir mensalidades: ${error.message}`);
      resumoMensalidades.push(...((data || []) as ResumoMensalidade[]));
    }
    const atrasos = new Map(resumoMensalidades.map((item) => [String(item.socio_id || ""), {
      quantidade: Number(item.quantidade_atraso || 0),
      dias: Number(item.dias_atraso || 0),
    }]));
    const historicoIds = new Set(resumoMensalidades
      .filter((item) => item.possui_lancamentos === true)
      .map((item) => String(item.socio_id || "")));
    const sociosPorMatricula = new Map(socios.map((s) => [String(s.matricula || "").trim().toUpperCase(), s]));
    const sociosComStatus = socios.map((s) => {
      if (!podeVerFinanceiro) return { ...s, financeiro_status: "restrito", meses_atraso: 0 };
      const matricula = String(s.matricula || "").trim().toUpperCase();
      const titularPorMatricula = matricula.endsWith("B") ? sociosPorMatricula.get(`${matricula.slice(0, -1)}A`) : null;
      const responsavelId = s.responsavel_id || titularPorMatricula?.id || null;
      const herdaStatus = matricula.endsWith("B") || (Boolean(responsavelId) && s.possui_mensalidade !== true);
      const alvoId = String(herdaStatus ? responsavelId : s.id);
      const atraso = atrasos.get(alvoId) || { quantidade: 0, dias: 0 };
      return {
        ...s,
        financeiro_status: historicoIds.has(alvoId) ? classificarStatusFinanceiroCarteirinha(atraso.quantidade, politica) : "sem_lancamentos",
        dias_atraso: atraso.dias,
        meses_atraso: atraso.quantidade,
      };
    });
    const sociosPorId = new Map(sociosComStatus.map((s) => [String(s.id), s]));

    const dependentes = dependentesBase.map((d) => {
      const titular = sociosPorId.get(String(d.socio_id));
      const status = !podeVerFinanceiro ? "restrito" : titular?.financeiro_status || "restrito";
      const titularInativo = normalizar(titular?.situacao) === "inativo";
      return {
        ...d,
        id: String(d.id),
        socio_id: String(d.socio_id),
        matricula: d.matricula || null,
        nome: d.nome || "",
        telefone: d.telefone || d.whatsapp || null,
        ativo: d.ativo !== false && !titularInativo,
        possui_mensalidade: d.possui_mensalidade === true,
        valor_mensalidade: Number(d.valor_mensalidade || 0),
        dia_vencimento: d.dia_vencimento == null ? null : Number(d.dia_vencimento),
        financeiro_status: status,
        meses_atraso: Number(titular?.meses_atraso || 0),
        source: "dependentes",
        source_socio_id: null,
      };
    });

    const dependentesFamiliares = dependentesSocios.map((s) => ({
      id: `socio:${s.id}`,
      socio_id: String(s.responsavel_id),
      matricula: s.matricula,
      foto_url: s.foto_url,
      nome: s.nome,
      cpf: s.cpf,
      data_nascimento: s.data_nascimento,
      exame_medico_validade: s.exame_medico_validade,
      parentesco: null,
      telefone: s.telefone || s.whatsapp || null,
      ativo: normalizar(s.situacao) !== "inativo",
      created_at: null,
      possui_mensalidade: String(s.matricula || "").trim().toUpperCase().endsWith("B") ? false : s.possui_mensalidade === true,
      valor_mensalidade: String(s.matricula || "").trim().toUpperCase().endsWith("B") ? 0 : Number(s.valor_mensalidade || 0),
      dia_vencimento: s.dia_vencimento ?? 10,
      tipo_pagamento: s.tipo_pagamento,
      situacao_financeira: s.situacao_financeira,
      data_ultimo_pagamento: s.data_ultimo_pagamento,
      financeiro_status: s.financeiro_status || "restrito",
      meses_atraso: Number(s.meses_atraso || 0),
      source: "socios",
      source_socio_id: String(s.id),
    }));

    return NextResponse.json({
      socios: sociosComStatus,
      dependentes: [...dependentes, ...dependentesFamiliares],
      politicaInadimplencia: politica,
      statusResponsaveis: Object.fromEntries(sociosComStatus.map((s) => [String(s.id), s.financeiro_status || "restrito"])),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("GET /api/dependentes/listar:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar dependentes." }, { status: 500 });
  }
}
