import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

type Linha = Record<string, unknown>;

const PAGAMENTOS_CONFIRMADOS = new Set([
  "pago", "paga", "paid", "quitado", "quitada", "recebido", "recebida",
  "baixado", "baixada", "cancelado", "cancelada", "isento", "isenta",
]);

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const db = getServiceClient();
    const [temporadasResult, parcelasTemporadasResult, vendasResult, parcelasVendasResult, contasResult] = await Promise.all([
      db.from("temporadas")
        .select("id,socio_id,responsavel_nome,codigo,matricula,situacao")
        .order("created_at", { ascending: false })
        .limit(5000),
      db.from("temporadas_parcelas")
        .select("id,temporada_id,numero,descricao,valor,data_vencimento,situacao,data_pagamento,forma_pagamento,conta_bancaria_id,movimentacao_id")
        .order("data_vencimento", { ascending: true })
        .limit(10000),
      db.from("vendas_titulos")
        .select("id,socio_id,comprador_nome,codigo,situacao")
        .order("created_at", { ascending: false })
        .limit(5000),
      db.from("vendas_titulos_parcelas")
        .select("id,venda_titulo_id,numero,descricao,valor,data_vencimento,situacao,data_pagamento,forma_pagamento,conta_bancaria_id,movimentacao_id")
        .order("data_vencimento", { ascending: true })
        .limit(10000),
      db.from("contas_bancarias")
        .select("id,nome,banco,ativo")
        .eq("ativo", true)
        .order("nome", { ascending: true }),
    ]);

    const erro = temporadasResult.error || parcelasTemporadasResult.error || vendasResult.error || parcelasVendasResult.error || contasResult.error;
    if (erro) throw erro;

    const temporadas = new Map<string, Linha>();
    for (const row of temporadasResult.data || []) temporadas.set(String(row.id), row as Linha);
    const vendas = new Map<string, Linha>();
    for (const row of vendasResult.data || []) vendas.set(String(row.id), row as Linha);

    const parcelasTemporadas = (parcelasTemporadasResult.data || []).flatMap((parcela) => {
      const situacao = String(parcela.situacao || "pendente").toLowerCase();
      if (PAGAMENTOS_CONFIRMADOS.has(situacao)) return [];
      const temporada = temporadas.get(String(parcela.temporada_id));
      if (!temporada || String(temporada.situacao || "").toLowerCase() === "cancelada") return [];
      return [{
        id: `temporada:${parcela.id}`,
        parcela_id: String(parcela.id),
        contrato_id: String(parcela.temporada_id),
        origem: "temporada" as const,
        origem_label: "Temporada",
        pessoa_nome: String(temporada.responsavel_nome || "Responsável não identificado"),
        referencia: String(temporada.codigo || temporada.matricula || "Sem código"),
        socio_id: temporada.socio_id ? String(temporada.socio_id) : null,
        numero: Number(parcela.numero || 0),
        descricao: String(parcela.descricao || `Parcela ${parcela.numero || ""}`).trim(),
        valor: Number(parcela.valor || 0),
        data_vencimento: String(parcela.data_vencimento || "").slice(0, 10),
        situacao,
        data_pagamento: parcela.data_pagamento ? String(parcela.data_pagamento).slice(0, 10) : null,
        movimentacao_id: parcela.movimentacao_id ? String(parcela.movimentacao_id) : null,
      }];
    });

    const parcelasVendas = (parcelasVendasResult.data || []).flatMap((parcela) => {
      const situacao = String(parcela.situacao || "em_aberto").toLowerCase();
      if (PAGAMENTOS_CONFIRMADOS.has(situacao)) return [];
      const venda = vendas.get(String(parcela.venda_titulo_id));
      if (!venda || String(venda.situacao || "").toLowerCase() === "cancelado" || String(venda.situacao || "").toLowerCase() === "cancelada") return [];
      return [{
        id: `titulo:${parcela.id}`,
        parcela_id: String(parcela.id),
        contrato_id: String(parcela.venda_titulo_id),
        origem: "titulo" as const,
        origem_label: "Venda de título",
        pessoa_nome: String(venda.comprador_nome || "Comprador não identificado"),
        referencia: String(venda.codigo || "Sem código"),
        socio_id: venda.socio_id ? String(venda.socio_id) : null,
        numero: Number(parcela.numero || 0),
        descricao: String(parcela.descricao || `Parcela ${parcela.numero || ""}`).trim(),
        valor: Number(parcela.valor || 0),
        data_vencimento: String(parcela.data_vencimento || "").slice(0, 10),
        situacao,
        data_pagamento: parcela.data_pagamento ? String(parcela.data_pagamento).slice(0, 10) : null,
        movimentacao_id: parcela.movimentacao_id ? String(parcela.movimentacao_id) : null,
      }];
    });

    const parcelas = [...parcelasTemporadas, ...parcelasVendas]
      .filter((item) => item.data_vencimento && Number.isFinite(item.valor) && item.valor > 0)
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));

    return NextResponse.json({
      ok: true,
      parcelas,
      contas: contasResult.data || [],
      totais: {
        quantidade: parcelas.length,
        valor: parcelas.reduce((soma, item) => soma + item.valor, 0),
        temporadas: parcelasTemporadas.length,
        titulos: parcelasVendas.length,
      },
    });
  } catch (error) {
    console.error("[api/financeiro/contas-a-receber][GET]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar as contas a receber." }, { status: 500 });
  }
}
