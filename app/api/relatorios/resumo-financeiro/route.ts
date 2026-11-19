import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

type MovimentoFinanceiro = {
  id: string;
  tipo: string;
  categoria: string | null;
  descricao: string | null;
  valor: number | string | null;
  data_movimentacao: string;
  origem_tipo: string | null;
};

type Totais = {
  entradas: number;
  saidas: number;
  resultado: number;
  mensalidades: number;
  alugueis: number;
  outras_receitas: number;
  transferencias_excluidas: number;
  movimentacoes: number;
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function arredondar(valor: number) {
  return Number(valor.toFixed(2));
}

function classificarEntrada(movimento: MovimentoFinanceiro) {
  const origem = normalizarTexto(movimento.origem_tipo);
  const categoria = normalizarTexto(movimento.categoria);
  const texto = normalizarTexto(`${movimento.descricao || ""} ${movimento.categoria || ""}`);

  if (origem.includes("estorno") || origem.includes("ajuste")) return "Estornos e ajustes";
  if (origem.includes("tarifa_mensalidade") || categoria.includes("tarifa de cobranca")) return "Tarifas de cobrança";
  if (origem.includes("mensalidade") || categoria === "mensalidade") return "Mensalidades";
  if (origem.includes("reserva") || categoria.includes("reserva") || categoria.includes("aluguel") || categoria.includes("locacao") || /\b(aluguel|locacao|locação)\b/.test(texto)) return "Aluguéis e reservas";
  if (origem.includes("convite") || categoria.includes("convite")) return "Convites";
  if (origem.includes("temporada") || categoria.includes("temporada")) return "Temporadas";
  if (origem.includes("evento") || categoria.includes("evento")) return "Eventos";
  if (categoria && categoria !== "sem categoria") return String(movimento.categoria).trim();
  return "Outras receitas";
}

function classificarSaida(movimento: MovimentoFinanceiro) {
  const origem = normalizarTexto(movimento.origem_tipo);
  const categoria = String(movimento.categoria || "").trim();
  const categoriaNormalizada = normalizarTexto(categoria);
  if (origem.includes("estorno") || origem.includes("ajuste")) return "Estornos e ajustes";
  if (origem.includes("tarifa_mensalidade") || categoriaNormalizada.includes("tarifa de cobranca")) return "Tarifas bancárias e de cobrança";
  if (categoria && categoriaNormalizada !== "sem categoria") return categoria;
  if (origem.includes("manual")) return "Despesas lançadas manualmente";
  return "Outras despesas";
}

function novoResumo(): Totais {
  return {
    entradas: 0,
    saidas: 0,
    resultado: 0,
    mensalidades: 0,
    alugueis: 0,
    outras_receitas: 0,
    transferencias_excluidas: 0,
    movimentacoes: 0,
  };
}

function criarAgregador() {
  const totais = novoResumo();
  const entradasPorCategoria = new Map<string, number>();
  const saidasPorCategoria = new Map<string, number>();

  function acumular(movimento: MovimentoFinanceiro) {
    const valor = Number(movimento.valor || 0);
    if (!Number.isFinite(valor) || valor <= 0) return;

    if (movimento.tipo === "transferencia") {
      totais.transferencias_excluidas += 1;
      return;
    }

    if (movimento.tipo === "entrada") {
      const categoria = classificarEntrada(movimento);
      totais.entradas += valor;
      totais.movimentacoes += 1;
      entradasPorCategoria.set(categoria, (entradasPorCategoria.get(categoria) || 0) + valor);
      if (categoria === "Mensalidades") totais.mensalidades += valor;
      else if (categoria === "Aluguéis e reservas") totais.alugueis += valor;
      else totais.outras_receitas += valor;
      return;
    }

    if (movimento.tipo === "saida") {
      const categoria = classificarSaida(movimento);
      totais.saidas += valor;
      totais.movimentacoes += 1;
      saidasPorCategoria.set(categoria, (saidasPorCategoria.get(categoria) || 0) + valor);
    }
  }

  function resultado() {
    totais.resultado = totais.entradas - totais.saidas;
    return {
      totais: {
        ...totais,
        entradas: arredondar(totais.entradas),
        saidas: arredondar(totais.saidas),
        resultado: arredondar(totais.resultado),
        mensalidades: arredondar(totais.mensalidades),
        alugueis: arredondar(totais.alugueis),
        outras_receitas: arredondar(totais.outras_receitas),
      },
      entradas_por_categoria: Array.from(entradasPorCategoria.entries())
        .map(([categoria, valor]) => ({ categoria, valor: arredondar(valor) }))
        .sort((a, b) => b.valor - a.valor),
      saidas_por_categoria: Array.from(saidasPorCategoria.entries())
        .map(([categoria, valor]) => ({ categoria, valor: arredondar(valor) }))
        .sort((a, b) => b.valor - a.valor),
    };
  }

  return { acumular, resultado };
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const ano = Number(searchParams.get("ano"));
    const periodo = searchParams.get("periodo") === "anual" ? "anual" : "mensal";
    const mes = Number(searchParams.get("mes"));

    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return NextResponse.json({ error: "Selecione um ano válido." }, { status: 400 });
    }
    if (periodo === "mensal" && (!Number.isInteger(mes) || mes < 1 || mes > 12)) {
      return NextResponse.json({ error: "Selecione um mês válido." }, { status: 400 });
    }

    const dataInicio = periodo === "anual"
      ? `${ano}-01-01`
      : `${ano}-${String(mes).padStart(2, "0")}-01`;
    const proximoMes = periodo === "anual"
      ? `${ano + 1}-01-01`
      : mes === 12
        ? `${ano + 1}-01-01`
        : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

    const db = getServiceClient();
    const resumoGeral = criarAgregador();
    const resumoMeses = Array.from({ length: 12 }, (_, indice) => ({
      mes: indice + 1,
      nome: MESES[indice],
      ...criarAgregador(),
    }));

    let offset = 0;
    const tamanhoPagina = 1000;
    while (true) {
      const { data, error } = await db
        .from("movimentacoes_financeiras")
        .select("id,tipo,categoria,descricao,valor,data_movimentacao,origem_tipo")
        .gte("data_movimentacao", dataInicio)
        .lt("data_movimentacao", proximoMes)
        .order("data_movimentacao", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + tamanhoPagina - 1);

      if (error) throw error;
      const movimentos = (data || []) as MovimentoFinanceiro[];
      for (const movimento of movimentos) {
        resumoGeral.acumular(movimento);
        const numeroMes = Number(String(movimento.data_movimentacao).slice(5, 7));
        if (numeroMes >= 1 && numeroMes <= 12) resumoMeses[numeroMes - 1].acumular(movimento);
      }
      if (movimentos.length < tamanhoPagina) break;
      offset += movimentos.length;
    }

    const resumo = resumoGeral.resultado();
    const meses = periodo === "anual"
      ? resumoMeses.map((item) => ({ mes: item.mes, nome: item.nome, ...item.resultado() }))
      : [];

    return NextResponse.json({
      ano,
      periodo,
      mes: periodo === "mensal" ? mes : null,
      totais: resumo.totais,
      entradas_por_categoria: resumo.entradas_por_categoria,
      saidas_por_categoria: resumo.saidas_por_categoria,
      meses,
      observacao: "O relatório considera entradas e saídas efetivamente registradas no livro financeiro pela data do movimento. Contas em aberto e transferências entre contas não são somadas como recebimento ou despesa.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/relatorios/resumo-financeiro][GET]", error);
    return NextResponse.json({ error: "Não foi possível gerar o resumo financeiro." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
