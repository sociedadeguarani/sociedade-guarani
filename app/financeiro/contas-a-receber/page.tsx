"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  RefreshCw,
  Search,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";

type Conta = { id: string; nome: string; banco: string | null; ativo: boolean };
type Origem = "temporada" | "titulo";
type Parcela = {
  id: string;
  parcela_id: string;
  contrato_id: string;
  origem: Origem;
  origem_label: string;
  pessoa_nome: string;
  referencia: string;
  socio_id: string | null;
  numero: number;
  descricao: string;
  valor: number;
  data_vencimento: string;
  situacao: string;
  data_pagamento: string | null;
  movimentacao_id: string | null;
};
type Filtro = "todas" | "vencidas" | "hoje" | "proximas" | "compensacao";

const FORMAS_TEMPORADA = [
  ["pix", "PIX"],
  ["dinheiro", "Dinheiro"],
  ["transferencia", "Transferência"],
  ["debito_em_conta", "Débito em conta"],
  ["boleto", "Boleto"],
  ["cartao", "Cartão"],
  ["cheque", "Cheque (em compensação)"],
  ["outro", "Outro"],
] as const;
const FORMAS_TITULO = FORMAS_TEMPORADA.filter(([id]) => id !== "cheque");

function hojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBr(valor: string | null | undefined) {
  if (!valor) return "—";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}
function situacao(parcela: Parcela, hoje: string) {
  if (parcela.situacao === "em_compensacao") return "Em compensação";
  if (parcela.data_vencimento < hoje) return "Vencida";
  if (parcela.data_vencimento === hoje) return "Vence hoje";
  return "A vencer";
}
function corSituacao(label: string) {
  if (label === "Vencida") return "bg-red-100 text-red-700";
  if (label === "Vence hoje") return "bg-amber-100 text-amber-800";
  if (label === "Em compensação") return "bg-violet-100 text-violet-800";
  return "bg-blue-50 text-blue-800";
}

export default function ContasAReceberPage() {
  const router = useRouter();
  const hoje = hojeBrasil();
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [busca, setBusca] = useState("");
  const [origem, setOrigem] = useState<"todas" | Origem>("todas");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [parcelaSelecionada, setParcelaSelecionada] = useState<Parcela | null>(null);
  const [contaPagamento, setContaPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [numeroCheque, setNumeroCheque] = useState("");
  const [arquivoPagamento, setArquivoPagamento] = useState<File | null>(null);

  const api = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente no sistema.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(url, { ...init, headers, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "Não foi possível concluir a operação.");
    return result;
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setMensagem("");
    try {
      const result = await api("/api/financeiro/contas-a-receber");
      setParcelas((result.parcelas || []) as Parcela[]);
      setContas((result.contas || []) as Conta[]);
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Não foi possível carregar as contas a receber.");
    } finally {
      setCarregando(false);
    }
  }, [api]);

  useEffect(() => {
    let ativo = true;
    void Promise.resolve().then(() => { if (ativo) void carregar(); });
    return () => { ativo = false; };
  }, [carregar]);

  const calculos = useMemo(() => {
    const compensacao = parcelas.filter((p) => p.situacao === "em_compensacao");
    const abertas = parcelas.filter((p) => p.situacao !== "em_compensacao");
    const vencidas = abertas.filter((p) => p.data_vencimento < hoje);
    const hojeLista = abertas.filter((p) => p.data_vencimento === hoje);
    const limite = new Date(`${hoje}T12:00:00`);
    limite.setDate(limite.getDate() + 7);
    const limiteIso = `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`;
    const proximas = abertas.filter((p) => p.data_vencimento > hoje && p.data_vencimento <= limiteIso);
    return {
      total: abertas.reduce((s, p) => s + p.valor, 0),
      vencido: vencidas.reduce((s, p) => s + p.valor, 0),
      hoje: hojeLista.reduce((s, p) => s + p.valor, 0),
      proximos: proximas.reduce((s, p) => s + p.valor, 0),
      compensacao: compensacao.reduce((s, p) => s + p.valor, 0),
    };
  }, [parcelas, hoje]);

  const filtradas = useMemo(() => parcelas.filter((p) => {
    if (origem !== "todas" && p.origem !== origem) return false;
    const label = situacao(p, hoje);
    if (filtro === "vencidas" && label !== "Vencida") return false;
    if (filtro === "hoje" && label !== "Vence hoje") return false;
    if (filtro === "proximas" && !(p.data_vencimento > hoje && p.data_vencimento <= (() => { const d = new Date(`${hoje}T12:00:00`); d.setDate(d.getDate() + 7); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })())) return false;
    if (filtro === "compensacao" && p.situacao !== "em_compensacao") return false;
    if (filtro === "todas" && p.situacao === "em_compensacao") return true;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return !termo || `${p.pessoa_nome} ${p.referencia} ${p.descricao} ${p.origem_label}`.toLocaleLowerCase("pt-BR").includes(termo);
  }).filter((p) => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return !termo || `${p.pessoa_nome} ${p.referencia} ${p.descricao} ${p.origem_label}`.toLocaleLowerCase("pt-BR").includes(termo);
  }), [parcelas, origem, filtro, busca, hoje]);

  function abrirBaixa(parcela: Parcela) {
    setParcelaSelecionada(parcela);
    setContaPagamento(contas[0]?.id || "");
    setDataPagamento(hoje);
    setFormaPagamento("pix");
    setNumeroCheque("");
    setArquivoPagamento(null);
    setMensagem("");
  }

  async function confirmarRecebimento(event: FormEvent) {
    event.preventDefault();
    if (!parcelaSelecionada) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) || dataPagamento > hoje) {
      setMensagem("Informe a data real do recebimento. Não é permitido registrar pagamento futuro.");
      return;
    }
    if (formaPagamento !== "cheque" && !contaPagamento) {
      setMensagem("Selecione a conta bancária ou caixa que recebeu o pagamento.");
      return;
    }
    if (formaPagamento === "cheque" && !numeroCheque.trim()) {
      setMensagem("Informe o número do cheque para registrar a compensação.");
      return;
    }
    setSalvando(true);
    setMensagem("");
    try {
      if (parcelaSelecionada.origem === "temporada") {
        const form = new FormData();
        form.set("acao", "registrar_pagamento");
        form.set("temporada_id", parcelaSelecionada.contrato_id);
        form.set("parcela_id", parcelaSelecionada.parcela_id);
        form.set("data_pagamento", dataPagamento);
        form.set("forma_pagamento", formaPagamento);
        form.set("conta_bancaria_id", formaPagamento === "cheque" ? "" : contaPagamento);
        form.set("cheque_numero", formaPagamento === "cheque" ? numeroCheque : "");
        if (arquivoPagamento && formaPagamento !== "cheque") form.set("arquivo", arquivoPagamento);
        await api("/api/temporadas", { method: "POST", body: form });
      } else {
        await api("/api/venda-titulos", {
          method: "POST",
          body: JSON.stringify({
            acao: "baixar_parcela",
            parcela_id: parcelaSelecionada.parcela_id,
            conta_bancaria_id: contaPagamento,
            forma_pagamento: formaPagamento,
            data_pagamento: dataPagamento,
          }),
        });
      }
      setParcelaSelecionada(null);
      await carregar();
      setMensagem(formaPagamento === "cheque"
        ? "Cheque registrado. A parcela ficará em compensação e ainda não será contabilizada como entrada bancária."
        : "Recebimento confirmado e lançado no Financeiro.");
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Não foi possível registrar o recebimento.");
    } finally {
      setSalvando(false);
    }
  }

  const formasDisponiveis = parcelaSelecionada?.origem === "temporada" ? FORMAS_TEMPORADA : FORMAS_TITULO;
  const totalLinhas = filtradas.length;

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <section className="min-w-0 p-5 sm:p-7 lg:ml-[220px] lg:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <button type="button" onClick={() => router.push("/financeiro")} className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-[#557166] hover:text-[#005a3c]"><ArrowLeft size={16}/> Voltar ao Financeiro</button>
            <p className="text-sm font-medium text-gray-500">Administração · Financeiro</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[#005a3c]"><Wallet size={27}/> Contas a Receber</h1>
            <p className="mt-1 text-sm text-gray-500">Parcelas de Temporadas e Vendas de Títulos em uma única lista.</p>
          </div>
          <button type="button" onClick={() => void carregar()} disabled={carregando} className="inline-flex items-center gap-2 rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] disabled:opacity-60"><RefreshCw size={16} className={carregando ? "animate-spin" : ""}/> Atualizar</button>
        </div>

        {mensagem && <div className="mb-5 rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-semibold text-[#005a3c]">{mensagem}</div>}

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Total em aberto", value: calculos.total, icon: CircleDollarSign, tone: "text-[#005a3c]" },
            { label: "Parcelas vencidas", value: calculos.vencido, icon: Clock3, tone: "text-red-700" },
            { label: "Vencem hoje", value: calculos.hoje, icon: CalendarClock, tone: "text-amber-700" },
            { label: "Próximos 7 dias", value: calculos.proximos, icon: CheckCircle2, tone: "text-blue-700" },
            { label: "Em compensação", value: calculos.compensacao, icon: Wallet, tone: "text-violet-700" },
          ].map((item) => {
            const Icon = item.icon;
            return <div key={item.label} className="rounded-2xl border border-[#dce8e1] bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-gray-500">{item.label}</p><Icon size={18} className={item.tone}/></div><p className={`mt-2 text-xl font-extrabold ${item.tone}`}>{moeda(item.value)}</p></div>;
          })}
        </div>

        <div className="mb-4 grid gap-3 rounded-2xl border border-[#dce8e1] bg-white p-4 md:grid-cols-[minmax(220px,1fr)_200px_220px]">
          <label className="relative block"><Search size={17} className="absolute left-3 top-3 text-gray-400"/><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar associado, contrato ou parcela..." className="w-full rounded-xl border border-[#d5e0da] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#16845b]"/></label>
          <select value={origem} onChange={(e) => setOrigem(e.target.value as "todas" | Origem)} className="rounded-xl border border-[#d5e0da] px-3 py-2.5 text-sm"><option value="todas">Todas as origens</option><option value="temporada">Temporadas</option><option value="titulo">Vendas de Títulos</option></select>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} className="rounded-xl border border-[#d5e0da] px-3 py-2.5 text-sm"><option value="todas">Todas as situações</option><option value="vencidas">Vencidas</option><option value="hoje">Vencem hoje</option><option value="proximas">Próximos 7 dias</option><option value="compensacao">Em compensação</option></select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#dce8e1] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#e2ebe6] px-5 py-4"><div><h2 className="font-bold text-[#173d2e]">Parcelas a receber</h2><p className="text-xs text-gray-500">{totalLinhas} parcela(s) encontradas</p></div><span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs font-bold text-[#005a3c]">Temporadas + Títulos</span></div>
          {carregando ? <div className="p-10 text-center text-sm text-gray-500">Carregando parcelas...</div> : totalLinhas === 0 ? <div className="p-10 text-center text-sm text-gray-500">Nenhuma parcela encontrada para os filtros selecionados.</div> : <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#f3f8f5] text-xs uppercase tracking-wide text-[#557166]"><tr><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3">Associado / comprador</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Parcela</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3 text-right">Ação</th></tr></thead>
              <tbody className="divide-y divide-[#edf2ef]">{filtradas.map((p) => {
                const label = situacao(p, hoje);
                const bloqueada = p.situacao === "em_compensacao";
                return <tr key={p.id} className="hover:bg-[#fbfdfc]"><td className="whitespace-nowrap px-4 py-3 font-semibold">{dataBr(p.data_vencimento)}</td><td className="px-4 py-3"><p className="font-bold text-[#173d2e]">{p.pessoa_nome}</p><p className="text-xs text-gray-500">{p.referencia}</p></td><td className="px-4 py-3"><span className="rounded-full bg-[#eef7f2] px-2.5 py-1 text-xs font-semibold text-[#005a3c]">{p.origem_label}</span></td><td className="px-4 py-3"><p>{p.descricao}</p><p className="text-xs text-gray-500">{p.numero ? `Parcela ${p.numero}` : ""}</p></td><td className="whitespace-nowrap px-4 py-3 text-right font-bold">{moeda(p.valor)}</td><td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${corSituacao(label)}`}>{label}</span></td><td className="px-4 py-3 text-right">{bloqueada ? <span className="text-xs text-violet-700">Acompanhar compensação</span> : <button type="button" onClick={() => abrirBaixa(p)} className="rounded-lg bg-[#005a3c] px-3 py-2 text-xs font-bold text-white hover:bg-[#00462f]">Receber</button>}</td></tr>;
              })}</tbody>
            </table>
          </div>}
        </div>
      </section>

      {parcelaSelecionada && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001f16]/60 p-3 backdrop-blur-sm"><form onSubmit={confirmarRecebimento} className="max-h-[94vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between"><div><h2 className="text-xl font-extrabold text-[#005a3c]">Receber parcela</h2><p className="mt-1 text-sm text-gray-500">{parcelaSelecionada.origem_label} · {parcelaSelecionada.pessoa_nome}</p></div><button type="button" onClick={() => setParcelaSelecionada(null)} className="rounded-full bg-gray-100 p-2"><X size={18}/></button></div>
        <div className="rounded-xl bg-[#f2f8f4] p-4"><div className="flex justify-between gap-3"><span className="text-sm text-gray-600">{parcelaSelecionada.descricao} · vencimento {dataBr(parcelaSelecionada.data_vencimento)}</span><strong className="text-lg">{moeda(parcelaSelecionada.valor)}</strong></div><p className="mt-1 text-xs text-gray-500">Contrato {parcelaSelecionada.referencia}</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-sm font-semibold">Data do recebimento *</span><input type="date" required max={hoje} value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3 text-sm"/></label><label className="block"><span className="mb-1.5 block text-sm font-semibold">Forma de pagamento *</span><select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3 text-sm">{formasDisponiveis.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
        {formaPagamento !== "cheque" && <label className="block"><span className="mb-1.5 block text-sm font-semibold">Banco / caixa que recebeu *</span><select required value={contaPagamento} onChange={(e) => setContaPagamento(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3 text-sm"><option value="">Selecione a conta</option>{contas.map((conta) => <option key={conta.id} value={conta.id}>{conta.nome}{conta.banco ? ` — ${conta.banco}` : ""}</option>)}</select></label>}
        {formaPagamento === "cheque" && parcelaSelecionada.origem === "temporada" && <label className="block"><span className="mb-1.5 block text-sm font-semibold">Número do cheque</span><input required value={numeroCheque} onChange={(e) => setNumeroCheque(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3 text-sm"/></label>}
        {formaPagamento !== "cheque" && parcelaSelecionada.origem === "temporada" && <label className="block"><span className="mb-1.5 block text-sm font-semibold">Comprovante (opcional)</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setArquivoPagamento(e.target.files?.[0] || null)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-2.5 text-sm"/><span className="mt-1 block text-xs text-gray-500">JPG, PNG, WEBP ou PDF, até 8 MB.</span></label>}
        {formaPagamento === "cheque" && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">O cheque ficará em compensação e não será lançado como entrada bancária até a confirmação.</p>}
        <div className="flex justify-end gap-2 border-t border-[#e2ebe6] pt-4"><button type="button" onClick={() => setParcelaSelecionada(null)} className="rounded-xl border border-[#cfe3d8] px-4 py-2.5 text-sm font-semibold">Cancelar</button><button type="submit" disabled={salvando} className="rounded-xl bg-[#005a3c] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{salvando ? "Registrando..." : formaPagamento === "cheque" ? "Registrar cheque" : "Confirmar recebimento"}</button></div>
      </form></div>}
    </main>
  );
}
