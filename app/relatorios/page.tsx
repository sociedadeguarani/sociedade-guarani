"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Conta = {
  id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  saldo_inicial: number;
  data_saldo_inicial: string | null;
  ativo: boolean;
};

type Movimento = {
  id: string;
  conta_bancaria_id: string;
  conta_destino_id: string | null;
  tipo: "entrada" | "saida" | "transferencia";
  categoria: string | null;
  descricao: string;
  valor: number;
  data_movimentacao: string;
  forma_pagamento: string | null;
  origem_tipo: string | null;
  socio_id: string | null;
  dependente_id: string | null;
  comprovante_url: string | null;
  conciliado: boolean;
  observacoes: string | null;
};

type MensalidadeRelatorio = {
  id: string; socio_id: string | null; competencia: string | null; valor: number;
  total_cobrado?: number | null; data_vencimento: string | null; situacao: string | null; data_pagamento: string | null;
  tipo_pagamento: string | null; numero_recibo: string | null;
};

type LinhaBanco = {
  conta: Conta;
  saldo: number;
  entradas: number;
  saidas: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
};

const hoje = new Date();
const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
const primeiroDiaAno = `${hoje.getFullYear()}-01-01`;
const MESES_RELATORIO = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function statusMensalidade(valor: string | null | undefined) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function mensalidadeFoiPaga(m: MensalidadeRelatorio) {
  return Boolean(m.data_pagamento) || ["pago", "paga", "quitado", "quitada", "recebido", "recebida"].includes(statusMensalidade(m.situacao));
}

function valorMensalidade(m: MensalidadeRelatorio) {
  return Number(m.total_cobrado != null && Number(m.total_cobrado) > 0 ? m.total_cobrado : m.valor ?? 0);
}

function mensalidadeIsenta(m: MensalidadeRelatorio) {
  return ["isento", "isenta", "cancelado", "cancelada", "abonado", "abonada"].includes(statusMensalidade(m.situacao));
}

function origemFinanceira(m: Movimento) {
  const origem = statusMensalidade(m.origem_tipo);
  const categoria = statusMensalidade(m.categoria);
  const texto = statusMensalidade(`${m.descricao} ${m.categoria || ""}`);
  if (origem.includes("estorno") || origem.includes("ajuste")) return "Estornos e ajustes";
  if (origem.includes("tarifa_mensalidade")) return "Tarifas de cobrança";
  if (origem.includes("mensalidade")) return "Mensalidades";
  if (origem.includes("reserva") || texto.includes("aluguel") || texto.includes("locacao")) return "Reservas e locações";
  if (origem.includes("convite") || categoria.includes("convite")) return "Convites";
  if (origem.includes("temporada") || categoria.includes("temporada")) return "Temporadas";
  if (origem.includes("evento") || categoria.includes("evento")) return "Eventos";
  if (origem.includes("manual")) return categoria && categoria !== "sem categoria" ? m.categoria!.trim() : "Lançamentos manuais";
  return normalizarCategoria(m.categoria);
}

function moeda(valor: number | string | null | undefined) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBR(valor: string | null | undefined) {
  if (!valor) return "—";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function competenciaBR(valor: string | null | undefined) {
  if (!valor) return "—";
  const [ano, mes] = valor.slice(0, 7).split("-");
  const nomeMes = MESES_RELATORIO[Number(mes) - 1];
  return nomeMes ? `${nomeMes}/${ano}` : valor;
}

function percentual(valor: number, total: number) {
  if (!total) return "0,0%";
  return `${((valor / total) * 100).toFixed(1).replace(".", ",")}%`;
}

function normalizarCategoria(valor: string | null) {
  return valor?.trim() || "Sem categoria";
}

async function consultarMovimentosPaginados() {
  const todos: Movimento[] = [];
  let offset = 0;
  while (true) {
    const pagina = await supabase
      .from("movimentacoes_financeiras")
      .select("id,conta_bancaria_id,conta_destino_id,tipo,categoria,descricao,valor,data_movimentacao,forma_pagamento,origem_tipo,socio_id,dependente_id,comprovante_url,conciliado,observacoes")
      .order("data_movimentacao", { ascending: false })
      .range(offset, offset + 999);
    if (pagina.error) return { data: null, error: pagina.error };
    const itens = (pagina.data || []) as Movimento[];
    todos.push(...itens);
    if (itens.length < 1000) return { data: todos, error: null };
    offset += itens.length;
  }
}

async function consultarMensalidadesPaginadas() {
  const todas: MensalidadeRelatorio[] = [];
  let offset = 0;
  while (true) {
    const pagina = await supabase
      .from("mensalidades")
      .select("id,socio_id,competencia,valor,total_cobrado,data_vencimento,situacao,data_pagamento,tipo_pagamento,numero_recibo")
      .order("data_vencimento", { ascending: false })
      .range(offset, offset + 999);
    if (pagina.error) return { data: null, error: pagina.error };
    const itens = (pagina.data || []) as MensalidadeRelatorio[];
    todas.push(...itens);
    if (itens.length < 1000) return { data: todas, error: null };
    offset += itens.length;
  }
}

async function consultarDadosRelatorio() {
  return Promise.all([
    supabase
      .from("contas_bancarias")
      .select("id,nome,banco,agencia,conta,saldo_inicial,data_saldo_inicial,ativo")
      .eq("ativo", true)
      .order("nome"),
    consultarMovimentosPaginados(),
    consultarMensalidadesPaginadas(),
  ]);
}

type ResultadosRelatorio = Awaited<ReturnType<typeof consultarDadosRelatorio>>;

export default function RelatoriosPage() {
  const router = useRouter();
  const [contas, setContas] = useState<Conta[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [mensalidades, setMensalidades] = useState<MensalidadeRelatorio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [dataInicial, setDataInicial] = useState(primeiroDiaAno);
  const [dataFinal, setDataFinal] = useState(hojeISO);
  const [anoFiltro, setAnoFiltro] = useState(String(hoje.getFullYear()));
  const [mesesFiltro, setMesesFiltro] = useState<number[]>([]);
  const [contaFiltro, setContaFiltro] = useState("todas");
  const [tipoFiltro, setTipoFiltro] = useState("todos");

  const aplicarResultados = useCallback((resultados: ResultadosRelatorio) => {
    const [contasResult, movimentosResult, mensalidadesResult] = resultados;

    if (contasResult.error) {
      setErro(contasResult.error.message);
      setCarregando(false);
      return;
    }

    if (movimentosResult.error) {
      setErro(movimentosResult.error.message);
      setCarregando(false);
      return;
    }

    setContas((contasResult.data || []) as Conta[]);
    setMovimentos((movimentosResult.data || []) as Movimento[]);
    if (!mensalidadesResult.error) {
      setMensalidades((mensalidadesResult.data || []) as MensalidadeRelatorio[]);
    } else {
      setMensalidades([]);
    }
    setErro("");
    setCarregando(false);
  }, []);

  async function carregar() {
    setCarregando(true);
    setErro("");

    try {
      const resultados = await consultarDadosRelatorio();
      aplicarResultados(resultados);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar o relatório.");
      setCarregando(false);
    }
  }

  useEffect(() => {
    let ativo = true;

    async function inicializar() {
      try {
        const resultados = await consultarDadosRelatorio();
        if (ativo) aplicarResultados(resultados);
      } catch (error) {
        if (!ativo) return;
        setErro(error instanceof Error ? error.message : "Não foi possível carregar o relatório.");
        setCarregando(false);
      }
    }

    void inicializar();
    return () => {
      ativo = false;
    };
  }, [aplicarResultados]);

  const contaMap = useMemo(
    () => new Map(contas.map((conta) => [conta.id, conta])),
    [contas]
  );

  const usarMesesEspecificos = mesesFiltro.length > 0;
  const dataInicioCalculo = useMemo(() => {
    if (!usarMesesEspecificos) return dataInicial;
    return `${anoFiltro}-${String(Math.min(...mesesFiltro)).padStart(2, "0")}-01`;
  }, [usarMesesEspecificos, mesesFiltro, anoFiltro, dataInicial]);
  const dataFimCalculo = useMemo(() => {
    if (!usarMesesEspecificos) return dataFinal;
    const ultimoMes = Math.max(...mesesFiltro);
    return `${anoFiltro}-${String(ultimoMes).padStart(2, "0")}-${String(new Date(Number(anoFiltro), ultimoMes, 0).getDate()).padStart(2, "0")}`;
  }, [usarMesesEspecificos, mesesFiltro, anoFiltro, dataFinal]);

  const movimentosPeriodo = useMemo(() => {
    return movimentos.filter((mov) => {
      const data = String(mov.data_movimentacao || "").slice(0, 10);
      const dentroData = usarMesesEspecificos
        ? data.startsWith(`${anoFiltro}-`) && mesesFiltro.includes(Number(data.slice(5, 7)))
        : (!dataInicial || data >= dataInicial) && (!dataFinal || data <= dataFinal);

      const dentroConta = contaFiltro === "todas" || mov.conta_bancaria_id === contaFiltro || (mov.tipo === "transferencia" && mov.conta_destino_id === contaFiltro);
      const dentroTipo = tipoFiltro === "todos" || mov.tipo === tipoFiltro;
      return dentroData && dentroConta && dentroTipo;
    });
  }, [movimentos, dataInicial, dataFinal, anoFiltro, mesesFiltro, usarMesesEspecificos, contaFiltro, tipoFiltro]);

  // Os saldos usam um intervalo contínuo mesmo quando a análise seleciona meses avulsos;
  // os totais e categorias continuam limitados aos meses marcados.
  const movimentosPeriodoSaldo = useMemo(() => movimentos.filter((mov) => {
    const data = String(mov.data_movimentacao || "").slice(0, 10);
    const dentroData = (!dataInicioCalculo || data >= dataInicioCalculo) && (!dataFimCalculo || data <= dataFimCalculo);
    const dentroConta = contaFiltro === "todas" || mov.conta_bancaria_id === contaFiltro || (mov.tipo === "transferencia" && mov.conta_destino_id === contaFiltro);
    return dentroData && dentroConta;
  }), [movimentos, dataInicioCalculo, dataFimCalculo, contaFiltro]);

  const mensalidadesPeriodo = useMemo(() => mensalidades.filter((m) => {
    // A situação da cobrança é apurada por competência/vencimento; recebimentos efetivos
    // continuam contabilizados exclusivamente no livro financeiro.
    const d = (m.data_vencimento || m.competencia || m.data_pagamento || "").slice(0, 10);
    if (usarMesesEspecificos) return d.startsWith(`${anoFiltro}-`) && mesesFiltro.includes(Number(d.slice(5, 7)));
    return (!dataInicial || d >= dataInicial) && (!dataFinal || d <= dataFinal);
  }), [mensalidades, dataInicial, dataFinal, anoFiltro, mesesFiltro, usarMesesEspecificos]);

  const totalMensalidadesLancadas = useMemo(() => mensalidadesPeriodo.filter((m) => !mensalidadeIsenta(m)).reduce((t, m) => t + valorMensalidade(m), 0), [mensalidadesPeriodo]);
  const totalMensalidadesPagas = useMemo(() => mensalidadesPeriodo.filter(mensalidadeFoiPaga).reduce((t, m) => t + valorMensalidade(m), 0), [mensalidadesPeriodo]);
  const totalMensalidadesVencidas = useMemo(() => mensalidadesPeriodo.filter((m) => !mensalidadeFoiPaga(m) && !mensalidadeIsenta(m) && Boolean(m.data_vencimento) && m.data_vencimento!.slice(0, 10) < hojeISO).reduce((t, m) => t + valorMensalidade(m), 0), [mensalidadesPeriodo]);
  const totalMensalidadesEmAberto = useMemo(() => mensalidadesPeriodo.filter((m) => !mensalidadeFoiPaga(m) && !mensalidadeIsenta(m) && (!m.data_vencimento || m.data_vencimento.slice(0, 10) >= hojeISO)).reduce((t, m) => t + valorMensalidade(m), 0), [mensalidadesPeriodo]);

  const entradas = useMemo(
    () =>
      movimentosPeriodo
        .filter((m) => m.tipo === "entrada")
        .reduce((total, m) => total + Number(m.valor || 0), 0),
    [movimentosPeriodo]
  );

  const saidas = useMemo(
    () =>
      movimentosPeriodo
        .filter((m) => m.tipo === "saida")
        .reduce((total, m) => total + Number(m.valor || 0), 0),
    [movimentosPeriodo]
  );

  const transferencias = useMemo(
    () =>
      movimentosPeriodo
        .filter((m) => m.tipo === "transferencia")
        .reduce((total, m) => total + Number(m.valor || 0), 0),
    [movimentosPeriodo]
  );

  const saldoNaData = useCallback((conta: Conta, corte: string) => {
    let saldo = Number(conta.saldo_inicial || 0);
    const base = (conta.data_saldo_inicial || "").slice(0, 10);
    for (const mov of movimentos) {
      const data = String(mov.data_movimentacao || "").slice(0, 10);
      const deltaConta = mov.tipo === "entrada"
        ? (mov.conta_bancaria_id === conta.id ? Number(mov.valor || 0) : 0)
        : mov.tipo === "saida"
          ? (mov.conta_bancaria_id === conta.id ? -Number(mov.valor || 0) : 0)
          : (mov.conta_destino_id === conta.id ? Number(mov.valor || 0) : 0) - (mov.conta_bancaria_id === conta.id ? Number(mov.valor || 0) : 0);
      if (!deltaConta) continue;
      if (base) {
        if (corte > base && data > base && data < corte) saldo += deltaConta;
        else if (corte <= base && data >= corte && data <= base) saldo -= deltaConta;
      } else if (data < corte) saldo += deltaConta;
    }
    return saldo;
  }, [movimentos]);

  const saldoInicialSelecionado = useMemo(() => {
    const dataCorte = dataInicioCalculo || dataInicial || primeiroDiaAno;
    const selecionadas = contas.filter((conta) => contaFiltro === "todas" || conta.id === contaFiltro);
    return selecionadas.reduce((total, conta) => total + saldoNaData(conta, dataCorte), 0);
  }, [contaFiltro, contas, saldoNaData, dataInicioCalculo, dataInicial]);

  const variacaoSaldoPeriodo = useMemo(() => movimentosPeriodoSaldo.reduce((total, mov) => {
    const valor = Number(mov.valor || 0);
    if (mov.tipo === "entrada") return total + valor;
    if (mov.tipo === "saida") return total - valor;
    if (contaFiltro === "todas") return total;
    if (mov.conta_bancaria_id === contaFiltro) return total - valor;
    if (mov.conta_destino_id === contaFiltro) return total + valor;
    return total;
  }, 0), [movimentosPeriodoSaldo, contaFiltro]);
  const saldoFinal = saldoInicialSelecionado + variacaoSaldoPeriodo;

  const categoriasEntrada = useMemo(() => {
    const mapa = new Map<string, number>();

    movimentosPeriodo
      .filter((m) => m.tipo === "entrada")
      .forEach((m) => {
        const categoria = origemFinanceira(m);
        mapa.set(categoria, (mapa.get(categoria) || 0) + Number(m.valor || 0));
      });

    return Array.from(mapa.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [movimentosPeriodo]);

  const categoriasSaida = useMemo(() => {
    const mapa = new Map<string, number>();

    movimentosPeriodo
      .filter((m) => m.tipo === "saida")
      .forEach((m) => {
        const categoria = origemFinanceira(m);
        mapa.set(categoria, (mapa.get(categoria) || 0) + Number(m.valor || 0));
      });

    return Array.from(mapa.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [movimentosPeriodo]);

  const recebimentosPorForma = useMemo(() => {
    const mapa = new Map<string, { quantidade: number; valor: number }>();
    movimentosPeriodo.filter((m) => m.tipo === "entrada").forEach((m) => {
      const forma = m.forma_pagamento?.trim() || "Não informado";
      const item = mapa.get(forma) || { quantidade: 0, valor: 0 };
      item.quantidade += 1;
      item.valor += Number(m.valor || 0);
      mapa.set(forma, item);
    });
    return Array.from(mapa.entries()).map(([forma, item]) => ({ forma, ...item })).sort((a, b) => b.valor - a.valor);
  }, [movimentosPeriodo]);

  const linhasBancos = useMemo<LinhaBanco[]>(() => {
    return contas
      .filter((conta) => contaFiltro === "todas" || conta.id === contaFiltro)
      .map((conta) => {
        let entradasBanco = 0;
        let saidasBanco = 0;
        let transferenciasEntrada = 0;
        let transferenciasSaida = 0;

        movimentosPeriodoSaldo.forEach((mov) => {
          const valor = Number(mov.valor || 0);

          if (mov.tipo === "entrada" && mov.conta_bancaria_id === conta.id) {
            entradasBanco += valor;
          }

          if (mov.tipo === "saida" && mov.conta_bancaria_id === conta.id) {
            saidasBanco += valor;
          }

          if (mov.tipo === "transferencia") {
            if (mov.conta_bancaria_id === conta.id) {
              transferenciasSaida += valor;
            }
            if (mov.conta_destino_id === conta.id) {
              transferenciasEntrada += valor;
            }
          }
        });

        const saldoInicialBanco = saldoNaData(conta, dataInicioCalculo || dataInicial || primeiroDiaAno);
        const saldo = saldoInicialBanco + entradasBanco - saidasBanco + transferenciasEntrada - transferenciasSaida;

        return {
          conta,
          saldo,
          entradas: entradasBanco,
          saidas: saidasBanco,
          transferenciasEntrada,
          transferenciasSaida,
        };
      });
  }, [contas, contaFiltro, movimentosPeriodoSaldo, saldoNaData, dataInicioCalculo, dataInicial]);

  const conciliados = movimentosPeriodo.filter((m) => m.conciliado).length;
  const pendentesConciliacao = movimentosPeriodo.length - conciliados;

  function imprimir() {
    window.print();
  }

  function voltar() {
    router.push("/painel");
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#18362b]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />

      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
            @bottom-right { content: "Página " counter(page) " de " counter(pages); font-size: 8pt; color: #64748b; }
          }
          html, body { width: 100% !important; min-width: 0 !important; height: auto !important; overflow: visible !important; }
          body { background: white !important; font-size: 8.5pt !important; }
          table { width: 100% !important; min-width: 0 !important; border-collapse: collapse !important; table-layout: auto !important; }
          thead { display: table-header-group !important; }
          tfoot { display: table-footer-group !important; }
          tr { break-inside: avoid !important; page-break-inside: avoid !important; }
          th, td { padding: 4px 5px !important; font-size: 7.5pt !important; vertical-align: top !important; }
          h1 { font-size: 19pt !important; line-height: 1.15 !important; }
          h2 { break-after: avoid-page; font-size: 11pt !important; }
          p { orphans: 2; widows: 2; }
          .relatorio-tabela { overflow: visible !important; width: 100% !important; }
          .relatorio-linha { break-inside: avoid !important; }
          .print-apenas { display: block !important; }
          .print-resumo-grade { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; gap: 7px !important; }
          .print-resumo-grade > div { min-width: 0 !important; padding: 8px !important; }
          .print-resumo-grade > div p:first-child { font-size: 7.5pt !important; line-height: 1.2 !important; }
          .print-resumo-grade > div p:nth-child(2) { font-size: 13pt !important; line-height: 1.2 !important; overflow-wrap: anywhere !important; }
          .print-resumo-grade > div p:last-child { font-size: 6.5pt !important; line-height: 1.2 !important; }
          .print-categorias-grade { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }
          .print-categorias-grade > section { min-width: 0 !important; padding: 10px !important; }
          .print-categorias-grade .print-lista-categoria { margin-top: 7px !important; }
          .print-categorias-grade .print-lista-categoria > div { padding: 5px 7px !important; }
          .print-categorias-grade .print-lista-categoria > div + div { margin-top: 4px !important; }
          .print-formas-grade { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; gap: 7px !important; }
          .print-formas-grade > div { min-width: 0 !important; padding: 8px !important; }
          .print-formas-grade > div p:nth-child(2) { font-size: 12pt !important; }
          .print-bancos-grade { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 7px !important; }
          .print-bancos-grade > div { min-width: 0 !important; padding: 8px !important; }
          .print-bancos-grade h3 { font-size: 10pt !important; line-height: 1.2 !important; }
          .print-bancos-grade .print-saldo-banco { margin-top: 7px !important; font-size: 14pt !important; line-height: 1.15 !important; }
          .print-bancos-grade .print-detalhe-banco { margin-top: 7px !important; padding-top: 6px !important; }
          .print-resumo-final-grade { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 7px !important; }
          .print-resumo-final-grade > div { padding: 8px !important; }
          .relatorio-impressao section { margin-bottom: 9px !important; }
          .relatorio-impressao .p-5 { padding: 10px !important; }
          .relatorio-impressao .mb-6 { margin-bottom: 8px !important; }
          .relatorio-impressao .mb-5 { margin-bottom: 7px !important; }
          .relatorio-impressao .mb-4 { margin-bottom: 6px !important; }
          .relatorio-impressao .mt-5 { margin-top: 7px !important; }
          .relatorio-impressao .mt-4 { margin-top: 6px !important; }
          .relatorio-impressao .mt-2 { margin-top: 3px !important; }
          .relatorio-impressao .gap-6 { gap: 8px !important; }
          .relatorio-impressao .gap-4 { gap: 7px !important; }
          .relatorio-impressao .py-10, .relatorio-impressao .py-12 { padding-top: 6px !important; padding-bottom: 6px !important; }

          body * {
            visibility: hidden !important;
          }

          .relatorio-impressao,
          .relatorio-impressao * {
            visibility: visible !important;
          }

          .relatorio-impressao {
            position: absolute !important;
            left: 0 !important;
            right: 0 !important;
            top: 0 !important;
            width: auto !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: white !important;
          }

          .nao-imprimir { display: none !important; }
          .relatorio-impressao { margin: 0 !important; max-width: none !important; padding: 0 !important; }
          .sombra-impressao { box-shadow: none !important; border-color: #cbd5d1 !important; }
          .relatorio-impressao section { break-inside: auto !important; page-break-inside: auto !important; }
          .relatorio-impressao .rounded-2xl { border-radius: 4px !important; }
          .relatorio-impressao .overflow-x-auto { overflow: visible !important; }

          .sombra-impressao {
            box-shadow: none !important;
            border: 1px solid #dfe7e2 !important;
          }
        }
      `}</style>

      <main className="relatorio-impressao mx-auto max-w-[1500px] px-6 py-8 lg:ml-[220px]">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <button
              onClick={voltar}
              className="nao-imprimir mb-3 text-sm font-semibold text-[#005a3c]"
            >
              ← Voltar ao painel
            </button>
            <p className="text-sm font-bold uppercase tracking-wide text-[#005a3c]">Sociedade Recreativa Guarani — S.R.G.</p>
            <p className="mt-1 text-xs font-medium text-gray-500">Administração · Prestação de contas</p>
            <h1 className="mt-1 text-3xl font-extrabold text-[#005a3c]">Relatório Financeiro</h1>
            <p className="mt-1 text-gray-500">Entradas, saídas, mensalidades, recebimentos, despesas e saldos bancários.</p>
            <p className="print-apenas mt-2 hidden text-xs text-gray-600">Emitido em {dataBR(hojeISO)} · Documento interno de prestação de contas da Sociedade Recreativa Guarani.</p>
          </div>

          <div className="nao-imprimir flex flex-wrap gap-2">
            <button onClick={() => void carregar()} disabled={carregando} className="rounded-xl border border-[#cbd9d2] bg-white px-5 py-3 text-sm font-bold text-[#005a3c] shadow-sm disabled:opacity-60">
              {carregando ? "Atualizando..." : "↻ Gerar / Atualizar relatório"}
            </button>
            <button onClick={imprimir} className="rounded-xl bg-[#005a3c] px-5 py-3 text-sm font-bold text-white shadow-sm">
              🖨️ Imprimir / Salvar PDF
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm nao-imprimir">
          <div className="mb-4">
            <h2 className="font-extrabold text-[#003d2b]">
              Filtros do relatório
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Escolha o período, banco e tipo de movimentação.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                Data inicial
              </label>
              <input
                type="date"
                value={dataInicial}
                onChange={(e) => { setMesesFiltro([]); setDataInicial(e.target.value); }}
                className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none focus:border-[#005a3c]"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                Data final
              </label>
              <input
                type="date"
                value={dataFinal}
                onChange={(e) => { setMesesFiltro([]); setDataFinal(e.target.value); }}
                className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none focus:border-[#005a3c]"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                Conta bancária
              </label>
              <select
                value={contaFiltro}
                onChange={(e) => setContaFiltro(e.target.value)}
                className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 outline-none focus:border-[#005a3c]"
              >
                <option value="todas">Todas as contas</option>
                {contas.map((conta) => (
                  <option key={conta.id} value={conta.id}>
                    {conta.nome}
                    {conta.banco ? ` — ${conta.banco}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                Tipo
              </label>
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 outline-none focus:border-[#005a3c]"
              >
                <option value="todos">Todos</option>
                <option value="entrada">Entradas</option>
                <option value="saida">Saídas</option>
                <option value="transferencia">Transferências</option>
              </select>
            </div>
          </div>
          <div className="mt-5 border-t border-[#e5ece8] pt-4">
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Ano dos meses</label>
                <select value={anoFiltro} onChange={(e) => { setAnoFiltro(e.target.value); setDataInicial(`${e.target.value}-01-01`); setDataFinal(e.target.value === String(hoje.getFullYear()) ? hojeISO : `${e.target.value}-12-31`); }} className="rounded-xl border border-[#d5e0da] bg-white px-3 py-2.5">
                  {Array.from({ length: 9 }, (_, i) => hoje.getFullYear() - 4 + i).map((ano) => <option key={ano} value={String(ano)}>{ano}</option>)}
                </select>
              </div>
              <p className="text-sm text-gray-500">Meses para analisar (pode marcar mais de um). Sem seleção, valem as datas inicial e final acima.</p>
              {mesesFiltro.length > 0 && <button type="button" onClick={() => setMesesFiltro([])} className="rounded-lg border border-[#cbd9d2] px-3 py-2 text-sm font-bold text-[#005a3c]">Limpar meses</button>}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
              {MESES_RELATORIO.map((mes, index) => {
                const selecionado = mesesFiltro.includes(index + 1);
                return <button key={mes} type="button" aria-pressed={selecionado} onClick={() => setMesesFiltro((atuais) => selecionado ? atuais.filter((m) => m !== index + 1) : [...atuais, index + 1].sort((a, b) => a - b))} className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${selecionado ? "border-[#005a3c] bg-[#005a3c] text-white" : "border-[#d5e0da] bg-white text-gray-600 hover:border-[#005a3c]"}`}>{mes.slice(0, 3)}.</button>;
              })}
            </div>
            {mesesFiltro.length > 0 && <p className="mt-2 text-xs text-[#005a3c]">Selecionados: {mesesFiltro.map((m) => MESES_RELATORIO[m - 1]).join(", ")} de {anoFiltro}. Os totais usam somente esses meses; os saldos bancários consideram o intervalo contínuo entre o primeiro e o último mês selecionado.</p>}
          </div>
        </div>

        {erro && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            Erro ao carregar o relatório: {erro}
          </div>
        )}

        {carregando ? (
          <div className="rounded-2xl border border-[#dfe7e2] bg-white p-12 text-center text-gray-500 shadow-sm">
            Carregando relatório fiscal...
          </div>
        ) : (
          <>
            <div className="print-resumo-grade mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Resumo
                titulo="Saldo inicial"
                valor={moeda(saldoInicialSelecionado)}
                descricao="Contas selecionadas"
              />
              <Resumo
                titulo="Total de entradas"
                valor={moeda(entradas)}
                descricao="Receitas registradas"
                positivo
              />
              <Resumo
                titulo="Total de saídas"
                valor={moeda(saidas)}
                descricao="Despesas registradas"
                negativo
              />
              <Resumo
                titulo="Transferências"
                valor={moeda(transferencias)}
                descricao="Movimentações internas"
                azul
              />
              <Resumo
                titulo="Saldo final projetado"
                valor={moeda(saldoFinal)}
                descricao="Saldo no fim do intervalo"
                destaque
              />
            </div>

            <div className="mb-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                  <h2 className="text-xl font-extrabold text-[#003d2b]">
                    Prestação de contas
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Período: {mesesFiltro.length > 0 ? `${mesesFiltro.map((m) => MESES_RELATORIO[m - 1]).join(", ")} de ${anoFiltro}` : `${dataBR(dataInicial)} até ${dataBR(dataFinal)}`}
                    {contaFiltro !== "todas"
                      ? ` · ${contaMap.get(contaFiltro)?.nome || "Conta"}`
                      : " · Todas as contas"}
                  </p>
                </div>

                <div className="flex gap-2 text-xs font-bold">
                  <span className="rounded-full bg-green-50 px-3 py-2 text-green-700">
                    ✓ {conciliados} conciliado(s)
                  </span>
                  <span className="rounded-full bg-yellow-50 px-3 py-2 text-yellow-700">
                    ⏳ {pendentesConciliacao} pendente(s)
                  </span>
                </div>
              </div>
            </div>

            <div className="print-categorias-grade mb-6 grid gap-6 lg:grid-cols-2">
              <section className="sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold text-[#003d2b]">
                  Entradas por categoria
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  De onde vieram os recursos.
                </p>

                <div className="print-lista-categoria mt-5 space-y-3">
                  {categoriasEntrada.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Nenhuma entrada no período.
                    </p>
                  ) : (
                    categoriasEntrada.map((item) => (
                      <div
                        key={item.categoria}
                        className="flex items-center justify-between rounded-xl bg-[#f7faf8] px-4 py-3"
                      >
                        <div>
                          <p className="font-bold text-[#18362b]">
                            {item.categoria}
                          </p>
                          <p className="text-xs text-gray-500">
                            {percentual(item.valor, entradas)} das entradas
                          </p>
                        </div>
                        <strong className="text-[#005a3c]">
                          {moeda(item.valor)}
                        </strong>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold text-[#003d2b]">
                  Saídas por categoria
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Onde os recursos foram utilizados.
                </p>

                <div className="print-lista-categoria mt-5 space-y-3">
                  {categoriasSaida.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Nenhuma saída no período.
                    </p>
                  ) : (
                    categoriasSaida.map((item) => (
                      <div
                        key={item.categoria}
                        className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-3"
                      >
                        <div>
                          <p className="font-bold text-[#18362b]">
                            {item.categoria}
                          </p>
                          <p className="text-xs text-gray-500">
                            {percentual(item.valor, saidas)} das saídas
                          </p>
                        </div>
                        <strong className="text-red-600">
                          {moeda(item.valor)}
                        </strong>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <section className="mb-6 sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-extrabold text-[#003d2b]">Recebimentos por forma de pagamento</h2>
                <p className="mt-1 text-sm text-gray-500">Entradas efetivamente registradas no livro financeiro; não soma a tabela de pagamentos novamente.</p>
              </div>
              {recebimentosPorForma.length === 0 ? <p className="py-4 text-sm text-gray-500">Nenhum recebimento registrado no período.</p> : <div className="print-formas-grade grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{recebimentosPorForma.map((item) => <div key={item.forma} className="rounded-xl border border-[#e1e9e4] bg-[#f8fbf9] p-4"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">{item.forma.replaceAll("_", " ")}</p><p className="mt-2 text-xl font-extrabold text-[#005a3c]">{moeda(item.valor)}</p><p className="mt-1 text-xs text-gray-500">{item.quantidade} lançamento(s)</p></div>)}</div>}
            </section>

            <section className="mb-6 sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <div className="mb-5">
                <h2 className="text-lg font-extrabold text-[#003d2b]">
                  Saldos por banco
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Saldo calculado até o fim do intervalo; transferências alteram o saldo da conta, mas não são receita/despesa. Em meses avulsos, usa o intervalo contínuo entre o primeiro e o último mês.
                </p>
              </div>

              <div className="print-bancos-grade grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {linhasBancos.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Nenhuma conta bancária cadastrada.
                  </p>
                ) : (
                  linhasBancos.map((linha) => (
                    <div
                      key={linha.conta.id}
                      className="rounded-2xl border border-[#e1e9e4] bg-[#f8fbf9] p-5"
                    >
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                        Conta
                      </p>
                      <h3 className="mt-1 text-lg font-extrabold text-[#003d2b]">
                        {linha.conta.nome}
                      </h3>

                      {linha.conta.banco && (
                        <p className="text-sm text-gray-500">
                          {linha.conta.banco}
                        </p>
                      )}

                      <p className="print-saldo-banco mt-4 text-2xl font-extrabold text-[#005a3c]">
                        {moeda(linha.saldo)}
                      </p>

                      <div className="print-detalhe-banco mt-4 space-y-2 border-t border-[#dfe7e2] pt-3 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Entradas</span>
                          <strong className="text-green-700">
                            + {moeda(linha.entradas)}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Saídas</span>
                          <strong className="text-red-600">
                            − {moeda(linha.saidas)}
                          </strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">
                            Transferências líquidas
                          </span>
                          <strong className="text-blue-700">
                            {moeda(
                              linha.transferenciasEntrada -
                                linha.transferenciasSaida
                            )}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="mb-6 sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
              <div className="border-b border-[#e3ebe6] p-5">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div><h2 className="text-lg font-extrabold text-[#003d2b]">Controle de mensalidades</h2><p className="mt-1 text-sm text-gray-500">Cobranças por vencimento/competência. Estes valores são informativos e não são somados novamente às entradas do livro financeiro.</p></div>
                  <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-blue-50 px-3 py-2 text-blue-700">{mensalidadesPeriodo.filter((m) => !mensalidadeIsenta(m)).length} cobrança(s)</span><span className="rounded-full bg-green-50 px-3 py-2 text-green-700">Pagas: {moeda(totalMensalidadesPagas)}</span><span className="rounded-full bg-yellow-50 px-3 py-2 text-yellow-800">Em aberto: {moeda(totalMensalidadesEmAberto)}</span><span className="rounded-full bg-red-50 px-3 py-2 text-red-700">Vencidas: {moeda(totalMensalidadesVencidas)}</span><span className="rounded-full bg-gray-100 px-3 py-2 text-gray-700">Total lançado: {moeda(totalMensalidadesLancadas)}</span></div>
                </div>
              </div>
              <div className="relatorio-tabela overflow-x-auto"><table className="w-full min-w-[900px]"><thead className="bg-[#e8f3ee]"><tr className="text-left text-xs font-bold uppercase tracking-wide text-gray-500"><th className="px-5 py-3">Competência</th><th className="px-5 py-3">Vencimento</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3">Pagamento</th><th className="px-5 py-3">Recibo</th></tr></thead>
                <tbody className="divide-y divide-[#e6ede9]">{mensalidadesPeriodo.length === 0 ? <tr><td colSpan={6} className="px-5 py-10 text-center text-gray-500">Nenhuma mensalidade encontrada para o período.</td></tr> : mensalidadesPeriodo.map((m) => <tr key={m.id}><td className="px-5 py-4 text-sm font-semibold">{competenciaBR(m.competencia)}</td><td className="px-5 py-4 text-sm">{dataBR(m.data_vencimento)}</td><td className="px-5 py-4 text-sm font-bold">{moeda(valorMensalidade(m))}</td><td className="px-5 py-4 text-sm">{m.situacao || "—"}</td><td className="px-5 py-4 text-sm">{m.data_pagamento ? `${dataBR(m.data_pagamento)}${m.tipo_pagamento ? ` · ${m.tipo_pagamento}` : ""}` : "—"}</td><td className="px-5 py-4 text-sm">{m.numero_recibo || "—"}</td></tr>)}</tbody></table></div>
            </section>

            <section className="mb-6 sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
              <div className="border-b border-[#e3ebe6] p-5">
                <h2 className="text-lg font-extrabold text-[#003d2b]">
                  Livro financeiro do período
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {movimentosPeriodo.length} movimentação(ões) encontrada(s).
                </p>
              </div>

              <div className="relatorio-tabela overflow-x-auto">
                <table className="w-full min-w-[1050px]">
                  <thead className="bg-[#e8f3ee]">
                    <tr className="text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                      <th className="px-5 py-3">Data</th>
                      <th className="px-5 py-3">Conta</th>
                      <th className="px-5 py-3">Descrição</th>
                      <th className="px-5 py-3">Categoria</th>
                      <th className="px-5 py-3">Tipo</th>
                      <th className="px-5 py-3 text-right">Valor</th>
                      <th className="px-5 py-3">Conciliação</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-[#e6ede9]">
                    {movimentosPeriodo.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-5 py-12 text-center text-gray-500"
                        >
                          Nenhuma movimentação encontrada para os filtros.
                        </td>
                      </tr>
                    ) : (
                      movimentosPeriodo.map((mov) => {
                        const conta = contaMap.get(mov.conta_bancaria_id);
                        const destino =
                          mov.tipo === "transferencia"
                            ? contaMap.get(mov.conta_destino_id || "")
                            : null;

                        return (
                          <tr key={mov.id}>
                            <td className="px-5 py-4 text-sm">
                              {dataBR(mov.data_movimentacao)}
                            </td>

                            <td className="px-5 py-4">
                              <div className="font-bold text-[#18362b]">
                                {conta?.nome || "Conta"}
                              </div>
                              {destino && (
                                <div className="text-xs text-blue-600">
                                  → {destino.nome}
                                </div>
                              )}
                            </td>

                            <td className="px-5 py-4">
                              <div className="font-bold text-[#18362b]">
                                {mov.descricao}
                              </div>
                              {mov.origem_tipo && (
                                <div className="text-xs text-gray-400">
                                  {mov.origem_tipo}
                                </div>
                              )}
                            </td>

                            <td className="px-5 py-4 text-sm text-gray-600">
                              {normalizarCategoria(mov.categoria)}
                            </td>

                            <td className="px-5 py-4">
                              <TipoBadge tipo={mov.tipo} />
                            </td>

                            <td
                              className={`px-5 py-4 text-right font-extrabold ${
                                mov.tipo === "saida"
                                  ? "text-red-600"
                                  : mov.tipo === "transferencia"
                                    ? "text-blue-700"
                                    : "text-green-700"
                              }`}
                            >
                              {mov.tipo === "saida"
                                ? "− "
                                : mov.tipo === "transferencia"
                                  ? "↔ "
                                  : "+ "}
                              {moeda(mov.valor)}
                            </td>

                            <td className="px-5 py-4 text-sm">
                              {mov.conciliado ? (
                                <span className="font-semibold text-green-700">
                                  ✓ Conferido
                                </span>
                              ) : (
                                <span className="font-semibold text-yellow-700">
                                  ⏳ Pendente
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <h2 className="text-lg font-extrabold text-[#003d2b]">
                Resumo para prestação de contas
              </h2>

              <div className="print-resumo-final-grade mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-green-50 p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">
                    Recursos recebidos
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-green-700">
                    {moeda(entradas)}
                  </p>
                </div>

                <div className="rounded-xl bg-red-50 p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">
                    Recursos utilizados
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-red-600">
                    {moeda(saidas)}
                  </p>
                </div>

                <div className="rounded-xl bg-[#e8f3ee] p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">
                    Saldo disponível
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-[#005a3c]">
                    {moeda(saldoFinal)}
                  </p>
                </div>
              </div>

              <p className="mt-5 text-xs leading-5 text-gray-500">
                Este relatório usa o livro de movimentações financeiras como fonte oficial para entradas e saídas. As cobranças de mensalidades são exibidas à parte para conferência e não são adicionadas novamente às entradas. Transferências entre contas alteram os saldos bancários, mas não são tratadas como receita ou despesa. Os saldos inicial e final por banco são estimados conforme a data-base cadastrada e os movimentos do período.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  descricao,
  positivo,
  negativo,
  azul,
  destaque,
}: {
  titulo: string;
  valor: string;
  descricao: string;
  positivo?: boolean;
  negativo?: boolean;
  azul?: boolean;
  destaque?: boolean;
}) {
  let classe = "text-[#005a3c]";

  if (negativo) classe = "text-red-600";
  if (azul) classe = "text-blue-700";
  if (positivo) classe = "text-green-700";
  if (destaque) classe = "text-[#005a3c]";

  return (
    <div className="sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-extrabold ${classe}`}>{valor}</p>
      <p className="mt-1 text-xs text-gray-500">{descricao}</p>
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: Movimento["tipo"] }) {
  if (tipo === "saida") {
    return (
      <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
        Saída
      </span>
    );
  }

  if (tipo === "transferencia") {
    return (
      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
        Transferência
      </span>
    );
  }

  return (
    <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
      Entrada
    </span>
  );
}
