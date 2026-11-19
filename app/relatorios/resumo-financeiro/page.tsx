"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowLeft, ArrowUpRight, CalendarDays, Printer, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";

type LinhaCategoria = { categoria: string; valor: number };
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
type MesResumo = {
  mes: number;
  nome: string;
  totais: Totais;
  entradas_por_categoria: LinhaCategoria[];
  saidas_por_categoria: LinhaCategoria[];
};
type DadosRelatorio = {
  ano: number;
  periodo: "mensal" | "anual";
  mes: number | null;
  totais: Totais;
  entradas_por_categoria: LinhaCategoria[];
  saidas_por_categoria: LinhaCategoria[];
  meses: MesResumo[];
  observacao: string;
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const ANO_ATUAL = new Date().getFullYear();
const MES_ATUAL = new Date().getMonth() + 1;

function moeda(valor: number | null | undefined) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CartaoResumo({
  titulo,
  valor,
  legenda,
  tipo,
}: {
  titulo: string;
  valor: number;
  legenda: string;
  tipo: "entrada" | "saida" | "resultado";
}) {
  const icone = tipo === "entrada"
    ? <ArrowDownRight size={19} />
    : tipo === "saida"
      ? <ArrowUpRight size={19} />
      : <Wallet size={19} />;
  const cor = tipo === "entrada"
    ? "text-emerald-700 bg-emerald-50"
    : tipo === "saida"
      ? "text-red-700 bg-red-50"
      : valor >= 0
        ? "text-[#005a3c] bg-[#eaf4ef]"
        : "text-red-700 bg-red-50";
  return (
    <section className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-500">{titulo}</p>
        <span className={`rounded-xl p-2 ${cor}`}>{icone}</span>
      </div>
      <p className={`mt-2 text-2xl font-extrabold ${tipo === "saida" ? "text-red-700" : tipo === "resultado" && valor < 0 ? "text-red-700" : "text-[#005a3c]"}`}>{moeda(valor)}</p>
      <p className="mt-1 text-xs text-gray-500">{legenda}</p>
    </section>
  );
}

function ListaCategorias({ titulo, itens, total, vazio }: { titulo: string; itens: LinhaCategoria[]; total: number; vazio: string }) {
  return (
    <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-extrabold text-[#003d2b]">{titulo}</h2>
        <span className="text-sm font-extrabold text-[#005a3c]">{moeda(total)}</span>
      </div>
      {itens.length === 0 ? (
        <p className="rounded-xl bg-[#f7faf8] px-4 py-5 text-sm text-gray-500">{vazio}</p>
      ) : (
        <div className="space-y-3">
          {itens.map((item) => {
            const participacao = total > 0 ? Math.min(100, Math.max(0, (item.valor / total) * 100)) : 0;
            return (
              <div key={item.categoria}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-[#18362b]">{item.categoria}</span>
                  <strong className="whitespace-nowrap text-[#18362b]">{moeda(item.valor)}</strong>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#edf2ef]">
                  <div className="h-full rounded-full bg-[#0b7650]" style={{ width: `${participacao}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function ResumoFinanceiroPage() {
  const router = useRouter();
  const [periodo, setPeriodo] = useState<"mensal" | "anual">("mensal");
  const [ano, setAno] = useState(String(ANO_ATUAL));
  const [mes, setMes] = useState(String(MES_ATUAL));
  const [dados, setDados] = useState<DadosRelatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [atualizacao, setAtualizacao] = useState(0);

  const carregar = useCallback(async (signal?: AbortSignal) => {
    setCarregando(true);
    setErro("");
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente no sistema.");

      const parametros = new URLSearchParams({ ano, periodo });
      if (periodo === "mensal") parametros.set("mes", mes);
      const resposta = await fetch(`/api/relatorios/resumo-financeiro?${parametros.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal,
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível carregar o resumo financeiro.");
      setDados(resultado as DadosRelatorio);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErro(error instanceof Error ? error.message : "Não foi possível carregar o resumo financeiro.");
      setDados(null);
    } finally {
      if (!signal?.aborted) setCarregando(false);
    }
  }, [ano, periodo, mes]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void carregar(controller.signal);
    });
    return () => controller.abort();
  }, [carregar, atualizacao]);

  const tituloPeriodo = useMemo(() => periodo === "mensal"
    ? `${MESES[Number(mes) - 1]} de ${ano}`
    : `Ano de ${ano}`,
  [periodo, ano, mes]);

  const anosDisponiveis = useMemo(() => Array.from({ length: Math.max(10, ANO_ATUAL - 2018 + 1) }, (_, indice) => ANO_ATUAL - indice), []);
  const totais = dados?.totais;

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#18362b]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: white !important; font-size: 9pt !important; }
          body * { visibility: hidden !important; }
          .resumo-financeiro-impressao, .resumo-financeiro-impressao * { visibility: visible !important; }
          .resumo-financeiro-impressao { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          .nao-imprimir { display: none !important; }
          .resumo-grade { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 8px !important; }
          section { break-inside: avoid !important; }
          table { width: 100% !important; font-size: 8pt !important; }
          th, td { padding: 6px 5px !important; }
        }
      `}</style>

      <main className="resumo-financeiro-impressao mx-auto max-w-6xl px-5 py-7 lg:ml-[220px]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <button onClick={() => router.push("/relatorios")} className="nao-imprimir mb-2 inline-flex items-center gap-2 text-sm font-bold text-[#005a3c]">
              <ArrowLeft size={16} /> Voltar aos relatórios
            </button>
            <p className="text-xs font-bold uppercase tracking-wide text-[#005a3c]">Sociedade Recreativa Guarani — S.R.G.</p>
            <h1 className="mt-1 text-2xl font-extrabold text-[#005a3c] sm:text-3xl">Resumo financeiro</h1>
            <p className="mt-1 text-sm text-gray-500">Prestação de contas objetiva · {tituloPeriodo}</p>
          </div>
          <div className="nao-imprimir flex gap-2">
            <button onClick={() => setAtualizacao((valor) => valor + 1)} disabled={carregando} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd9d2] bg-white px-3 py-2.5 text-sm font-bold text-[#005a3c] disabled:opacity-60">
              <RefreshCw size={16} /> Atualizar
            </button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-3 py-2.5 text-sm font-bold text-white">
              <Printer size={16} /> Imprimir / PDF
            </button>
          </div>
        </div>

        <section className="nao-imprimir mb-5 rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[190px] flex-1">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Visualização</label>
              <div className="grid grid-cols-2 rounded-xl bg-[#eef4f0] p-1">
                <button onClick={() => setPeriodo("mensal")} className={`rounded-lg px-4 py-2.5 text-sm font-bold ${periodo === "mensal" ? "bg-[#005a3c] text-white shadow-sm" : "text-[#365448]"}`}>Mensal</button>
                <button onClick={() => setPeriodo("anual")} className={`rounded-lg px-4 py-2.5 text-sm font-bold ${periodo === "anual" ? "bg-[#005a3c] text-white shadow-sm" : "text-[#365448]"}`}>Anual</button>
              </div>
            </div>
            <div className="min-w-[140px]">
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Ano</label>
              <select value={ano} onChange={(event) => setAno(event.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 font-semibold outline-none focus:border-[#005a3c]">
                {anosDisponiveis.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            {periodo === "mensal" && (
              <div className="min-w-[170px]">
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">Mês</label>
                <select value={mes} onChange={(event) => setMes(event.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 font-semibold outline-none focus:border-[#005a3c]">
                  {MESES.map((nome, indice) => <option key={nome} value={indice + 1}>{nome}</option>)}
                </select>
              </div>
            )}
            <div className="ml-auto hidden items-center gap-2 pb-3 text-xs text-gray-500 sm:flex">
              <CalendarDays size={15} /> Período por data do lançamento
            </div>
          </div>
        </section>

        {erro && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{erro}</div>}
        {carregando ? (
          <div className="rounded-2xl border border-[#dfe7e2] bg-white p-10 text-center text-sm text-gray-500">Calculando entradas e saídas do período...</div>
        ) : dados && totais ? (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-3 resumo-grade">
              <CartaoResumo titulo="Total recebido" valor={totais.entradas} legenda="Entradas registradas no financeiro" tipo="entrada" />
              <CartaoResumo titulo="Total pago" valor={totais.saidas} legenda="Saídas registradas no financeiro" tipo="saida" />
              <CartaoResumo titulo="Resultado do período" valor={totais.resultado} legenda="Recebimentos menos pagamentos" tipo="resultado" />
            </div>

            <section className="mb-5 rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-extrabold text-[#003d2b]">De onde vieram as receitas</h2>
                <span className="text-xs text-gray-500">Total: {moeda(totais.entradas)}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-[#f1f8f4] p-3">
                  <p className="text-xs font-semibold text-gray-500">Mensalidades</p>
                  <p className="mt-1 text-xl font-extrabold text-[#005a3c]">{moeda(totais.mensalidades)}</p>
                </div>
                <div className="rounded-xl bg-[#f1f8f4] p-3">
                  <p className="text-xs font-semibold text-gray-500">Aluguéis e reservas</p>
                  <p className="mt-1 text-xl font-extrabold text-[#005a3c]">{moeda(totais.alugueis)}</p>
                </div>
                <div className="rounded-xl bg-[#f1f8f4] p-3">
                  <p className="text-xs font-semibold text-gray-500">Outras receitas</p>
                  <p className="mt-1 text-xl font-extrabold text-[#005a3c]">{moeda(totais.outras_receitas)}</p>
                </div>
              </div>
              <div className="mt-4 border-t border-[#edf1ee] pt-4">
                <ListaCategorias titulo="Detalhamento das receitas" itens={dados.entradas_por_categoria} total={totais.entradas} vazio="Nenhuma receita registrada neste período." />
              </div>
            </section>

            <div className="mb-5">
              <ListaCategorias titulo="Onde o dinheiro foi gasto" itens={dados.saidas_por_categoria} total={totais.saidas} vazio="Nenhuma saída registrada neste período." />
            </div>

            {periodo === "anual" && (
              <section className="mb-5 overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
                <div className="border-b border-[#e5ece8] p-4">
                  <h2 className="font-extrabold text-[#003d2b]">Movimentação mês a mês</h2>
                  <p className="mt-1 text-xs text-gray-500">Comparativo de receitas, despesas e resultado de cada mês de {ano}.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-[#edf5f0] text-left text-xs uppercase text-gray-600">
                      <tr><th className="px-4 py-3">Mês</th><th className="px-4 py-3 text-right">Mensalidades</th><th className="px-4 py-3 text-right">Aluguéis</th><th className="px-4 py-3 text-right">Outras receitas</th><th className="px-4 py-3 text-right">Total recebido</th><th className="px-4 py-3 text-right">Despesas</th><th className="px-4 py-3 text-right">Resultado</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1ee]">
                      {dados.meses.map((linha) => (
                        <tr key={linha.mes}>
                          <td className="px-4 py-3 font-semibold">{linha.nome}</td>
                          <td className="px-4 py-3 text-right font-semibold">{moeda(linha.totais.mensalidades)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{moeda(linha.totais.alugueis)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{moeda(linha.totais.outras_receitas)}</td>
                          <td className="px-4 py-3 text-right font-extrabold text-emerald-700">{moeda(linha.totais.entradas)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-red-700">{moeda(linha.totais.saidas)}</td>
                          <td className={`px-4 py-3 text-right font-extrabold ${linha.totais.resultado < 0 ? "text-red-700" : "text-[#005a3c]"}`}>{moeda(linha.totais.resultado)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-[#d8e4dc] bg-[#f7faf8] font-extrabold">
                      <tr><td className="px-4 py-3">Total do ano</td><td className="px-4 py-3 text-right">{moeda(totais.mensalidades)}</td><td className="px-4 py-3 text-right">{moeda(totais.alugueis)}</td><td className="px-4 py-3 text-right">{moeda(totais.outras_receitas)}</td><td className="px-4 py-3 text-right text-emerald-700">{moeda(totais.entradas)}</td><td className="px-4 py-3 text-right text-red-700">{moeda(totais.saidas)}</td><td className={`px-4 py-3 text-right ${totais.resultado < 0 ? "text-red-700" : "text-[#005a3c]"}`}>{moeda(totais.resultado)}</td></tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}

            <section className="rounded-xl border border-[#e1e9e4] bg-[#f7faf8] p-4 text-xs leading-5 text-gray-600">
              <p><strong>Critério do relatório:</strong> considera somente entradas e saídas efetivamente registradas no livro financeiro, pela data do lançamento. Mensalidades e aluguéis representam valores recebidos, não cobranças apenas emitidas. Transferências entre contas não entram como receita nem despesa. Foram identificadas {totais.transferencias_excluidas} transferência(s) no período e excluídas do resultado.</p>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
