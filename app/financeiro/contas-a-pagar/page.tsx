"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  FileText,
  Plus,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";

type ContaBancaria = {
  id: string;
  nome: string;
  banco: string | null;
  ativo: boolean;
};

type Obrigacao = {
  id: string;
  descricao: string;
  fornecedor: string | null;
  categoria: string;
  valor_parcela: number;
  valor_total: number;
  quantidade_parcelas: number;
  periodicidade: string;
  data_primeiro_vencimento: string;
  conta_bancaria_preferencial_id: string | null;
  forma_pagamento_preferencial: string | null;
  observacoes: string | null;
  status: "ativa" | "quitada" | "cancelada";
  created_by_nome: string;
  created_at: string;
};

type Parcela = {
  id: string;
  conta_pagar_id: string;
  numero_parcela: number;
  quantidade_parcelas: number;
  data_vencimento: string;
  valor: number;
  status: "pendente" | "paga" | "cancelada";
  data_pagamento: string | null;
  conta_bancaria_id: string | null;
  forma_pagamento: string | null;
  movimentacao_id: string | null;
  comprovante_url: string | null;
  observacoes_pagamento: string | null;
  paid_by_nome: string | null;
};

type FiltroStatus = "todos" | "pendentes" | "vencidas" | "pagas";
type Periodicidade = "unica" | "semanal" | "quinzenal" | "mensal" | "trimestral" | "semestral" | "anual";

const PERIODICIDADES: Array<{ value: Periodicidade; label: string }> = [
  { value: "unica", label: "Única" },
  { value: "semanal", label: "Semanal" },
  { value: "quinzenal", label: "Quinzenal" },
  { value: "mensal", label: "Mensal" },
  { value: "trimestral", label: "A cada 3 meses" },
  { value: "semestral", label: "A cada 6 meses" },
  { value: "anual", label: "Anual" },
];

const CATEGORIAS = [
  "Financiamento",
  "Energia elétrica",
  "Água",
  "Internet e telefone",
  "Manutenção",
  "Serviços",
  "Materiais e compras",
  "Seguros",
  "Impostos e taxas",
  "Outros",
];

const FORMAS = [
  ["pix", "PIX"],
  ["debito_em_conta", "Débito em conta"],
  ["boleto", "Boleto"],
  ["dinheiro", "Dinheiro"],
  ["transferencia", "Transferência"],
  ["cheque", "Cheque"],
  ["outro", "Outro"],
] as const;

function hojeBrasil() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function formatarMoeda(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(value: string | null | undefined) {
  if (!value) return "—";
  const [ano, mes, dia] = value.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : value;
}

function periodicidadeLabel(value: string) {
  return PERIODICIDADES.find((item) => item.value === value)?.label || value;
}

function nomeForma(value: string | null) {
  return FORMAS.find(([id]) => id === value)?.[1] || "Não definida";
}

function classesStatus(status: string, vencimento: string, hoje: string) {
  if (status === "paga") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelada") return "bg-gray-100 text-gray-600";
  if (vencimento < hoje) return "bg-red-100 text-red-700";
  if (vencimento <= hoje) return "bg-amber-100 text-amber-800";
  return "bg-blue-50 text-blue-800";
}

function rotuloStatus(parcela: Parcela, hoje: string) {
  if (parcela.status === "paga") return "Paga";
  if (parcela.status === "cancelada") return "Cancelada";
  if (parcela.data_vencimento < hoje) return "Vencida";
  if (parcela.data_vencimento === hoje) return "Vence hoje";
  return "Pendente";
}

function Modal({ titulo, fechar, children, largura = "max-w-3xl" }: { titulo: string; fechar: () => void; children: ReactNode; largura?: string }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#001f16]/60 p-3 backdrop-blur-sm sm:p-5">
      <div className={`max-h-[94vh] w-full ${largura} overflow-y-auto rounded-3xl bg-white shadow-2xl`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e2ebe6] bg-white px-5 py-4 sm:px-7">
          <h2 className="text-xl font-extrabold text-[#005a3c]">{titulo}</h2>
          <button type="button" onClick={fechar} className="rounded-full bg-gray-100 p-2 text-gray-600 hover:bg-gray-200" aria-label="Fechar"><X size={19} /></button>
        </div>
        <div className="p-5 sm:p-7">{children}</div>
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, type = "text", required = false, min, max, step, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; min?: string; max?: string; step?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-gray-700">{label}{required ? " *" : ""}</span>
      <input type={type} value={value} required={required} min={min} max={max} step={step} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3.5 py-3 text-sm text-[#173d2e] outline-none transition focus:border-[#16845b] focus:ring-2 focus:ring-[#16845b]/10" />
    </label>
  );
}

export default function ContasAPagarPage() {
  const router = useRouter();
  const hoje = hojeBrasil();
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([]);
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [contas, setContas] = useState<ContaBancaria[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroStatus>("todos");
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [obrigacaoPagando, setObrigacaoPagando] = useState<Obrigacao | null>(null);
  const [parcelaPagando, setParcelaPagando] = useState<Parcela | null>(null);

  const [descricao, setDescricao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [categoria, setCategoria] = useState("Financiamento");
  const [valorParcela, setValorParcela] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("unica");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(hoje);
  const [contaPreferencial, setContaPreferencial] = useState("");
  const [formaPreferencial, setFormaPreferencial] = useState("boleto");
  const [observacoes, setObservacoes] = useState("");

  const [contaPagamento, setContaPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [formaPagamento, setFormaPagamento] = useState("boleto");
  const [arquivoPagamento, setArquivoPagamento] = useState<File | null>(null);
  const [observacoesPagamento, setObservacoesPagamento] = useState("");

  const api = useCallback(async (init: RequestInit = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente no sistema.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch("/api/financeiro/contas-a-pagar", { ...init, headers, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "Não foi possível concluir a operação.");
    return result;
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const result = await api({ method: "GET" });
      setObrigacoes((result.obrigacoes || []) as Obrigacao[]);
      setParcelas((result.parcelas || []) as Parcela[]);
      setContas((result.contas || []) as ContaBancaria[]);
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Não foi possível carregar as contas a pagar.");
    } finally {
      setCarregando(false);
    }
  }, [api]);

  useEffect(() => {
    let ativo = true;
    // Agenda a carga inicial depois do commit para não disparar setState
    // sincronamente dentro do efeito.
    void Promise.resolve().then(() => {
      if (ativo) void carregar();
    });
    return () => { ativo = false; };
  }, [carregar]);

  const parcelasPorObrigacao = useMemo(() => {
    const mapa = new Map<string, Parcela[]>();
    for (const parcela of parcelas) {
      const lista = mapa.get(parcela.conta_pagar_id) || [];
      lista.push(parcela);
      mapa.set(parcela.conta_pagar_id, lista);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.numero_parcela - b.numero_parcela);
    return mapa;
  }, [parcelas]);

  const todasParcelasPendentes = parcelas.filter((item) => item.status === "pendente");
  const totalPendente = todasParcelasPendentes.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const totalVencido = todasParcelasPendentes.filter((item) => item.data_vencimento < hoje).reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const limite30Dias = new Date(`${hoje}T12:00:00`);
  limite30Dias.setDate(limite30Dias.getDate() + 30);
  const limite30 = `${limite30Dias.getFullYear()}-${String(limite30Dias.getMonth() + 1).padStart(2, "0")}-${String(limite30Dias.getDate()).padStart(2, "0")}`;
  const totalProximos30 = todasParcelasPendentes.filter((item) => item.data_vencimento >= hoje && item.data_vencimento <= limite30).reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const mesAtual = hoje.slice(0, 7);
  const totalPagoMes = parcelas.filter((item) => item.status === "paga" && String(item.data_pagamento || "").startsWith(mesAtual)).reduce((sum, item) => sum + Number(item.valor || 0), 0);

  const obrigacoesFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return obrigacoes.filter((item) => {
      const lista = parcelasPorObrigacao.get(item.id) || [];
      const buscaOk = !termo || `${item.descricao} ${item.fornecedor || ""} ${item.categoria}`.toLocaleLowerCase("pt-BR").includes(termo);
      if (!buscaOk) return false;
      if (filtro === "todos") return true;
      if (filtro === "pagas") return lista.length > 0 && lista.every((parcela) => parcela.status === "paga");
      if (filtro === "vencidas") return lista.some((parcela) => parcela.status === "pendente" && parcela.data_vencimento < hoje);
      return lista.some((parcela) => parcela.status === "pendente");
    });
  }, [obrigacoes, parcelasPorObrigacao, busca, filtro, hoje]);

  const valorParcelaNumber = Number(String(valorParcela || "0").replace(",", "."));
  const quantidadeNumber = Math.max(1, Number(quantidade || 1));
  const totalPrevisto = Number.isFinite(valorParcelaNumber) ? valorParcelaNumber * quantidadeNumber : 0;

  function limparCadastro() {
    setDescricao(""); setFornecedor(""); setCategoria("Financiamento"); setValorParcela("");
    setQuantidade("1"); setPeriodicidade("unica"); setPrimeiroVencimento(hoje);
    setContaPreferencial(""); setFormaPreferencial("boleto"); setObservacoes("");
  }

  async function criarObrigacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (salvando) return;
    const valor = Number(String(valorParcela || "0").replace(",", "."));
    const qtd = Number(quantidade);
    if (!descricao.trim() || !Number.isFinite(valor) || valor <= 0 || !Number.isInteger(qtd) || qtd < 1 || qtd > 360) {
      setMensagem("Informe descrição, valor e quantidade de parcelas válidos.");
      return;
    }
    if (periodicidade === "unica" && qtd !== 1) {
      setMensagem("Para uma conta única, selecione apenas uma parcela.");
      return;
    }
    setSalvando(true);
    setMensagem("");
    try {
      await api({
        method: "POST",
        body: JSON.stringify({
          acao: "criar_obrigacao",
          descricao: descricao.trim(), fornecedor: fornecedor.trim(), categoria,
          valor_parcela: valor, quantidade_parcelas: qtd, periodicidade,
          data_primeiro_vencimento: primeiroVencimento,
          conta_bancaria_preferencial_id: contaPreferencial || null,
          forma_pagamento_preferencial: formaPreferencial || null,
          observacoes: observacoes.trim() || null,
        }),
      });
      setMostrarCadastro(false);
      limparCadastro();
      await carregar();
      setMensagem("Conta a pagar cadastrada e parcelas programadas com sucesso.");
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Não foi possível cadastrar a obrigação.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirBaixa(obrigacao: Obrigacao, parcela: Parcela) {
    setObrigacaoPagando(obrigacao);
    setParcelaPagando(parcela);
    setContaPagamento(obrigacao.conta_bancaria_preferencial_id || contas[0]?.id || "");
    setDataPagamento(hoje);
    setFormaPagamento(obrigacao.forma_pagamento_preferencial || parcela.forma_pagamento || "boleto");
    setArquivoPagamento(null);
    setObservacoesPagamento("");
  }

  async function confirmarPagamento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (salvando || !parcelaPagando || !contaPagamento) return;
    setSalvando(true);
    setMensagem("");
    try {
      const form = new FormData();
      form.set("acao", "baixar_parcela");
      form.set("parcela_id", parcelaPagando.id);
      form.set("conta_bancaria_id", contaPagamento);
      form.set("data_pagamento", dataPagamento);
      form.set("forma_pagamento", formaPagamento);
      form.set("observacoes", observacoesPagamento);
      if (arquivoPagamento) form.set("arquivo", arquivoPagamento);
      await api({ method: "POST", body: form });
      setParcelaPagando(null);
      setObrigacaoPagando(null);
      await carregar();
      setMensagem("Pagamento registrado. A saída foi lançada no Financeiro e vinculada à parcela.");
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Não foi possível registrar o pagamento.");
    } finally {
      setSalvando(false);
    }
  }

  async function abrirComprovante(path: string | null) {
    if (!path) return;
    if (/^https?:\/\//i.test(path)) {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }
    const { data, error } = await supabase.storage.from("comprovantes-financeiro").createSignedUrl(path, 10 * 60);
    if (error || !data?.signedUrl) {
      setMensagem("Não foi possível abrir o comprovante desta parcela.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">
      <CabecalhoPadrao />
      <div className="min-h-[calc(100vh-80px)]">
        <MenuLateralPadrao />
        <section className="min-w-0 bg-[#f8faf9] p-4 sm:p-6 lg:ml-[220px] lg:p-8">
          <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div>
              <button onClick={() => router.push("/financeiro")} className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#527264] hover:text-[#005a3c]"><ArrowLeft size={16} /> Voltar ao Financeiro</button>
              <p className="text-sm font-medium text-gray-500">Financeiro · Planejamento</p>
              <h1 className="mt-1 text-3xl font-extrabold text-[#005a3c]">Contas a Pagar</h1>
              <p className="mt-1 max-w-3xl text-sm text-gray-500">Cadastre compromissos, programe parcelas e registre o pagamento quando ele realmente acontecer.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void carregar()} disabled={carregando} className="rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] disabled:opacity-50">{carregando ? "Atualizando..." : "↻ Atualizar"}</button>
              <button onClick={() => { limparCadastro(); setMostrarCadastro(true); }} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#00452f]"><Plus size={17} /> Nova conta a pagar</button>
            </div>
          </div>

          {mensagem && <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-[#cfe3d8] bg-[#eef7f2] px-4 py-3 text-sm font-semibold text-[#005a3c]"><span>{mensagem}</span><button onClick={() => setMensagem("")} aria-label="Fechar aviso"><X size={16}/></button></div>}

          <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-[#d9e8df] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">Total em aberto</p><Wallet className="text-[#0b7650]" size={20}/></div><p className="mt-2 text-2xl font-extrabold text-[#005a3c]">{formatarMoeda(totalPendente)}</p><p className="mt-1 text-xs text-gray-500">Parcelas ainda não pagas</p></div>
            <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">Em atraso</p><AlertTriangle className="text-red-600" size={20}/></div><p className="mt-2 text-2xl font-extrabold text-red-700">{formatarMoeda(totalVencido)}</p><p className="mt-1 text-xs text-gray-500">Vencimento anterior a hoje</p></div>
            <div className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">Próximos 30 dias</p><CalendarClock className="text-amber-600" size={20}/></div><p className="mt-2 text-2xl font-extrabold text-amber-700">{formatarMoeda(totalProximos30)}</p><p className="mt-1 text-xs text-gray-500">Compromissos com vencimento próximo</p></div>
            <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">Pago neste mês</p><CheckCircle2 className="text-emerald-600" size={20}/></div><p className="mt-2 text-2xl font-extrabold text-emerald-700">{formatarMoeda(totalPagoMes)}</p><p className="mt-1 text-xs text-gray-500">Baixas registradas neste mês</p></div>
          </div>

          <div className="mb-5 rounded-2xl border border-[#dfe9e3] bg-white p-4 shadow-sm">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
              <label className="relative block"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/><input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar por descrição, fornecedor ou categoria..." className="w-full rounded-xl border border-[#d5e0da] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#16845b]"/></label>
              <select value={filtro} onChange={(event) => setFiltro(event.target.value as FiltroStatus)} className="rounded-xl border border-[#d5e0da] bg-white px-3 py-3 text-sm"><option value="todos">Todas as obrigações</option><option value="pendentes">Com parcelas em aberto</option><option value="vencidas">Com parcelas vencidas</option><option value="pagas">Quitadas</option></select>
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold text-[#174b38]">Obrigações cadastradas</h2><span className="text-xs text-gray-500">{obrigacoesFiltradas.length} registro(s)</span></div>

          {carregando ? (
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-10 text-center text-sm font-semibold text-gray-500">Carregando contas a pagar...</div>
          ) : obrigacoesFiltradas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#b9d2c4] bg-white px-5 py-12 text-center"><CircleDollarSign className="mx-auto mb-3 text-[#6b9b83]" size={36}/><h3 className="text-lg font-bold text-[#174b38]">Nenhuma conta a pagar encontrada</h3><p className="mt-1 text-sm text-gray-500">Cadastre um financiamento, fornecedor ou compromisso futuro para começar.</p><button onClick={() => setMostrarCadastro(true)} className="mt-5 rounded-xl bg-[#005a3c] px-5 py-3 text-sm font-bold text-white">Cadastrar primeira conta</button></div>
          ) : (
            <div className="space-y-3">
              {obrigacoesFiltradas.map((obrigacao) => {
                const lista = parcelasPorObrigacao.get(obrigacao.id) || [];
                const pagas = lista.filter((item) => item.status === "paga").length;
                const abertas = lista.filter((item) => item.status === "pendente");
                const vencidas = abertas.filter((item) => item.data_vencimento < hoje).length;
                const proxima = abertas[0];
                const expandido = expandidoId === obrigacao.id;
                const percentual = lista.length ? Math.round((pagas / lista.length) * 100) : 0;
                return (
                  <article key={obrigacao.id} className="overflow-hidden rounded-2xl border border-[#dfe9e3] bg-white shadow-sm">
                    <button type="button" onClick={() => setExpandidoId(expandido ? null : obrigacao.id)} className="flex w-full flex-col gap-4 p-4 text-left sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#eaf5ef] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#08714b]">{obrigacao.categoria}</span>{obrigacao.status === "quitada" ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">Quitada</span> : obrigacao.status === "cancelada" ? <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-600">Cancelada</span> : vencidas > 0 ? <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">{vencidas} vencida(s)</span> : <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800">Em andamento</span>}</div>
                        <h3 className="mt-2 truncate text-lg font-extrabold text-[#174b38]">{obrigacao.descricao}</h3>
                        <p className="mt-0.5 text-sm text-gray-500">{obrigacao.fornecedor || "Fornecedor não informado"} · {periodicidadeLabel(obrigacao.periodicidade)}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:min-w-[540px]">
                        <div><p className="text-[11px] font-semibold uppercase text-gray-400">Parcela</p><p className="mt-1 font-bold text-[#174b38]">{formatarMoeda(obrigacao.valor_parcela)}</p></div>
                        <div><p className="text-[11px] font-semibold uppercase text-gray-400">Valor contratado</p><p className="mt-1 font-bold text-[#174b38]">{formatarMoeda(obrigacao.valor_total)}</p></div>
                        <div><p className="text-[11px] font-semibold uppercase text-gray-400">Parcelas</p><p className="mt-1 font-bold text-[#174b38]">{pagas}/{obrigacao.quantidade_parcelas} pagas</p></div>
                        <div><p className="text-[11px] font-semibold uppercase text-gray-400">Próximo vencimento</p><p className="mt-1 font-bold text-[#174b38]">{proxima ? formatarData(proxima.data_vencimento) : "Concluído"}</p></div>
                      </div>
                      <div className="flex items-center justify-between gap-3 xl:w-36 xl:justify-end"><div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 xl:max-w-24"><div className="h-full rounded-full bg-[#0b8b5b]" style={{ width: `${percentual}%` }}/></div>{expandido ? <ChevronUp size={20} className="shrink-0 text-gray-400"/> : <ChevronDown size={20} className="shrink-0 text-gray-400"/>}</div>
                    </button>
                    {expandido && (
                      <div className="border-t border-[#e6eee9] bg-[#fbfdfc] p-3 sm:p-5">
                        {obrigacao.observacoes && <p className="mb-3 rounded-lg bg-white p-3 text-sm text-gray-600">{obrigacao.observacoes}</p>}
                        <div className="overflow-x-auto rounded-xl border border-[#e1ebe5] bg-white">
                          <table className="w-full min-w-[850px] text-sm">
                            <thead className="bg-[#edf5f0] text-left text-[11px] uppercase tracking-wide text-[#557466]"><tr><th className="px-4 py-3">Parcela</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Pagamento / Conta</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
                            <tbody className="divide-y divide-[#edf2ef]">
                              {lista.map((parcela) => {
                                const contaBaixa = contas.find((item) => item.id === parcela.conta_bancaria_id);
                                return <tr key={parcela.id}>
                                  <td className="px-4 py-3 font-semibold text-gray-700">{parcela.numero_parcela}/{parcela.quantidade_parcelas}</td>
                                  <td className="px-4 py-3 text-gray-700">{formatarData(parcela.data_vencimento)}</td>
                                  <td className="px-4 py-3 font-bold text-[#174b38]">{formatarMoeda(parcela.valor)}</td>
                                  <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${classesStatus(parcela.status, parcela.data_vencimento, hoje)}`}>{rotuloStatus(parcela, hoje)}</span></td>
                                  <td className="px-4 py-3 text-gray-600">{parcela.status === "paga" ? <><span className="font-semibold">{formatarData(parcela.data_pagamento)}</span><span className="block text-xs">{contaBaixa?.nome || "Conta não identificada"} · {nomeForma(parcela.forma_pagamento)}</span>{parcela.comprovante_url && <button onClick={() => void abrirComprovante(parcela.comprovante_url)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#08714b]"><FileText size={13}/> Ver comprovante</button>}</> : <span className="text-xs text-gray-400">Ainda não pago</span>}</td>
                                  <td className="px-4 py-3 text-right">{parcela.status === "pendente" ? <button onClick={() => abrirBaixa(obrigacao, parcela)} className="rounded-lg bg-[#005a3c] px-3 py-2 text-xs font-bold text-white hover:bg-[#00452f]">Registrar pagamento</button> : parcela.status === "paga" ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14}/> Baixada</span> : "—"}</td>
                                </tr>;
                              })}
                            </tbody>
                          </table>
                        </div>
                        <p className="mt-3 text-xs text-gray-500">O pagamento só reduz o saldo bancário quando a parcela é baixada. A baixa cria uma saída no Fluxo de Caixa e mantém o vínculo com esta obrigação.</p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="flex items-start gap-2"><Clock3 size={18} className="mt-0.5 shrink-0"/><p><strong>Regra do saldo bancário:</strong> as parcelas futuras são compromissos previstos e não alteram o saldo atual. Somente o registro do pagamento cria uma saída real, na conta e na data informadas.</p></div>
          </div>
        </section>
      </div>

      {mostrarCadastro && <Modal titulo="Nova conta a pagar" fechar={() => setMostrarCadastro(false)}>
        <form onSubmit={(event) => void criarObrigacao(event)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Campo label="Descrição do compromisso" value={descricao} onChange={setDescricao} required placeholder="Ex.: Financiamento das placas solares"/></div>
            <Campo label="Fornecedor / credor" value={fornecedor} onChange={setFornecedor} placeholder="Nome da empresa ou credor"/>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Categoria *</span><select value={categoria} onChange={(event) => setCategoria(event.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3.5 py-3 text-sm">{CATEGORIAS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <Campo label="Valor de cada parcela (R$)" value={valorParcela} onChange={setValorParcela} type="number" min="0.01" step="0.01" required placeholder="0,00"/>
            <Campo label="Quantidade de parcelas" value={quantidade} onChange={setQuantidade} type="number" min="1" max="360" required/>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Periodicidade *</span><select value={periodicidade} onChange={(event) => { const valor = event.target.value as Periodicidade; setPeriodicidade(valor); if (valor === "unica") setQuantidade("1"); }} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3.5 py-3 text-sm">{PERIODICIDADES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <Campo label="Primeiro vencimento" value={primeiroVencimento} onChange={setPrimeiroVencimento} type="date" required/>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Conta prevista para pagamento</span><select value={contaPreferencial} onChange={(event) => setContaPreferencial(event.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3.5 py-3 text-sm"><option value="">Definir na hora de pagar</option>{contas.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.banco ? ` — ${item.banco}` : ""}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Forma prevista de pagamento</span><select value={formaPreferencial} onChange={(event) => setFormaPreferencial(event.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3.5 py-3 text-sm">{FORMAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <div className="sm:col-span-2"><label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Observações / condições do contrato</span><textarea rows={3} value={observacoes} onChange={(event) => setObservacoes(event.target.value)} placeholder="Número do contrato, juros, vencimento, detalhes importantes..." className="w-full rounded-xl border border-[#d5e0da] px-3.5 py-3 text-sm outline-none focus:border-[#16845b]"/></label></div>
          </div>
          <div className="rounded-xl border border-[#cfe3d8] bg-[#eef7f2] p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#527264]">Valor total programado</p><p className="mt-1 text-2xl font-extrabold text-[#005a3c]">{formatarMoeda(totalPrevisto)}</p></div><div className="text-right text-sm text-[#527264]"><p>{quantidadeNumber} parcela(s)</p><p>{periodicidadeLabel(periodicidade)}</p></div></div><p className="mt-2 text-xs text-[#527264]">As datas de vencimento serão geradas automaticamente conforme a periodicidade. Nenhuma saída bancária será criada agora.</p></div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setMostrarCadastro(false)} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600">Cancelar</button><button type="submit" disabled={salvando} className="rounded-xl bg-[#005a3c] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{salvando ? "Salvando parcelas..." : "Cadastrar e programar parcelas"}</button></div>
        </form>
      </Modal>}

      {parcelaPagando && obrigacaoPagando && <Modal titulo="Registrar pagamento da parcela" fechar={() => { if (!salvando) { setParcelaPagando(null); setObrigacaoPagando(null); } }}>
        <form onSubmit={(event) => void confirmarPagamento(event)} className="space-y-5">
          <div className="rounded-xl border border-[#dce9e1] bg-[#f7fbf8] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#638273]">Compromisso</p><p className="mt-1 text-lg font-extrabold text-[#174b38]">{obrigacaoPagando.descricao}</p><div className="mt-3 grid grid-cols-2 gap-3"><div><p className="text-xs text-gray-500">Parcela</p><p className="font-bold">{parcelaPagando.numero_parcela}/{parcelaPagando.quantidade_parcelas}</p></div><div><p className="text-xs text-gray-500">Valor a pagar</p><p className="font-extrabold text-[#005a3c]">{formatarMoeda(parcelaPagando.valor)}</p></div><div><p className="text-xs text-gray-500">Vencimento</p><p className="font-semibold">{formatarData(parcelaPagando.data_vencimento)}</p></div></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Conta que realizou o pagamento *</span><select required value={contaPagamento} onChange={(event) => setContaPagamento(event.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3.5 py-3 text-sm"><option value="">Selecione a conta</option>{contas.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.banco ? ` — ${item.banco}` : ""}</option>)}</select></label>
            <Campo label="Data efetiva do pagamento" value={dataPagamento} onChange={setDataPagamento} type="date" max={hoje} required/>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Forma de pagamento *</span><select value={formaPagamento} onChange={(event) => setFormaPagamento(event.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3.5 py-3 text-sm">{FORMAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Comprovante (opcional)</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setArquivoPagamento(event.target.files?.[0] || null)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-2.5 text-xs"/><span className="mt-1 block text-[11px] text-gray-400">JPG, PNG, WEBP ou PDF até 8 MB.</span></label>
            <div className="sm:col-span-2"><label className="block"><span className="mb-1.5 block text-sm font-semibold text-gray-700">Observações do pagamento</span><textarea rows={3} value={observacoesPagamento} onChange={(event) => setObservacoesPagamento(event.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3.5 py-3 text-sm"/></label></div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Ao confirmar, o sistema cria uma única saída financeira na conta e na data informadas, vinculada a esta parcela. A parcela deixa de aparecer como compromisso em aberto.</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setParcelaPagando(null); setObrigacaoPagando(null); }} disabled={salvando} className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-600 disabled:opacity-50">Cancelar</button><button type="submit" disabled={salvando || !contaPagamento} className="rounded-xl bg-[#005a3c] px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{salvando ? "Registrando pagamento..." : "Confirmar pagamento e lançar saída"}</button></div>
        </form>
      </Modal>}
    </main>
  );
}
