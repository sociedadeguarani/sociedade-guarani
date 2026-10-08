/* app/temporadas/page.tsx */
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Umbrella,
  Users,
  X,
} from "lucide-react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Socio = {
  id: string;
  nome: string;
  cpf: string | null;
  matricula: string | null;
  responsavel_id: string | null;
  tipo_socio: string | null;
  ativo?: boolean | null;
  situacao?: string | null;
};

type Conta = {
  id: string;
  nome: string;
  banco: string | null;
  ativo: boolean;
};

type Parcela = {
  id: string;
  numero: number;
  descricao: string | null;
  valor: number;
  data_vencimento: string;
  forma_pagamento: string | null;
  situacao: string;
  data_pagamento: string | null;
  conta_bancaria_id: string | null;
  movimentacao_id: string | null;
  boleto_status: string | null;
  cheque_numero: string | null;
};

type Temporada = {
  id: string;
  socio_id: string;
  tipo: "temporada_individual" | "temporada_familiar";
  modalidade: "individual" | "familiar";
  codigo: string | null;
  matricula: string | null;
  inicio: string;
  fim: string;
  valor_total: number;
  situacao: string;
  forma_pagamento: string | null;
  conta_bancaria_id: string | null;
  data_contratacao: string;
  data_pagamento: string | null;
  observacoes: string | null;
  socio: Socio | null;
  parcelas: Parcela[];
  participantes: { socio_id: string; papel: string; matricula: string | null }[];
};

type ParcelaForm = {
  descricao: string;
  valor: string;
  data_vencimento: string;
  forma_pagamento: string;
  confirmar: boolean;
};

const hoje = new Date().toISOString().slice(0, 10);
const fimPadrao = `${new Date().getFullYear() + 1}-03-31`;

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBr(valor: string | null | undefined) {
  if (!valor) return "—";
  const [a, m, d] = valor.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : valor;
}

function formaLabel(valor: string | null | undefined) {
  const mapa: Record<string, string> = {
    pix: "PIX",
    dinheiro: "Dinheiro",
    cheque: "Cheque",
    boleto: "Boleto",
    debito_em_conta: "Débito em conta",
    transferencia: "Transferência",
    cartao: "Cartão",
  };
  return mapa[String(valor || "").toLowerCase()] || valor || "—";
}

function situacaoLabel(valor: string) {
  const mapa: Record<string, string> = {
    pendente: "Pendente",
    ativa: "Ativa",
    encerrada: "Encerrada",
    cancelada: "Cancelada",
    pago: "Pago",
    em_compensacao: "Em compensação",
    vencido: "Vencido",
    cancelado: "Cancelado",
  };
  return mapa[valor] || valor;
}

function badgeClass(valor: string) {
  if (valor === "ativa" || valor === "pago") return "bg-emerald-100 text-emerald-700";
  if (valor === "cancelada" || valor === "cancelado") return "bg-red-100 text-red-700";
  if (valor === "vencido") return "bg-red-100 text-red-700";
  if (valor === "em_compensacao") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function criarParcelas(
  total: number,
  plano: "avista" | "entrada_1" | "entrada_2",
  inicio: string,
  forma: string
): ParcelaForm[] {
  const base = new Date(`${inicio}T12:00:00`);
  const parcelas = plano === "avista" ? 1 : plano === "entrada_1" ? 2 : 3;
  const valorBase = Math.floor((total / parcelas) * 100) / 100;
  const primeira = total - valorBase * (parcelas - 1);

  return Array.from({ length: parcelas }, (_, i) => {
    const vencimento = new Date(base);
    vencimento.setMonth(vencimento.getMonth() + i);
    return {
      descricao: i === 0 ? "Entrada" : `Parcela ${i}`,
      valor: (i === 0 ? primeira : valorBase).toFixed(2),
      data_vencimento: vencimento.toISOString().slice(0, 10),
      forma_pagamento: forma,
      confirmar: i === 0,
    };
  });
}

export default function TemporadasPage() {
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [abrirCadastro, setAbrirCadastro] = useState(false);
  const [abrirPagamento, setAbrirPagamento] = useState<Parcela | null>(null);
  const [temporadaPagamento, setTemporadaPagamento] = useState<Temporada | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const [tipo, setTipo] = useState<"temporada_individual" | "temporada_familiar">(
    "temporada_familiar"
  );
  const [socioId, setSocioId] = useState("");
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(fimPadrao);
  const [valor, setValor] = useState("1100");
  const [plano, setPlano] = useState<"avista" | "entrada_1" | "entrada_2">("avista");
  const [formaPadrao, setFormaPadrao] = useState("pix");
  const [contaId, setContaId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([]);

  const [pagamentoData, setPagamentoData] = useState(hoje);
  const [pagamentoForma, setPagamentoForma] = useState("pix");
  const [pagamentoConta, setPagamentoConta] = useState("");
  const [chequeNumero, setChequeNumero] = useState("");

  async function token() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }

  async function carregar() {
    setCarregando(true);
    try {
      const accessToken = await token();
      if (!accessToken) {
        window.location.href = "/login";
        return;
      }

      const [rTemp, rSocios, rContas] = await Promise.all([
        fetch("/api/temporadas", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }),
        fetch("/api/socios", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }),
        fetch("/api/financeiro", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }),
      ]);

      const [jTemp, jSocios, jContas] = await Promise.all([
        rTemp.json().catch(() => ({})),
        rSocios.json().catch(() => ({})),
        rContas.json().catch(() => ({})),
      ]);

      if (!rTemp.ok) throw new Error(jTemp?.error || "Erro ao carregar temporadas.");
      if (!rSocios.ok) throw new Error(jSocios?.error || "Erro ao carregar sócios.");

      setTemporadas(Array.isArray(jTemp?.temporadas) ? jTemp.temporadas : []);
      setSocios(
        (Array.isArray(jSocios?.socios) ? jSocios.socios : []).map((s: any) => ({
          id: String(s.id),
          nome: s.nome || "",
          cpf: s.cpf || null,
          matricula: s.matricula == null ? null : String(s.matricula),
          responsavel_id: s.responsavel_id || null,
          tipo_socio: s.tipo_socio || null,
          ativo: String(s.situacao || "").toLowerCase() !== "inativo",
          situacao: s.situacao || null,
        }))
      );
      setContas(Array.isArray(jContas?.contas) ? jContas.contas : []);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao carregar temporadas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  useEffect(() => {
    const total = Number(valor || 0);
    setParcelas(criarParcelas(total, plano, inicio || hoje, formaPadrao));
  }, [valor, plano, inicio, formaPadrao]);

  useEffect(() => {
    if (tipo === "temporada_familiar") {
      setValor((atual) => (atual === "600" ? "1100" : atual || "1100"));
    } else {
      setValor((atual) => (atual === "1100" ? "600" : atual || "600"));
    }
  }, [tipo]);

  const sociosElegiveis = useMemo(
    () => socios.filter((s) => s.ativo !== false),
    [socios]
  );

  const participantesFamilia = useMemo(
    () => socios.filter((s) => s.responsavel_id === socioId && s.ativo !== false),
    [socios, socioId]
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return temporadas.filter((t) => {
      const nome = t.socio?.nome || "";
      const texto = `${nome} ${t.matricula || ""} ${t.codigo || ""}`.toLowerCase();
      const bateBusca = !termo || texto.includes(termo);
      const bateFiltro = filtro === "todas" || t.situacao === filtro;
      return bateBusca && bateFiltro;
    });
  }, [temporadas, busca, filtro]);

  function limparFormulario() {
    setTipo("temporada_familiar");
    setSocioId("");
    setInicio(hoje);
    setFim(fimPadrao);
    setValor("1100");
    setPlano("avista");
    setFormaPadrao("pix");
    setContaId("");
    setObservacoes("");
  }

  function editarParcela(index: number, campo: keyof ParcelaForm, valorCampo: string | boolean) {
    setParcelas((atual) =>
      atual.map((p, i) => (i === index ? { ...p, [campo]: valorCampo } : p))
    );
  }

  async function salvarTemporada() {
    if (!socioId) {
      setMensagem("Selecione o titular da temporada.");
      return;
    }
    if (!inicio || !fim || fim < inicio) {
      setMensagem("Informe um período válido.");
      return;
    }

    const total = Number(valor || 0);
    if (total <= 0) {
      setMensagem("Informe um valor de temporada maior que zero.");
      return;
    }

    if (!parcelas.length) {
      setMensagem("Configure pelo menos uma parcela.");
      return;
    }

    setSalvando(true);
    setMensagem("");

    try {
      const accessToken = await token();
      const resposta = await fetch("/api/temporadas", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acao: "criar",
          socio_id: socioId,
          tipo,
          inicio,
          fim,
          valor_total: total,
          conta_bancaria_id: contaId || null,
          observacoes: observacoes || null,
          parcelas: parcelas.map((p) => ({
            descricao: p.descricao,
            valor: Number(p.valor || 0),
            data_vencimento: p.data_vencimento,
            forma_pagamento: p.forma_pagamento,
            confirmar: p.confirmar,
            conta_bancaria_id: p.confirmar ? contaId || null : null,
          })),
        }),
      });

      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível cadastrar a temporada.");

      setMensagem(
        `Temporada cadastrada. ${resultado?.codigo ? `Matrícula ${resultado.codigo}.` : "A matrícula será gerada quando houver confirmação de pagamento."}`
      );
      setAbrirCadastro(false);
      limparFormulario();
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao cadastrar temporada.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirModalPagamento(t: Temporada, p: Parcela) {
    setTemporadaPagamento(t);
    setAbrirPagamento(p);
    setPagamentoData(hoje);
    setPagamentoForma(p.forma_pagamento || "pix");
    setPagamentoConta(p.conta_bancaria_id || contas[0]?.id || "");
    setChequeNumero(p.cheque_numero || "");
  }

  async function confirmarPagamento() {
    if (!temporadaPagamento || !abrirPagamento) return;

    if (pagamentoForma !== "cheque" && !pagamentoConta) {
      setMensagem("Selecione a conta que receberá o pagamento.");
      return;
    }

    setSalvando(true);
    setMensagem("");

    try {
      const accessToken = await token();
      const resposta = await fetch("/api/temporadas", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acao: "registrar_pagamento",
          temporada_id: temporadaPagamento.id,
          parcela_id: abrirPagamento.id,
          data_pagamento: pagamentoData,
          forma_pagamento: pagamentoForma,
          conta_bancaria_id: pagamentoForma === "cheque" ? null : pagamentoConta,
          cheque_numero: pagamentoForma === "cheque" ? chequeNumero || null : null,
        }),
      });

      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível registrar o pagamento.");

      setMensagem(
        resultado?.movimentacao_id
          ? "Pagamento confirmado e lançado no Financeiro."
          : "Pagamento registrado. A parcela ficará em compensação até a confirmação."
      );
      setAbrirPagamento(null);
      setTemporadaPagamento(null);
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao registrar pagamento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <header className="sticky top-0 z-40 flex h-[76px] items-center justify-between border-b border-[#dfe9e3] bg-white px-5 shadow-sm lg:px-8">
        <div className="flex items-center gap-3 pl-12 lg:pl-0">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ffead9] text-[#b65308]">
            <Umbrella className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#005a3c]">Temporadas</h1>
            <p className="text-xs font-medium text-[#718078]">Venda, pagamentos e validade</p>
          </div>
        </div>
        <button
          onClick={() => { limparFormulario(); setAbrirCadastro(true); }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#003d2b]"
        >
          <Plus className="h-4 w-4" />
          Nova temporada
        </button>
      </header>

      <div className="flex min-h-[calc(100vh-76px)]">
        <MenuLateralPadrao />

        <section className="min-w-0 flex-1 p-5 lg:ml-[220px] lg:p-8">
          {mensagem && (
            <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-[#cfe0d7] bg-white p-4 text-sm shadow-sm">
              <span>{mensagem}</span>
              <button onClick={() => setMensagem("")}><X className="h-4 w-4" /></button>
            </div>
          )}

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-[#7a8b84]">Temporadas</p>
              <p className="mt-1 text-3xl font-black text-[#005a3c]">{temporadas.length}</p>
            </div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-[#7a8b84]">Ativas</p>
              <p className="mt-1 text-3xl font-black text-emerald-600">
                {temporadas.filter((t) => t.situacao === "ativa").length}
              </p>
            </div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-[#7a8b84]">Valor contratado</p>
              <p className="mt-1 text-2xl font-black text-[#17382c]">
                {moeda(temporadas.reduce((s, t) => s + Number(t.valor_total || 0), 0))}
              </p>
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#dfe9e3] bg-white p-4 shadow-sm md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-[#91a099]" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, matrícula ou código TE..."
                className="w-full rounded-xl border border-[#d5e0da] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#005a3c]"
              />
            </div>
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="rounded-xl border border-[#d5e0da] px-3 py-2.5 text-sm font-semibold"
            >
              <option value="todas">Todas</option>
              <option value="pendente">Pendentes</option>
              <option value="ativa">Ativas</option>
              <option value="encerrada">Encerradas</option>
              <option value="cancelada">Canceladas</option>
            </select>
            <button
              onClick={() => void carregar()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d5e0da] px-4 py-2.5 text-sm font-bold hover:bg-[#f4f7f5]"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#dfe9e3] bg-white shadow-sm">
            {carregando ? (
              <div className="p-10 text-center text-sm text-[#718078]">Carregando temporadas...</div>
            ) : filtradas.length === 0 ? (
              <div className="p-10 text-center">
                <Umbrella className="mx-auto h-10 w-10 text-[#c7d6ce]" />
                <p className="mt-3 font-bold text-[#50625a]">Nenhuma temporada encontrada.</p>
                <p className="mt-1 text-sm text-[#82918a]">Cadastre a primeira venda pelo botão “Nova temporada”.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#edf2ef]">
                {filtradas.map((t) => {
                  const pagos = t.parcelas.filter((p) => p.situacao === "pago").reduce((s, p) => s + Number(p.valor), 0);
                  const pendentes = t.parcelas.filter((p) => p.situacao !== "pago" && p.situacao !== "cancelado");
                  return (
                    <div key={t.id} className="p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#ffead9] px-3 py-1 text-xs font-black text-[#b65308]">
                              {t.tipo === "temporada_familiar" ? "Familiar" : "Individual"}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${badgeClass(t.situacao)}`}>
                              {situacaoLabel(t.situacao)}
                            </span>
                            {t.matricula && (
                              <span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs font-black text-[#005a3c]">
                                {t.matricula}
                              </span>
                            )}
                          </div>
                          <h2 className="mt-2 text-lg font-black">{t.socio?.nome || "Titular não encontrado"}</h2>
                          <div className="mt-2 grid gap-2 text-sm text-[#68776f] sm:grid-cols-3">
                            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {dataBr(t.inicio)} → {dataBr(t.fim)}</span>
                            <span className="inline-flex items-center gap-1.5"><DollarSign className="h-4 w-4" /> {moeda(t.valor_total)}</span>
                            <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> {t.participantes?.length || 1} participante(s)</span>
                          </div>
                        </div>

                        <div className="min-w-[240px] rounded-2xl bg-[#f6f9f7] p-4">
                          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-[#7b8a83]">
                            <span>Financeiro</span>
                            <span>{t.parcelas.length} parcela(s)</span>
                          </div>
                          <p className="mt-1 text-lg font-black text-[#005a3c]">
                            {moeda(pagos)} <span className="text-xs font-semibold text-[#82918a]">de {moeda(t.valor_total)}</span>
                          </p>
                          {pendentes.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {pendentes.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => abrirModalPagamento(t, p)}
                                  className="flex w-full items-center justify-between rounded-xl border border-[#d8e5dd] bg-white px-3 py-2 text-left text-xs hover:border-[#005a3c]"
                                >
                                  <span>
                                    <b>{p.descricao || `Parcela ${p.numero}`}</b>
                                    <span className="ml-2 text-[#7b8a83]">{dataBr(p.data_vencimento)}</span>
                                  </span>
                                  <span className="font-black">{moeda(p.valor)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#edf2ef] pt-4 text-xs text-[#68776f]">
                        <span className="rounded-lg bg-[#f6f9f7] px-3 py-2">Contratação: {dataBr(t.data_contratacao)}</span>
                        <span className="rounded-lg bg-[#f6f9f7] px-3 py-2">Pagamento: {formaLabel(t.forma_pagamento)}</span>
                        {t.codigo && <span className="rounded-lg bg-[#f6f9f7] px-3 py-2">Código: {t.codigo}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {abrirCadastro && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto my-6 w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e5ece8] p-5">
              <div>
                <h2 className="text-xl font-black text-[#005a3c]">Nova temporada</h2>
                <p className="text-sm text-[#718078]">A temporada não gera mensalidade.</p>
              </div>
              <button onClick={() => setAbrirCadastro(false)} className="rounded-xl p-2 hover:bg-[#f4f7f5]"><X /></button>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Titular</span>
                <select value={socioId} onChange={(e) => setSocioId(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3">
                  <option value="">Selecione...</option>
                  {sociosElegiveis.map((s) => (
                    <option key={s.id} value={s.id}>{s.nome} {s.matricula ? `— ${s.matricula}` : ""}</option>
                  ))}
                </select>
              </label>

              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Tipo</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTipo("temporada_familiar")} className={`rounded-xl border p-3 text-sm font-bold ${tipo === "temporada_familiar" ? "border-[#b65308] bg-[#ffead9] text-[#b65308]" : "border-[#d5e0da]"}`}>Familiar<br /><span className="text-xs">R$ 1.100 padrão</span></button>
                  <button type="button" onClick={() => setTipo("temporada_individual")} className={`rounded-xl border p-3 text-sm font-bold ${tipo === "temporada_individual" ? "border-[#b65308] bg-[#ffead9] text-[#b65308]" : "border-[#d5e0da]"}`}>Individual<br /><span className="text-xs">R$ 600 padrão</span></button>
                </div>
              </div>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Valor total</span>
                <input value={valor} onChange={(e) => setValor(e.target.value.replace(",", "."))} inputMode="decimal" className="w-full rounded-xl border border-[#d5e0da] px-3 py-3 text-lg font-black" />
                <span className="mt-1 block text-xs text-[#82918a]">Editável em cada venda.</span>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Início</span>
                <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Fim</span>
                <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Plano de pagamento</span>
                <select value={plano} onChange={(e) => setPlano(e.target.value as any)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3">
                  <option value="avista">À vista</option>
                  <option value="entrada_1">Entrada + 1 parcela</option>
                  <option value="entrada_2">Entrada + 2 parcelas</option>
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Forma padrão</span>
                <select value={formaPadrao} onChange={(e) => setFormaPadrao(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3">
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="boleto">Boleto</option>
                  <option value="cheque">Cheque</option>
                  <option value="debito_em_conta">Débito em conta</option>
                  <option value="transferencia">Transferência</option>
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Conta de recebimento</span>
                <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3">
                  <option value="">Selecione se houver recebimento confirmado</option>
                  {contas.filter((c) => c.ativo !== false).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-[#718078]">Parcelas</span>
                  <span className="text-xs font-bold text-[#005a3c]">{moeda(Number(valor || 0))}</span>
                </div>
                <div className="space-y-3">
                  {parcelas.map((p, i) => (
                    <div key={i} className="grid gap-3 rounded-2xl border border-[#dfe9e3] bg-[#f9fbfa] p-3 md:grid-cols-[1.2fr_.8fr_1fr_1fr_auto]">
                      <input value={p.descricao} onChange={(e) => editarParcela(i, "descricao", e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
                      <input value={p.valor} onChange={(e) => editarParcela(i, "valor", e.target.value.replace(",", "."))} inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm font-bold" />
                      <input type="date" value={p.data_vencimento} onChange={(e) => editarParcela(i, "data_vencimento", e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
                      <select value={p.forma_pagamento} onChange={(e) => editarParcela(i, "forma_pagamento", e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                        <option value="pix">PIX</option>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="boleto">Boleto</option>
                        <option value="cheque">Cheque</option>
                        <option value="debito_em_conta">Débito</option>
                        <option value="transferencia">Transferência</option>
                      </select>
                      <label className="flex items-center gap-2 text-xs font-bold text-[#50625a]">
                        <input type="checkbox" checked={p.confirmar} onChange={(e) => editarParcela(i, "confirmar", e.target.checked)} />
                        Recebida
                      </label>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#82918a]">
                  “Recebida” cria a Entrada no Financeiro. Cheque fica em compensação e não aumenta o saldo até a baixa.
                </p>
              </div>

              {tipo === "temporada_familiar" && (
                <div className="md:col-span-2 rounded-2xl border border-[#f2bb91] bg-[#fff8f2] p-4">
                  <div className="flex items-center gap-2 font-bold text-[#b65308]"><Users className="h-4 w-4" /> Dependentes encontrados</div>
                  <p className="mt-1 text-xs text-[#7b6b60]">
                    Os familiares que já possuem registro em Sócios serão vinculados à temporada. O módulo de carteirinhas será integrado na próxima etapa para gerar os cartões da família.
                  </p>
                  {participantesFamilia.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {participantesFamilia.map((p) => <span key={p.id} className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{p.nome}{p.matricula ? ` — ${p.matricula}` : ""}</span>)}
                    </div>
                  )}
                </div>
              )}

              <label className="md:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Observações</span>
                <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#e5ece8] p-5">
              <button onClick={() => setAbrirCadastro(false)} className="rounded-xl border border-[#d5e0da] px-5 py-2.5 font-bold">Cancelar</button>
              <button disabled={salvando} onClick={() => void salvarTemporada()} className="rounded-xl bg-[#005a3c] px-5 py-2.5 font-bold text-white disabled:opacity-50">
                {salvando ? "Salvando..." : "Cadastrar temporada"}
              </button>
            </div>
          </div>
        </div>
      )}

      {abrirPagamento && temporadaPagamento && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-black text-[#005a3c]">Confirmar pagamento</h2>
                <p className="text-sm text-[#718078]">{temporadaPagamento.socio?.nome} · {abrirPagamento.descricao}</p>
              </div>
              <button onClick={() => setAbrirPagamento(null)}><X /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-2xl bg-[#f6f9f7] p-4">
                <p className="text-xs font-bold uppercase text-[#7b8a83]">Valor</p>
                <p className="text-2xl font-black text-[#005a3c]">{moeda(abrirPagamento.valor)}</p>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Data do pagamento</span>
                <input type="date" value={pagamentoData} onChange={(e) => setPagamentoData(e.target.value)} className="w-full rounded-xl border px-3 py-3" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Forma</span>
                <select value={pagamentoForma} onChange={(e) => setPagamentoForma(e.target.value)} className="w-full rounded-xl border px-3 py-3">
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="boleto">Boleto</option>
                  <option value="cheque">Cheque</option>
                  <option value="debito_em_conta">Débito em conta</option>
                  <option value="transferencia">Transferência</option>
                </select>
              </label>
              {pagamentoForma !== "cheque" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Conta de recebimento</span>
                  <select value={pagamentoConta} onChange={(e) => setPagamentoConta(e.target.value)} className="w-full rounded-xl border px-3 py-3">
                    <option value="">Selecione...</option>
                    {contas.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</option>)}
                  </select>
                </label>
              )}
              {pagamentoForma === "cheque" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Número do cheque</span>
                  <input value={chequeNumero} onChange={(e) => setChequeNumero(e.target.value)} className="w-full rounded-xl border px-3 py-3" />
                </label>
              )}
              <div className="rounded-xl bg-[#fff8f2] p-3 text-xs text-[#7b6b60]">
                PIX/dinheiro/transferência/boleto confirmado gera uma <b>Entrada</b> vinculada à parcela. Cheque fica como <b>em compensação</b>.
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t p-5">
              <button onClick={() => setAbrirPagamento(null)} className="rounded-xl border px-5 py-2.5 font-bold">Cancelar</button>
              <button disabled={salvando} onClick={() => void confirmarPagamento()} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-5 py-2.5 font-bold text-white disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" />
                {salvando ? "Registrando..." : "Confirmar pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
