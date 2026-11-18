import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";
import {
  construirPessoasFinanceiras,
  apurarResumoInadimplencia,
  type DependenteInadimplencia,
  type MensalidadeInadimplencia,
  type SocioInadimplencia,
} from "@/lib/financeiroInadimplencia";
import {
  normalizarPoliticaInadimplencia,
  POLITICA_INADIMPLENCIA_PADRAO,
} from "@/lib/politicaInadimplencia";

export const dynamic = "force-dynamic";

const TAMANHO_PAGINA = 1000;
const PAGINAS_POR_LOTE = 4;
const LIMITE_HISTORICO = 100_000;

async function buscarMensalidadesPaginadas(
  db: ReturnType<typeof getServiceClient>,
): Promise<MensalidadeInadimplencia[]> {
  const colunas = "id,socio_id,dependente_id,competencia,valor,data_vencimento,situacao,data_pagamento";
  const criarConsulta = () => db
    .from("mensalidades")
    .select(colunas)
    .order("competencia", { ascending: false })
    .order("id", { ascending: false });

  const primeira = await db
    .from("mensalidades")
    .select(colunas, { count: "exact" })
    .order("competencia", { ascending: false })
    .order("id", { ascending: false })
    .range(0, TAMANHO_PAGINA - 1);

  if (primeira.error) throw primeira.error;
  const todas = [...((primeira.data || []) as unknown as MensalidadeInadimplencia[])];
  const total = primeira.count;

  if (total === null) {
    for (let offset = todas.length; offset < LIMITE_HISTORICO; offset += TAMANHO_PAGINA) {
      const { data, error } = await criarConsulta().range(offset, offset + TAMANHO_PAGINA - 1);
      if (error) throw error;
      const lote = (data || []) as unknown as MensalidadeInadimplencia[];
      todas.push(...lote);
      if (lote.length < TAMANHO_PAGINA) return todas;
    }
    throw new Error("O histórico de mensalidades excedeu o limite de segurança de 100.000 registros.");
  }

  if (total > LIMITE_HISTORICO) {
    throw new Error("O histórico de mensalidades excedeu o limite de segurança de 100.000 registros.");
  }

  for (let inicioLote = TAMANHO_PAGINA; inicioLote < total; inicioLote += TAMANHO_PAGINA * PAGINAS_POR_LOTE) {
    const quantidade = Math.min(PAGINAS_POR_LOTE, Math.ceil((total - inicioLote) / TAMANHO_PAGINA));
    const offsets = Array.from({ length: quantidade }, (_, indice) => inicioLote + indice * TAMANHO_PAGINA);
    const paginas = await Promise.all(offsets.map(async (offset) => {
      const { data, error } = await criarConsulta()
        .range(offset, Math.min(offset + TAMANHO_PAGINA - 1, total - 1));
      if (error) throw error;
      return (data || []) as unknown as MensalidadeInadimplencia[];
    }));
    for (const pagina of paginas) todas.push(...pagina);
  }

  return todas;
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const db = getServiceClient();
    const [configuracaoResult, sociosResult, dependentesResult] = await Promise.all([
      db.from("configuracoes_acessos")
        .select("id,meses_atencao,meses_bloqueio")
        .eq("id", 1)
        .maybeSingle(),
      db.from("socios")
        .select("id,matricula,nome,cpf,foto_url,situacao,ativo,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,data_associacao,remido,tipo_socio,categoria")
        .order("matricula", { ascending: true }),
      db.from("dependentes")
        .select("id,socio_id,nome,cpf,ativo,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento")
        .order("nome", { ascending: true }),
    ]);

    if (sociosResult.error) throw sociosResult.error;
    if (dependentesResult.error) throw dependentesResult.error;

    const socios = (sociosResult.data || []) as unknown as SocioInadimplencia[];
    const dependentes = (dependentesResult.data || []) as unknown as DependenteInadimplencia[];
    const pessoas = construirPessoasFinanceiras(socios, dependentes);

    // Sem pagadores elegíveis, não há motivo para transferir o histórico.
    const mensalidades = pessoas.length ? await buscarMensalidadesPaginadas(db) : [];
    const hoje = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
    }).format(new Date());

    const resumo = apurarResumoInadimplencia(pessoas, socios, dependentes, mensalidades, hoje);
    const politica = normalizarPoliticaInadimplencia(
      configuracaoResult.error ? POLITICA_INADIMPLENCIA_PADRAO : configuracaoResult.data || POLITICA_INADIMPLENCIA_PADRAO,
    );

    return NextResponse.json({ politica, pessoas: resumo });
  } catch (error) {
    console.error("[api/financeiro/inadimplencia][GET]", error);
    return NextResponse.json({
      error: "Não foi possível carregar a inadimplência.",
      detalhe: error instanceof Error ? error.message : "Erro desconhecido.",
    }, { status: 500 });
  }
}
