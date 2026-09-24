"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Settings2, X, Save, CreditCard, Percent } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type M = {
  id: string;
  socio_id: string;
  competencia: string;
  valor: number;
  valor_base?: number | null;
  tarifa_pagamento?: number | null;
  multa?: number | null;
  juros?: number | null;
  desconto?: number | null;
  total_cobrado?: number | null;
  data_vencimento: string | null;
  situacao: string | null;
  data_pagamento: string | null;
  tipo_pagamento: string | null;
  observacoes: string | null;
  motivo: string | null;
  conta_pagadora_id?: string | null;
  socio?: any;
};

type C = {
  id: string;
  tipo_socio: string;
  nome: string;
  valor: number;
  vigencia_inicio: string;
  ativo: boolean;
};

type T = {
  id?: string;
  tipo_pagamento: string;
  nome: string;
  valor_tarifa: number;
  ativo: boolean;
};

type Conta = {
  id: string;
  nome: string;
  banco?: string | null;
};

type Cobranca = {
  id?: string;
  nome: string;
  multa_tipo: "percentual" | "valor";
  multa_valor: number;
  juros_tipo: "percentual_dia" | "percentual_mes" | "valor_dia" | "valor_mes";
  juros_valor: number;
  desconto_tipo: "percentual" | "valor";
  desconto_valor: number;
  dias_tolerancia: number;
  ativo: boolean;
};

type PreviaGeracao = {
  competencia: string;
  total_cobraveis: number;
  ja_existentes: number;
  quantidade_nova: number;
  valor_base: number;
  tarifa_pagamento: number;
  multa: number;
  juros: number;
  desconto: number;
  total_cobrado: number;
};

const nomes: Record<string, string> = {
  patrimonial_familiar: "Patrimonial Familiar",
  patrimonial_individual: "Patrimonial Individual",
  dependente_patrimonial_familiar_mensalidade:
    "Dependente Patrimonial com Mensalidade",
  dependente_patrimonial_individual_mensalidade:
    "Dependente Patrimonial Individual com Mensalidade",
  contribuinte_familiar: "Contribuinte Familiar",
  contribuinte_individual: "Contribuinte Individual",
  dependente_contribuinte_familiar_mensalidade:
    "Dependente Contribuinte com Mensalidade",
  dependente_contribuinte_individual_mensalidade:
    "Dependente Contribuinte Individual com Mensalidade",
  transitorio: "Transitório",
  remido: "Remido",
};

const tiposPagamento = [
  { value: "banrisul", label: "Débito Banrisul" },
  { value: "sicredi", label: "Débito Sicredi" },
  { value: "bb", label: "Débito Banco do Brasil" },
  { value: "boleto", label: "Boleto" },
  { value: "pix", label: "Pix" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "transferencia", label: "Transferência" },
  { value: "outro", label: "Outro" },
];

function moeda(v: number | null | undefined) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function data(v: string | null) {
  if (!v) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function status(s: string | null) {
  if (s === "pago") return ["Pago", "bg-green-100 text-green-700"];
  if (s === "isento") return ["Isento", "bg-gray-100 text-gray-600"];
  if (s === "em_atraso")
    return ["Atrasada", "bg-red-100 text-red-700"];
  return ["Em aberto", "bg-yellow-100 text-yellow-700"];
}

const cobrancaInicial: Cobranca = {
  nome: "Configuração padrão",
  multa_tipo: "percentual",
  multa_valor: 0,
  juros_tipo: "percentual_mes",
  juros_valor: 0,
  desconto_tipo: "valor",
  desconto_valor: 0,
  dias_tolerancia: 0,
  ativo: true,
};

export default function Page() {
  const hoje = new Date();

  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());
  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth() + 1);
  const [aplicandoCompetencia, setAplicandoCompetencia] = useState(false);
  const [busca, setBusca] = useState("");
  const [cobrancasSelecionadas, setCobrancasSelecionadas] = useState<string[]>([]);
  const [lista, setLista] = useState<M[]>([]);
  const [configs, setConfigs] = useState<C[]>([]);
  const [tarifas, setTarifas] = useState<T[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [cobranca, setCobranca] = useState<Cobranca>(cobrancaInicial);

  const [sel, setSel] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");

  const [modal, setModal] = useState(false);
  const [abaConfig, setAbaConfig] = useState<"mensalidades" | "tarifas" | "atrasos">(
    "mensalidades"
  );

  const [edit, setEdit] = useState<C | null>(null);
  const [novo, setNovo] = useState({
    tipo_socio: "",
    nome: "",
    valor: "0",
    vigencia_inicio: `${hoje.getFullYear()}-01-01`,
  });

  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const [previas, setPrevias] = useState<PreviaGeracao[]>([]);
  const [mesesParaGerar, setMesesParaGerar] = useState<number[]>([mes]);
  const [abrindoPrevia, setAbrindoPrevia] = useState(false);
  const [confirmandoGeracao, setConfirmandoGeracao] = useState(false);
  const [socioSelecionado, setSocioSelecionado] = useState<M | null>(null);

  async function h() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) throw Error("Sessão não encontrada.");

    return {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    };
  }

  async function carregar() {
    try {
      setErro("");

      const r = await fetch(
        `/api/mensalidades/admin?ano=${ano}&mes=${mes}`,
        {
          headers: await h(),
          cache: "no-store",
        }
      );

      const d = await r.json();

      if (!r.ok) throw Error(d.error || "Erro ao carregar mensalidades.");

      setLista(d.mensalidades || []);
      setConfigs(d.configuracoes || []);
      setTarifas(d.tarifas || []);
      setCobranca(d.cobranca || cobrancaInicial);

      const { data: contasData } = await supabase
        .from("contas_bancarias")
        .select("id,nome,banco")
        .order("nome");

      setContas(contasData || []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [ano, mes]);

  async function aplicarCompetencia() {
    if (anoSelecionado === ano && mesSelecionado === mes) return;
    setAplicandoCompetencia(true);
    setAno(anoSelecionado);
    setMes(mesSelecionado);
    setAplicandoCompetencia(false);
  }

  function normalizarPagamento(valor: unknown) {
    return String(valor || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s-]+/g, "_");
  }

  function normalizarBanco(valor: unknown) {
    return String(valor || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s_-]+/g, " ");
  }

  function tipoCobranca(m: M) {
    const pagamento = normalizarPagamento(m.tipo_pagamento);

    // PIX/Boleto continuam sendo identificados diretamente pelo lançamento.
    if (pagamento === "pix" || pagamento === "botero") return "pix";
    if (pagamento === "boleto") return "boleto";
    if (pagamento === "dinheiro") return "dinheiro";
    if (pagamento === "transferencia") return "transferencia";
    if (pagamento === "outro") return "outro";

    // Alguns cadastros antigos gravam o banco diretamente no tipo_pagamento.
    if (pagamento === "banrisul" || pagamento === "bergs" || pagamento.includes("banrisul")) {
      return "banrisul";
    }
    if (pagamento === "sicredi" || pagamento.includes("sicredi")) {
      return "sicredi";
    }
    if (
      pagamento === "bb" ||
      pagamento === "banco_do_brasil" ||
      pagamento.includes("banco_do_brasil") ||
      pagamento === "debito_bb"
    ) {
      return "bb";
    }

    // O cadastro atual normalmente grava apenas "debito_em_conta".
    // Também inferimos pelo banco quando o tipo_pagamento veio vazio,
    // usando primeiro a conta gravada na própria mensalidade e depois
    // a conta atual do associado.
    const contaId = m.conta_pagadora_id || m.socio?.conta_bancaria_id;
    const conta = contas.find((c) => String(c.id) === String(contaId));
    const banco = normalizarBanco(`${conta?.nome || ""} ${conta?.banco || ""}`);

    if (
      pagamento === "debito_em_conta" ||
      pagamento === "debito" ||
      pagamento === "debito_em_conta_bancaria" ||
      !pagamento
    ) {
      if (banco.includes("banrisul") || banco.includes("bergs")) return "banrisul";
      if (banco.includes("sicredi")) return "sicredi";
      if (
        banco === "bb" ||
        banco.includes(" bb ") ||
        banco.includes("banco do brasil")
      ) {
        return "bb";
      }
    }

    return "sem_pagamento";
  }

  const filtrada = useMemo(() => {
    const q = busca.toLowerCase().trim();

    return lista.filter((x) => {
      const bateBusca =
        !q ||
        `${x.socio?.nome || ""} ${x.socio?.matricula || ""} ${x.socio?.cpf || ""}`
          .toLowerCase()
          .includes(q);

      const cobrancaAtual = tipoCobranca(x);
      const bateCobranca =
        cobrancasSelecionadas.length === 0 ||
        cobrancasSelecionadas.includes(cobrancaAtual);

      return bateBusca && bateCobranca;
    });
  }, [lista, busca, cobrancasSelecionadas, contas]);

  async function post(body: any) {
    setErro("");
    setMsg("");

    try {
      const r = await fetch("/api/mensalidades/admin", {
        method: "POST",
        headers: await h(),
        body: JSON.stringify(body),
      });

      const d = await r.json();

      if (!r.ok) throw Error(d.error || "Erro.");

      setMsg(d.message || "Concluído.");
      setSel([]);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro.");
    }
  }

  async function estornarBaixa(item: M) {
    if (item.situacao !== "pago") return;

    const confirmar = window.confirm(
      `Deseja estornar a baixa de ${item.socio?.nome || "este associado"}?\n\nA mensalidade voltará para Em aberto e a entrada financeira pendente será removida.`
    );

    if (!confirmar) return;

    setErro("");
    setMsg("");

    try {
      const r = await fetch("/api/mensalidades/admin", {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({
          acao: "estornar",
          id: item.id,
        }),
      });

      const d = await r.json();

      if (!r.ok) throw Error(d.error || "Não foi possível estornar a baixa.");

      setMsg(d.message || "Pagamento estornado com sucesso.");
      setSel((atual) => atual.filter((id) => id !== item.id));
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível estornar a baixa.");
    }
  }

  function mesDisponivelParaGeracao(m: number) {
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;
    if (ano > anoAtual) return false;
    if (ano < anoAtual) return true;
    return m <= mesAtual;
  }

  function alternarMesGeracao(m: number) {
    if (!mesDisponivelParaGeracao(m)) return;
    setMesesParaGerar((atual) =>
      atual.includes(m) ? atual.filter((x) => x !== m) : [...atual, m].sort((a, b) => a - b)
    );
  }

  function selecionarMesesDisponiveis() {
    const limite = ano < hoje.getFullYear() ? 12 : ano === hoje.getFullYear() ? hoje.getMonth() + 1 : 0;
    setMesesParaGerar(Array.from({ length: limite }, (_, i) => i + 1));
  }

  async function previsualizarGeracao() {
    const selecionados = [...mesesParaGerar].sort((a, b) => a - b);
    if (selecionados.length === 0) {
      setErro("Selecione pelo menos um mês para gerar.");
      return;
    }

    setErro("");
    setMsg("");
    setAbrindoPrevia(true);
    setPrevias([]);

    try {
      const resultados: PreviaGeracao[] = [];
      for (const mesGeracao of selecionados) {
        const r = await fetch("/api/mensalidades/admin", {
          method: "POST",
          headers: await h(),
          body: JSON.stringify({
            acao: "previsualizar",
            ano,
            mes: mesGeracao,
          }),
        });

        const d = await r.json();
        if (!r.ok) throw Error(d.error || `Não foi possível gerar a prévia de ${String(mesGeracao).padStart(2, "0")}/${ano}.`);
        resultados.push(d);
      }

      setPrevias(resultados);
    } catch (e) {
      setAbrindoPrevia(false);
      setPrevias([]);
      setErro(e instanceof Error ? e.message : "Erro ao gerar prévia.");
    }
  }

  async function confirmarGeracao() {
    if (previas.length === 0) return;

    setConfirmandoGeracao(true);
    setErro("");
    setMsg("");

    try {
      let criadasTotal = 0;
      const resultados: string[] = [];

      for (const item of previas) {
        if (item.quantidade_nova <= 0) {
          resultados.push(`${item.competencia.slice(0, 7)}: nenhuma nova`);
          continue;
        }

        const [anoGeracao, mesGeracao] = item.competencia.slice(0, 7).split("-").map(Number);
        const r = await fetch("/api/mensalidades/admin", {
          method: "POST",
          headers: await h(),
          body: JSON.stringify({
            acao: "gerar",
            ano: anoGeracao,
            mes: mesGeracao,
          }),
        });

        const d = await r.json();
        if (!r.ok) throw Error(d.error || `Não foi possível gerar ${mesGeracao}/${anoGeracao}.`);
        const criadas = Number(d.criadas || item.quantidade_nova || 0);
        criadasTotal += criadas;
        resultados.push(`${String(mesGeracao).padStart(2, "0")}/${anoGeracao}: ${criadas} gerada(s)`);
      }

      setAbrindoPrevia(false);
      setPrevias([]);
      setMsg(`Geração concluída: ${criadasTotal} mensalidade(s). ${resultados.join(" • ")}`);
      setSel([]);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar competências.");
    } finally {
      setConfirmandoGeracao(false);
    }
  }

  function fecharPrevia() {
    if (confirmandoGeracao) return;
    setAbrindoPrevia(false);
    setPrevias([]);
  }

  function abrirConfiguracao() {
    setAbaConfig("mensalidades");
    setEdit(null);
    setNovo({
      tipo_socio: "",
      nome: "",
      valor: "0",
      vigencia_inicio: `${ano}-01-01`,
    });
    setModal(true);
  }

  async function salvarCobranca() {
    setSalvandoConfig(true);

    try {
      await post({
        acao: "cobranca_editar",
        ...cobranca,
        multa_valor: Number(cobranca.multa_valor || 0),
        juros_valor: Number(cobranca.juros_valor || 0),
        desconto_valor: Number(cobranca.desconto_valor || 0),
        dias_tolerancia: Number(cobranca.dias_tolerancia || 0),
      });
      setModal(false);
    } finally {
      setSalvandoConfig(false);
    }
  }

  async function salvarTarifa(t: T) {
    await post({
      acao: "tarifa_editar",
      id: t.id,
      tipo_pagamento: t.tipo_pagamento,
      nome: t.nome,
      valor_tarifa: Number(t.valor_tarifa || 0),
      ativo: Boolean(t.ativo),
    });
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />

      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-[1400px] space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">Financeiro</p>
              <h1 className="text-3xl font-black text-[#005a3c]">
                Mensalidades
              </h1>
              <p className="text-sm text-gray-500">
                Lançamento, cobrança e controle das mensalidades.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void previsualizarGeracao()}
                className="rounded-xl bg-[#005a3c] px-4 py-3 font-bold text-white"
              >
                Gerar competência
              </button>

              <button
                onClick={abrirConfiguracao}
                className="rounded-xl border bg-white px-4 py-3 font-bold"
              >
                <Settings2 className="mr-2 inline h-4 w-4" />
                Configuração
              </button>
            </div>
          </div>

          {msg && (
            <div className="rounded-xl bg-green-50 p-4 font-bold text-green-700">
              {msg}
            </div>
          )}

          {erro && (
            <div className="rounded-xl bg-red-50 p-4 font-bold text-red-700">
              {erro}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="rounded-2xl border bg-white p-4">
              Ano
              <select
                value={anoSelecionado}
                onChange={(e) => setAnoSelecionado(+e.target.value)}
                className="mt-2 w-full rounded-xl border p-2"
              >
                {Array.from({ length: 7 }, (_, i) => hoje.getFullYear() - 2 + i).map(
                  (a) => (
                    <option key={a}>{a}</option>
                  )
                )}
              </select>
            </label>

            <label className="rounded-2xl border bg-white p-4">
              Competência
              <select
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(+e.target.value)}
                className="mt-2 w-full rounded-xl border p-2"
              >
                {[
                  "Janeiro",
                  "Fevereiro",
                  "Março",
                  "Abril",
                  "Maio",
                  "Junho",
                  "Julho",
                  "Agosto",
                  "Setembro",
                  "Outubro",
                  "Novembro",
                  "Dezembro",
                ].map((x, i) => (
                  <option value={i + 1} key={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3">
            <div className="text-sm text-gray-500">
              {anoSelecionado === ano && mesSelecionado === mes
                ? `Competência ativa: ${String(mes).padStart(2, "0")}/${ano}`
                : `Seleção pendente: ${String(mesSelecionado).padStart(2, "0")}/${anoSelecionado}`}
            </div>
            <button
              type="button"
              onClick={() => void aplicarCompetencia()}
              disabled={aplicandoCompetencia || (anoSelecionado === ano && mesSelecionado === mes)}
              className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {aplicandoCompetencia ? "Aplicando..." : "OK — Abrir competência"}
            </button>
          </div>

          <section className="rounded-2xl border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-black text-[#005a3c]">Meses para gerar</h2>
                <p className="text-sm text-gray-500">Selecione uma ou várias competências. Cada mês é processado separadamente e registros já existentes não são duplicados.</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={selecionarMesesDisponiveis} className="rounded-lg border px-3 py-2 text-xs font-bold">Selecionar todos disponíveis</button>
                <button type="button" onClick={() => setMesesParaGerar([])} className="rounded-lg border px-3 py-2 text-xs font-bold text-gray-600">Limpar</button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {[
                "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
              ].map((nomeMes, i) => {
                const numero = i + 1;
                const disponivel = mesDisponivelParaGeracao(numero);
                const marcado = mesesParaGerar.includes(numero);
                return (
                  <label key={nomeMes} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-bold ${marcado ? "border-[#005a3c] bg-[#eef7f2] text-[#005a3c]" : "bg-white"} ${!disponivel ? "cursor-not-allowed opacity-40" : ""}`}>
                    <input type="checkbox" checked={marcado} disabled={!disponivel} onChange={() => alternarMesGeracao(numero)} />
                    {nomeMes}
                  </label>
                );
              })}
            </div>
            <div className="mt-3 text-sm font-semibold text-gray-600">
              {mesesParaGerar.length} mês(es) selecionado(s) para geração.
            </div>
          </section>

          <div className="rounded-2xl border bg-white p-4">
            <div className="flex gap-3">
              <div className="flex flex-1 items-center gap-2 rounded-xl border px-3">
                <Search className="h-4 w-4 text-gray-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome ou matrícula..."
                  className="w-full py-3 outline-none"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm font-bold text-gray-600">
                  Tipo de cobrança:
                </span>
                {[
                  ["banrisul", "Banrisul"],
                  ["sicredi", "Sicredi"],
                  ["bb", "Banco do Brasil"],
                  ["boleto", "Boleto"],
                  ["pix", "PIX"],
                  ["sem_pagamento", "Sem pagamento"],
                ].map(([valor, label]) => {
                  const ativo = cobrancasSelecionadas.includes(valor);
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() =>
                        setCobrancasSelecionadas((atual) =>
                          ativo
                            ? atual.filter((x) => x !== valor)
                            : [...atual, valor]
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                        ativo
                          ? "border-[#005a3c] bg-[#005a3c] text-white"
                          : "bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
                {cobrancasSelecionadas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCobrancasSelecionadas([])}
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-gray-500 underline"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="mt-3 text-xs text-gray-500">
                Exibindo <b>{filtrada.length}</b> de <b>{lista.length}</b> mensalidade(s)
              </div>

              <button
                disabled={!sel.length}
                onClick={() =>
                  void post({
                    acao: "baixar",
                    ids: sel,
                    data_pagamento: new Date().toISOString().slice(0, 10),
                  })
                }
                className="rounded-xl bg-[#005a3c] px-4 py-3 font-bold text-white disabled:opacity-40"
              >
                Baixar selecionadas ({sel.length})
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-[#e8f3ee]">
                  <tr>
                    <th className="p-3">✓</th>
                    <th className="p-3 text-left">Associado</th>
                    <th className="p-3 text-left">Matrícula</th>
                    <th className="p-3 text-left">Tipo</th>
                    <th className="p-3 text-left">Vencimento</th>
                    <th className="p-3 text-left">Base</th>
                    <th className="p-3 text-left">Tarifa</th>
                    <th className="p-3 text-left">Acréscimos</th>
                    <th className="p-3 text-left">Total cobrado</th>
                    <th className="p-3 text-left">Situação</th>
                    <th className="p-3 text-left">Motivo</th>
                    <th className="sticky right-0 z-20 bg-[#e8f3ee] p-3 text-left shadow-[-4px_0_8px_rgba(0,0,0,0.06)]">Ações</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {filtrada.map((x) => {
                    const st = status(x.situacao);
                    const acrescimos =
                      Number(x.multa || 0) + Number(x.juros || 0);

                    return (
                      <tr key={x.id}>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={sel.includes(x.id)}
                            onChange={() =>
                              setSel((s) =>
                                s.includes(x.id)
                                  ? s.filter((i) => i !== x.id)
                                  : [...s, x.id]
                              )
                            }
                          />
                        </td>

                        <td className="p-3 font-bold">
                          <button
                            type="button"
                            onClick={() => setSocioSelecionado(x)}
                            className="text-left text-[#005a3c] underline-offset-2 hover:underline"
                          >
                            {x.socio?.nome || "—"}
                          </button>
                        </td>

                        <td className="p-3">{x.socio?.matricula || "—"}</td>

                        <td className="p-3">
                          {nomes[x.socio?.tipo_socio] ||
                            x.socio?.tipo_socio ||
                            "—"}
                        </td>

                        <td className="p-3">
                          {data(x.data_vencimento)}
                        </td>

                        <td className="p-3 font-bold">
                          {moeda(x.valor_base ?? x.valor)}
                        </td>

                        <td className="p-3">
                          {moeda(x.tarifa_pagamento)}
                        </td>

                        <td className="p-3">
                          {moeda(acrescimos)}
                        </td>

                        <td className="p-3 font-black text-[#005a3c]">
                          {moeda(
                            x.total_cobrado ??
                              Number(x.valor_base ?? x.valor) +
                                Number(x.tarifa_pagamento || 0) +
                                Number(x.multa || 0) +
                                Number(x.juros || 0) -
                                Number(x.desconto || 0)
                          )}
                        </td>

                        <td className="p-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${st[1]}`}
                          >
                            {st[0]}
                          </span>
                        </td>

                        <td className="p-3">
                          {x.motivo || x.observacoes || "—"}
                        </td>

                        <td className="sticky right-0 z-10 bg-white p-3 shadow-[-4px_0_8px_rgba(0,0,0,0.06)]">
                          {x.situacao === "pago" ? (
                            <button
                              type="button"
                              onClick={() => void estornarBaixa(x)}
                              className="rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-700 hover:bg-yellow-100"
                            >
                              ↩️ Estornar baixa
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <section className="rounded-2xl border bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-black text-xl text-[#005a3c]">
                  Tipos e valores
                </h2>
                <p className="text-sm text-gray-500">
                  O valor base da mensalidade permanece separado das tarifas.
                </p>
              </div>

              <button
                onClick={abrirConfiguracao}
                className="rounded-xl border px-4 py-2 font-bold"
              >
                <Settings2 className="mr-2 inline h-4 w-4" />
                Editar configurações
              </button>
            </div>

            <div className="divide-y">
              {configs.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <span className="font-bold">{c.nome}</span>
                    <div className="text-xs text-gray-500">
                      {c.tipo_socio} · vigente {data(c.vigencia_inicio)} ·{" "}
                      {c.ativo ? "Ativo" : "Inativo"}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <b>{moeda(c.valor)}</b>

                    <button
                      type="button"
                      onClick={() => {
                        setEdit(c);
                        setNovo({
                          tipo_socio: c.tipo_socio,
                          nome: c.nome,
                          valor: String(c.valor),
                          vigencia_inicio: c.vigencia_inicio,
                        });
                        setAbaConfig("mensalidades");
                        setModal(true);
                      }}
                      className="rounded-lg border px-3 py-2 text-xs font-bold"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {socioSelecionado && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Cadastro do associado</p>
                <h2 className="text-2xl font-black text-[#005a3c]">
                  {socioSelecionado.socio?.nome || "Associado"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSocioSelecionado(null)}
                className="rounded-full p-2 hover:bg-gray-100"
              >
                <X />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {[
                ["Matrícula", socioSelecionado.socio?.matricula],
                ["CPF", socioSelecionado.socio?.cpf],
                ["Categoria", socioSelecionado.socio?.categoria],
                [
                  "Tipo de sócio",
                  nomes[socioSelecionado.socio?.tipo_socio] ||
                    socioSelecionado.socio?.tipo_socio,
                ],
                ["Situação", socioSelecionado.socio?.situacao],
                ["Parentesco", socioSelecionado.socio?.parentesco],
                ["Responsável ID", socioSelecionado.socio?.responsavel_id],
                ["Telefone", socioSelecionado.socio?.telefone],
                ["E-mail", socioSelecionado.socio?.email],
                ["Endereço", socioSelecionado.socio?.endereco],
              ].map(([label, valor]) => (
                <div key={label} className="rounded-xl border bg-gray-50 p-3">
                  <div className="text-xs font-bold uppercase text-gray-500">
                    {label}
                  </div>
                  <div className="mt-1 break-words font-semibold">
                    {valor || "—"}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-[#cfe6da] bg-[#f4faf7] p-4">
              <h3 className="font-black text-[#005a3c]">
                Mensalidade {String(mes).padStart(2, "0")}/{ano}
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-xs text-gray-500">Valor base</span>
                  <p className="font-bold">
                    {moeda(
                      socioSelecionado.valor_base ?? socioSelecionado.valor
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Tipo de cobrança</span>
                  <p className="font-bold">
                    {{
                      banrisul: "Banrisul",
                      sicredi: "Sicredi",
                      bb: "Banco do Brasil",
                      boleto: "Boleto",
                      pix: "PIX",
                      sem_pagamento: "Sem pagamento",
                      debito_em_conta: "Débito em conta",
                      dinheiro: "Dinheiro",
                      transferencia: "Transferência",
                      outro: "Outro",
                    }[tipoCobranca(socioSelecionado)] || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Tarifa</span>
                  <p className="font-bold">
                    {moeda(socioSelecionado.tarifa_pagamento)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Total cobrado</span>
                  <p className="font-black text-[#005a3c]">
                    {moeda(socioSelecionado.total_cobrado)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Vencimento</span>
                  <p className="font-bold">
                    {data(socioSelecionado.data_vencimento)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Situação</span>
                  <p className="font-bold">
                    {status(socioSelecionado.situacao)[0]}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Data de pagamento</span>
                  <p className="font-bold">
                    {data(socioSelecionado.data_pagamento)}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Observações</span>
                  <p className="font-bold">
                    {socioSelecionado.motivo ||
                      socioSelecionado.observacoes ||
                      "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSocioSelecionado(null)}
                className="rounded-xl bg-[#005a3c] px-5 py-2 font-bold text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {abrindoPrevia && previas.length > 0 && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-[#005a3c]">Prévia da geração — {previas.length} competência(s)</h2>
                <p className="mt-1 text-sm text-gray-500">Confira todos os meses antes de gravar. Nenhum lançamento foi criado ainda.</p>
              </div>
              <button type="button" onClick={fecharPrevia} disabled={confirmandoGeracao} className="rounded-full p-2 hover:bg-gray-100 disabled:opacity-40"><X /></button>
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-[#eef7f2]"><tr><th className="p-3 text-left">Competência</th><th className="p-3 text-right">Pagadores</th><th className="p-3 text-right">Novos</th><th className="p-3 text-right">Existentes</th><th className="p-3 text-right">Base</th><th className="p-3 text-right">Total cobrado</th></tr></thead>
                <tbody className="divide-y">
                  {previas.map((p) => (
                    <tr key={p.competencia}>
                      <td className="p-3 font-bold text-[#005a3c]">{p.competencia.slice(5, 7)}/{p.competencia.slice(0, 4)}</td>
                      <td className="p-3 text-right">{p.total_cobraveis}</td>
                      <td className="p-3 text-right font-black text-[#005a3c]">{p.quantidade_nova}</td>
                      <td className="p-3 text-right">{p.ja_existentes}</td>
                      <td className="p-3 text-right">{moeda(p.valor_base)}</td>
                      <td className="p-3 text-right font-black">{moeda(p.total_cobrado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr><td className="p-3 font-black">TOTAL</td><td className="p-3 text-right font-black">{previas.reduce((s,p) => s+p.total_cobraveis,0)}</td><td className="p-3 text-right font-black text-[#005a3c]">{previas.reduce((s,p) => s+p.quantidade_nova,0)}</td><td className="p-3 text-right font-black">{previas.reduce((s,p) => s+p.ja_existentes,0)}</td><td className="p-3 text-right font-black">{moeda(previas.reduce((s,p) => s+p.valor_base,0))}</td><td className="p-3 text-right font-black text-[#005a3c]">{moeda(previas.reduce((s,p) => s+p.total_cobrado,0))}</td></tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">Atenção: a geração será feita mês a mês. Se uma competência já tiver registros, eles não serão duplicados.</div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={fecharPrevia} disabled={confirmandoGeracao} className="rounded-xl border px-5 py-3 font-bold disabled:opacity-40">Cancelar</button>
              <button type="button" onClick={() => void confirmarGeracao()} disabled={confirmandoGeracao || previas.every((p) => p.quantidade_nova === 0)} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-50">{confirmandoGeracao ? "Gerando..." : "✓ Confirmar geração dos meses"}</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-[#005a3c]">
                  Configuração financeira
                </h2>
                <p className="text-sm text-gray-500">
                  Valores e regras usados para calcular a cobrança.
                </p>
              </div>

              <button onClick={() => setModal(false)}>
                <X />
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 border-b pb-3">
              <button
                onClick={() => setAbaConfig("mensalidades")}
                className={`rounded-xl px-4 py-2 font-bold ${
                  abaConfig === "mensalidades"
                    ? "bg-[#005a3c] text-white"
                    : "border bg-white"
                }`}
              >
                <CreditCard className="mr-2 inline h-4 w-4" />
                Mensalidades
              </button>

              <button
                onClick={() => setAbaConfig("tarifas")}
                className={`rounded-xl px-4 py-2 font-bold ${
                  abaConfig === "tarifas"
                    ? "bg-[#005a3c] text-white"
                    : "border bg-white"
                }`}
              >
                <CreditCard className="mr-2 inline h-4 w-4" />
                Tarifas
              </button>

              <button
                onClick={() => setAbaConfig("atrasos")}
                className={`rounded-xl px-4 py-2 font-bold ${
                  abaConfig === "atrasos"
                    ? "bg-[#005a3c] text-white"
                    : "border bg-white"
                }`}
              >
                <Percent className="mr-2 inline h-4 w-4" />
                Multa, juros e desconto
              </button>
            </div>

            {abaConfig === "mensalidades" && (
              <div className="mt-5">
                <div className="mb-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
                  <b>Valor base:</b> é o valor que pertence à mensalidade da
                  Sociedade. A tarifa bancária será calculada separadamente.
                </div>

                <div className="space-y-3">
                  {configs.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div>
                        <div className="font-bold">{c.nome}</div>
                        <div className="text-xs text-gray-500">
                          {c.tipo_socio}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-black">{moeda(c.valor)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEdit(c);
                            setNovo({
                              tipo_socio: c.tipo_socio,
                              nome: c.nome,
                              valor: String(c.valor),
                              vigencia_inicio: c.vigencia_inicio,
                            });
                          }}
                          className="rounded-lg border px-3 py-2 text-xs font-bold"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-xl border p-4">
                  <h3 className="font-black">Adicionar novo tipo</h3>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void post({
                        acao: "config_criar",
                        ...novo,
                        valor: Number(novo.valor || 0),
                      }).then(() => {
                        setNovo({
                          tipo_socio: "",
                          nome: "",
                          valor: "0",
                          vigencia_inicio: `${ano}-01-01`,
                        });
                      });
                    }}
                    className="mt-3 grid gap-3 md:grid-cols-2"
                  >
                    <input
                      value={novo.nome}
                      onChange={(e) =>
                        setNovo({ ...novo, nome: e.target.value })
                      }
                      placeholder="Nome do tipo"
                      className="rounded-xl border p-3"
                    />

                    <input
                      value={novo.tipo_socio}
                      onChange={(e) =>
                        setNovo({ ...novo, tipo_socio: e.target.value })
                      }
                      placeholder="Código interno"
                      className="rounded-xl border p-3"
                    />

                    <input
                      type="number"
                      step="0.01"
                      value={novo.valor}
                      onChange={(e) =>
                        setNovo({ ...novo, valor: e.target.value })
                      }
                      placeholder="Valor"
                      className="rounded-xl border p-3"
                    />

                    <input
                      type="date"
                      value={novo.vigencia_inicio}
                      onChange={(e) =>
                        setNovo({
                          ...novo,
                          vigencia_inicio: e.target.value,
                        })
                      }
                      className="rounded-xl border p-3"
                    />

                    <button className="rounded-xl bg-[#005a3c] p-3 font-bold text-white md:col-span-2">
                      Adicionar configuração
                    </button>
                  </form>
                </div>
              </div>
            )}

            {abaConfig === "tarifas" && (
              <div className="mt-5">
                <div className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  <b>Atenção:</b> a tarifa é cobrada do associado junto com a
                  mensalidade, mas não deve ser contabilizada como receita da
                  Sociedade.
                </div>

                <div className="space-y-3">
                  {tiposPagamento.map((tipo) => {
                    const atual =
                      tarifas.find(
                        (x) => x.tipo_pagamento === tipo.value
                      ) || {
                        tipo_pagamento: tipo.value,
                        nome: tipo.label,
                        valor_tarifa: 0,
                        ativo: true,
                      };

                    return (
                      <div
                        key={tipo.value}
                        className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_180px_110px]"
                      >
                        <div>
                          <div className="font-bold">{tipo.label}</div>
                          <div className="text-xs text-gray-500">
                            Código: {tipo.value}
                          </div>
                        </div>

                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={String(atual.valor_tarifa ?? 0)}
                          onChange={(e) =>
                            setTarifas((lista) => {
                              const existe = lista.some(
                                (x) => x.tipo_pagamento === tipo.value
                              );

                              if (existe) {
                                return lista.map((x) =>
                                  x.tipo_pagamento === tipo.value
                                    ? {
                                        ...x,
                                        valor_tarifa: Number(
                                          e.target.value || 0
                                        ),
                                      }
                                    : x
                                );
                              }

                              return [
                                ...lista,
                                {
                                  ...atual,
                                  valor_tarifa: Number(
                                    e.target.value || 0
                                  ),
                                },
                              ];
                            })
                          }
                          className="rounded-xl border p-3"
                        />

                        <button
                          type="button"
                          onClick={() => void salvarTarifa(atual)}
                          className="rounded-xl bg-[#005a3c] px-3 py-2 font-bold text-white"
                        >
                          <Save className="mr-1 inline h-4 w-4" />
                          Salvar
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {abaConfig === "atrasos" && (
              <div className="mt-5 space-y-5">
                <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
                  Deixamos multa, juros e desconto zerados até você definir os
                  valores oficiais. Depois eles poderão ser alterados pelo
                  administrador.
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="rounded-xl border p-4">
                    <span className="font-bold">Dias de tolerância</span>
                    <input
                      type="number"
                      min="0"
                      value={cobranca.dias_tolerancia}
                      onChange={(e) =>
                        setCobranca({
                          ...cobranca,
                          dias_tolerancia: Number(e.target.value || 0),
                        })
                      }
                      className="mt-2 w-full rounded-xl border p-3"
                    />
                  </label>

                  <label className="rounded-xl border p-4">
                    <span className="font-bold">Multa</span>
                    <div className="mt-2 flex gap-2">
                      <select
                        value={cobranca.multa_tipo}
                        onChange={(e) =>
                          setCobranca({
                            ...cobranca,
                            multa_tipo: e.target.value as Cobranca["multa_tipo"],
                          })
                        }
                        className="rounded-xl border p-3"
                      >
                        <option value="percentual">%</option>
                        <option value="valor">R$</option>
                      </select>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={cobranca.multa_valor}
                        onChange={(e) =>
                          setCobranca({
                            ...cobranca,
                            multa_valor: Number(e.target.value || 0),
                          })
                        }
                        className="w-full rounded-xl border p-3"
                      />
                    </div>
                  </label>

                  <label className="rounded-xl border p-4">
                    <span className="font-bold">Juros</span>
                    <div className="mt-2 flex gap-2">
                      <select
                        value={cobranca.juros_tipo}
                        onChange={(e) =>
                          setCobranca({
                            ...cobranca,
                            juros_tipo:
                              e.target.value as Cobranca["juros_tipo"],
                          })
                        }
                        className="rounded-xl border p-3"
                      >
                        <option value="percentual_dia">% ao dia</option>
                        <option value="percentual_mes">% ao mês</option>
                        <option value="valor_dia">R$ ao dia</option>
                        <option value="valor_mes">R$ ao mês</option>
                      </select>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={cobranca.juros_valor}
                        onChange={(e) =>
                          setCobranca({
                            ...cobranca,
                            juros_valor: Number(e.target.value || 0),
                          })
                        }
                        className="w-full rounded-xl border p-3"
                      />
                    </div>
                  </label>

                  <label className="rounded-xl border p-4">
                    <span className="font-bold">Desconto</span>
                    <div className="mt-2 flex gap-2">
                      <select
                        value={cobranca.desconto_tipo}
                        onChange={(e) =>
                          setCobranca({
                            ...cobranca,
                            desconto_tipo:
                              e.target.value as Cobranca["desconto_tipo"],
                          })
                        }
                        className="rounded-xl border p-3"
                      >
                        <option value="percentual">%</option>
                        <option value="valor">R$</option>
                      </select>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={cobranca.desconto_valor}
                        onChange={(e) =>
                          setCobranca({
                            ...cobranca,
                            desconto_valor: Number(e.target.value || 0),
                          })
                        }
                        className="w-full rounded-xl border p-3"
                      />
                    </div>
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={salvandoConfig}
                    onClick={() => void salvarCobranca()}
                    className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-50"
                  >
                    <Save className="mr-2 inline h-4 w-4" />
                    {salvandoConfig ? "Salvando..." : "Salvar regras"}
                  </button>
                </div>
              </div>
            )}

            {edit && abaConfig === "mensalidades" && (
              <div className="mt-5 rounded-xl border bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-black">Editando configuração</h3>
                  <button
                    type="button"
                    onClick={() => setEdit(null)}
                    className="text-sm font-bold"
                  >
                    Cancelar
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();

                    void post({
                      acao: "config_editar",
                      id: edit.id,
                      ...novo,
                      valor: Number(novo.valor || 0),
                    }).then(() => setEdit(null));
                  }}
                  className="grid gap-3 md:grid-cols-2"
                >
                  <input
                    value={novo.nome}
                    onChange={(e) =>
                      setNovo({ ...novo, nome: e.target.value })
                    }
                    placeholder="Nome do tipo"
                    className="rounded-xl border p-3"
                  />

                  <input
                    value={novo.tipo_socio}
                    onChange={(e) =>
                      setNovo({ ...novo, tipo_socio: e.target.value })
                    }
                    placeholder="Código interno"
                    className="rounded-xl border p-3"
                  />

                  <input
                    type="number"
                    step="0.01"
                    value={novo.valor}
                    onChange={(e) =>
                      setNovo({ ...novo, valor: e.target.value })
                    }
                    placeholder="Valor"
                    className="rounded-xl border p-3"
                  />

                  <input
                    type="date"
                    value={novo.vigencia_inicio}
                    onChange={(e) =>
                      setNovo({
                        ...novo,
                        vigencia_inicio: e.target.value,
                      })
                    }
                    className="rounded-xl border p-3"
                  />

                  <button className="rounded-xl bg-[#005a3c] p-3 font-bold text-white md:col-span-2">
                    Salvar alterações
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
