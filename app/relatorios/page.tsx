"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

type LinhaBanco = {
  conta: Conta;
  saldo: number;
  entradas: number;
  saidas: number;
  transferenciasEntrada: number;
  transferenciasSaida: number;
};

const hoje = new Date();
const primeiroDiaAno = `${hoje.getFullYear()}-01-01`;
const hojeISO = hoje.toISOString().slice(0, 10);

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

function percentual(valor: number, total: number) {
  if (!total) return "0,0%";
  return `${((valor / total) * 100).toFixed(1).replace(".", ",")}%`;
}

function normalizarCategoria(valor: string | null) {
  return valor?.trim() || "Sem categoria";
}

export default function RelatoriosPage() {
  const [contas, setContas] = useState<Conta[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [dataInicial, setDataInicial] = useState(primeiroDiaAno);
  const [dataFinal, setDataFinal] = useState(hojeISO);
  const [contaFiltro, setContaFiltro] = useState("todas");
  const [tipoFiltro, setTipoFiltro] = useState("todos");

  async function carregar() {
    setCarregando(true);
    setErro("");

    const [contasResult, movimentosResult] = await Promise.all([
      supabase
        .from("contas_bancarias")
        .select(
          "id,nome,banco,agencia,conta,saldo_inicial,data_saldo_inicial,ativo"
        )
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("movimentacoes_financeiras")
        .select(
          "id,conta_bancaria_id,conta_destino_id,tipo,categoria,descricao,valor,data_movimentacao,forma_pagamento,origem_tipo,socio_id,dependente_id,comprovante_url,conciliado,observacoes"
        )
        .order("data_movimentacao", { ascending: false }),
    ]);

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
    setCarregando(false);
  }

  useEffect(() => {
    void carregar();
  }, []);

  const contaMap = useMemo(
    () => new Map(contas.map((conta) => [conta.id, conta])),
    [contas]
  );

  const movimentosPeriodo = useMemo(() => {
    return movimentos.filter((mov) => {
      const dentroData =
        (!dataInicial || mov.data_movimentacao >= dataInicial) &&
        (!dataFinal || mov.data_movimentacao <= dataFinal);

      const dentroConta =
        contaFiltro === "todas" ||
        mov.conta_bancaria_id === contaFiltro ||
        (mov.tipo === "transferencia" && mov.conta_destino_id === contaFiltro);

      const dentroTipo =
        tipoFiltro === "todos" || mov.tipo === tipoFiltro;

      return dentroData && dentroConta && dentroTipo;
    });
  }, [movimentos, dataInicial, dataFinal, contaFiltro, tipoFiltro]);

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

  const saldoInicialSelecionado = useMemo(() => {
    if (contaFiltro !== "todas") {
      return Number(contaMap.get(contaFiltro)?.saldo_inicial || 0);
    }

    return contas.reduce(
      (total, conta) => total + Number(conta.saldo_inicial || 0),
      0
    );
  }, [contaFiltro, contaMap, contas]);

  const saldoFinal = useMemo(
    () => saldoInicialSelecionado + entradas - saidas,
    [saldoInicialSelecionado, entradas, saidas]
  );

  const categoriasEntrada = useMemo(() => {
    const mapa = new Map<string, number>();

    movimentosPeriodo
      .filter((m) => m.tipo === "entrada")
      .forEach((m) => {
        const categoria = normalizarCategoria(m.categoria);
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
        const categoria = normalizarCategoria(m.categoria);
        mapa.set(categoria, (mapa.get(categoria) || 0) + Number(m.valor || 0));
      });

    return Array.from(mapa.entries())
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [movimentosPeriodo]);

  const linhasBancos = useMemo<LinhaBanco[]>(() => {
    return contas
      .filter((conta) => contaFiltro === "todas" || conta.id === contaFiltro)
      .map((conta) => {
        let entradasBanco = 0;
        let saidasBanco = 0;
        let transferenciasEntrada = 0;
        let transferenciasSaida = 0;

        movimentosPeriodo.forEach((mov) => {
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

        const saldo =
          Number(conta.saldo_inicial || 0) +
          entradasBanco -
          saidasBanco +
          transferenciasEntrada -
          transferenciasSaida;

        return {
          conta,
          saldo,
          entradas: entradasBanco,
          saidas: saidasBanco,
          transferenciasEntrada,
          transferenciasSaida,
        };
      });
  }, [contas, contaFiltro, movimentosPeriodo]);

  const conciliados = movimentosPeriodo.filter((m) => m.conciliado).length;
  const pendentesConciliacao = movimentosPeriodo.length - conciliados;

  function imprimir() {
    window.print();
  }

  function voltar() {
    window.location.href = "/painel";
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#18362b]">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          body {
            background: white !important;
          }

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
            top: 0 !important;
            width: 100% !important;
            background: white !important;
          }

          .nao-imprimir {
            display: none !important;
          }

          .sombra-impressao {
            box-shadow: none !important;
            border: 1px solid #dfe7e2 !important;
          }
        }
      `}</style>

      <header className="sticky top-0 z-20 border-b border-[#dfe7e2] bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4">
          <button
            onClick={voltar}
            className="flex items-center gap-3 text-left"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#005a3c] text-xl">
              🏛️
            </div>
            <div>
              <div className="text-lg font-extrabold text-[#005a3c]">
                SOCIEDADE GUARANI
              </div>
              <div className="text-xs text-gray-500">
                Sociedade Recreativa Guarani — S.R.G.
              </div>
            </div>
          </button>

          <div className="text-sm font-medium text-gray-400">
            Área Administrativa
          </div>
        </div>
      </header>

      <main className="relatorio-impressao mx-auto max-w-[1500px] px-6 py-8">
        <div className="nao-imprimir mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <button
              onClick={voltar}
              className="mb-3 text-sm font-semibold text-[#005a3c]"
            >
              ← Voltar ao painel
            </button>
            <p className="text-sm font-medium text-gray-500">
              Administração
            </p>
            <h1 className="mt-1 text-3xl font-extrabold text-[#005a3c]">
              Relatório Fiscal
            </h1>
            <p className="mt-1 text-gray-500">
              Prestação de contas, fluxo financeiro e saldos bancários.
            </p>
          </div>

          <button
            onClick={imprimir}
            className="rounded-xl bg-[#005a3c] px-5 py-3 text-sm font-bold text-white shadow-sm"
          >
            🖨️ Imprimir / Salvar PDF
          </button>
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
                onChange={(e) => setDataInicial(e.target.value)}
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
                onChange={(e) => setDataFinal(e.target.value)}
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
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
                titulo="Saldo final"
                valor={moeda(saldoFinal)}
                descricao="Saldo calculado"
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
                    Período: {dataBR(dataInicial)} até {dataBR(dataFinal)}
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

            <div className="mb-6 grid gap-6 lg:grid-cols-2">
              <section className="sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                <h2 className="text-lg font-extrabold text-[#003d2b]">
                  Entradas por categoria
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  De onde vieram os recursos.
                </p>

                <div className="mt-5 space-y-3">
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

                <div className="mt-5 space-y-3">
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
              <div className="mb-5">
                <h2 className="text-lg font-extrabold text-[#003d2b]">
                  Saldos por banco
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Saldo inicial + entradas − saídas ± transferências internas.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

                      <p className="mt-4 text-2xl font-extrabold text-[#005a3c]">
                        {moeda(linha.saldo)}
                      </p>

                      <div className="mt-4 space-y-2 border-t border-[#dfe7e2] pt-3 text-xs">
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
                <h2 className="text-lg font-extrabold text-[#003d2b]">
                  Livro financeiro do período
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {movimentosPeriodo.length} movimentação(ões) encontrada(s).
                </p>
              </div>

              <div className="overflow-x-auto">
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

              <div className="mt-5 grid gap-4 md:grid-cols-3">
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
                Este relatório é calculado exclusivamente a partir dos
                lançamentos registrados no sistema. Transferências entre
                contas são tratadas como movimentações internas e não entram
                como receita ou despesa, evitando duplicidade na prestação de
                contas.
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

