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
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<M[]>([]);
  const [configs, setConfigs] = useState<C[]>([]);
  const [tarifas, setTarifas] = useState<T[]>([]);
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

  const [previa, setPrevia] = useState<PreviaGeracao | null>(null);
  const [abrindoPrevia, setAbrindoPrevia] = useState(false);
  const [confirmandoGeracao, setConfirmandoGeracao] = useState(false);

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
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    }
  }

  useEffect(() => {
    void carregar();
  }, [ano, mes]);

  const filtrada = useMemo(() => {
    const q = busca.toLowerCase().trim();

    return lista.filter(
      (x) =>
        !q ||
        `${x.socio?.nome || ""} ${x.socio?.matricula || ""}`
          .toLowerCase()
          .includes(q)
    );
  }, [lista, busca]);

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

  async function previsualizarGeracao() {
    setErro("");
    setMsg("");
    setAbrindoPrevia(true);

    try {
      const r = await fetch("/api/mensalidades/admin", {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({
          acao: "previsualizar",
          ano,
          mes,
        }),
      });

      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Não foi possível gerar a prévia.");

      setPrevia(d);
    } catch (e) {
      setAbrindoPrevia(false);
      setPrevia(null);
      setErro(e instanceof Error ? e.message : "Erro ao gerar prévia.");
    }
  }

  async function confirmarGeracao() {
    if (!previa || previa.quantidade_nova <= 0) return;

    setConfirmandoGeracao(true);
    setErro("");
    setMsg("");

    try {
      const r = await fetch("/api/mensalidades/admin", {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({
          acao: "gerar",
          ano,
          mes,
        }),
      });

      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Não foi possível gerar a competência.");

      setAbrindoPrevia(false);
      setPrevia(null);
      setMsg(d.message || `${d.criadas || previa.quantidade_nova} mensalidade(s) gerada(s) com sucesso.`);
      setSel([]);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar competência.");
    } finally {
      setConfirmandoGeracao(false);
    }
  }

  function fecharPrevia() {
    if (confirmandoGeracao) return;
    setAbrindoPrevia(false);
    setPrevia(null);
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
                value={ano}
                onChange={(e) => setAno(+e.target.value)}
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
                value={mes}
                onChange={(e) => setMes(+e.target.value)}
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
                          {x.socio?.nome || "—"}
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

      {abrindoPrevia && previa && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-[#005a3c]">
                  Prévia da geração — {String(mes).padStart(2, "0")}/{ano}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Confira os valores antes de criar os lançamentos.
                </p>
              </div>
              <button
                type="button"
                onClick={fecharPrevia}
                disabled={confirmandoGeracao}
                className="rounded-full p-2 hover:bg-gray-100 disabled:opacity-40"
              >
                <X />
              </button>
            </div>

            <div className="mt-5 rounded-xl bg-[#eef7f2] p-4">
              <div className="text-xs font-semibold uppercase text-gray-500">
                Competência
              </div>
              <div className="mt-1 text-2xl font-black text-[#005a3c]">
                {String(mes).padStart(2, "0")}/{ano}
              </div>
              <p className="mt-1 text-sm text-gray-600">
                Nenhum lançamento será criado até você confirmar.
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-4">
                <div className="text-sm text-gray-500">Pagadores encontrados</div>
                <div className="mt-1 text-2xl font-black">{previa.total_cobraveis}</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-sm text-gray-500">Novos lançamentos</div>
                <div className="mt-1 text-2xl font-black text-[#005a3c]">{previa.quantidade_nova}</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-sm text-gray-500">Já existentes</div>
                <div className="mt-1 text-2xl font-black">{previa.ja_existentes}</div>
              </div>
              <div className="rounded-xl border p-4">
                <div className="text-sm text-gray-500">Mensalidades base</div>
                <div className="mt-1 text-xl font-black text-[#005a3c]">{moeda(previa.valor_base)}</div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border p-4">
              <h3 className="font-black text-[#005a3c]">Composição da cobrança</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4"><span>Mensalidades</span><b>{moeda(previa.valor_base)}</b></div>
                <div className="flex justify-between gap-4"><span>Tarifas bancárias</span><b>{moeda(previa.tarifa_pagamento)}</b></div>
                <div className="flex justify-between gap-4"><span>Multa</span><b>{moeda(previa.multa)}</b></div>
                <div className="flex justify-between gap-4"><span>Juros</span><b>{moeda(previa.juros)}</b></div>
                <div className="flex justify-between gap-4"><span>Desconto</span><b>- {moeda(previa.desconto)}</b></div>
                <div className="border-t pt-3 text-base flex justify-between gap-4">
                  <span className="font-black">Total a cobrar</span>
                  <b className="text-[#005a3c]">{moeda(previa.total_cobrado)}</b>
                </div>
              </div>
            </div>

            {previa.quantidade_nova === 0 ? (
              <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm font-semibold text-gray-700">
                Não há novos lançamentos para esta competência.
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
                Atenção: esta é somente uma prévia. As mensalidades só serão gravadas depois da confirmação.
              </div>
            )}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={fecharPrevia}
                disabled={confirmandoGeracao}
                className="rounded-xl border px-5 py-3 font-bold disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarGeracao()}
                disabled={confirmandoGeracao || previa.quantidade_nova === 0}
                className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                {confirmandoGeracao ? "Gerando..." : "✓ Confirmar geração"}
              </button>
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
