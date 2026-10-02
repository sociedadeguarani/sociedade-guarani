"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { BarChart3, Download, Printer, RefreshCw } from "lucide-react";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";

type Status = "confirmada" | "pendente" | "cancelada";
type Reserva = {
  id: string;
  espaco_id: string | null;
  espaco_nome: string;
  categoria: string | null;
  responsavel_nome: string;
  matricula: string | null;
  data_reserva: string;
  hora_inicio: string;
  hora_fim: string;
  valor: number;
  status: Status;
  tipo_pagamento: string;
  tipo_pessoa: "socio" | "nao_socio";
  data_pagamento: string | null;
  comprovante_status: string | null;
};
type EspacoFiltro = { id: string | null; nome: string; categoria: string | null };

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBR(valor: string) {
  if (!valor) return "—";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

function pagamentoBR(valor: string) {
  const mapa: Record<string, string> = {
    pix: "PIX",
    dinheiro: "Dinheiro",
    transferencia: "Transferência",
    debito_em_conta: "Débito em conta",
    boleto: "Boleto",
    cartao: "Cartão",
    outro: "Outro",
    sem_pagamento: "Sem pagamento",
  };
  return mapa[valor] || valor.replaceAll("_", " ");
}

function statusBR(valor: Status) {
  return valor === "confirmada" ? "Confirmada" : valor === "cancelada" ? "Cancelada" : "Pendente";
}

function escapeCsv(valor: string) {
  return `"${valor.replaceAll('"', '""')}"`;
}

export default function RelatorioReservasPage() {
  const hoje = new Date().toISOString().slice(0, 10);
  const primeiroDiaAno = `${hoje.slice(0, 4)}-01-01`;
  const [dataInicial, setDataInicial] = useState(primeiroDiaAno);
  const [dataFinal, setDataFinal] = useState(hoje);
  const [status, setStatus] = useState<"todos" | Status>("todos");
  const [espacoId, setEspacoId] = useState("todos");
  const [pagamento, setPagamento] = useState("todos");
  const [tipoPessoa, setTipoPessoa] = useState("todos");
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [espacos, setEspacos] = useState<EspacoFiltro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function tokenAtual() {
    const { data: sessao } = await supabase.auth.getSession();
    return sessao.session?.access_token || "";
  }

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams({
        data_inicial: dataInicial,
        data_final: dataFinal,
        status,
        espaco_id: espacoId,
        pagamento,
        tipo_pessoa: tipoPessoa,
      });
      const token = await tokenAtual();
      const resposta = await fetch(`/api/relatorios/reservas?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });
      const payload = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(payload?.error || "Não foi possível carregar o relatório.");
      setReservas(Array.isArray(payload?.reservas) ? payload.reservas as Reserva[] : []);
      setEspacos(Array.isArray(payload?.espacos) ? payload.espacos as EspacoFiltro[] : []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível carregar o relatório.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const resumo = useMemo(() => {
    const confirmadas = reservas.filter((r) => r.status === "confirmada");
    const pendentes = reservas.filter((r) => r.status === "pendente");
    const canceladas = reservas.filter((r) => r.status === "cancelada");
    const naoCanceladas = reservas.filter((r) => r.status !== "cancelada");
    return {
      total: reservas.length,
      confirmadas: confirmadas.length,
      pendentes: pendentes.length,
      canceladas: canceladas.length,
      valorConfirmado: confirmadas.reduce((s, r) => s + r.valor, 0),
      valorPendente: pendentes.reduce((s, r) => s + r.valor, 0),
      valorPrevisto: naoCanceladas.reduce((s, r) => s + r.valor, 0),
    };
  }, [reservas]);

  const porEspaco = useMemo(() => {
    const mapa = new Map<string, { nome: string; quantidade: number; confirmadas: number; pendentes: number; canceladas: number; valor: number }>();
    for (const r of reservas) {
      const chave = r.espaco_id || r.espaco_nome;
      const item = mapa.get(chave) || { nome: r.espaco_nome, quantidade: 0, confirmadas: 0, pendentes: 0, canceladas: 0, valor: 0 };
      item.quantidade += 1;
      if (r.status === "confirmada") item.confirmadas += 1;
      if (r.status === "pendente") item.pendentes += 1;
      if (r.status === "cancelada") item.canceladas += 1;
      if (r.status !== "cancelada") item.valor += r.valor;
      mapa.set(chave, item);
    }
    return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);
  }, [reservas]);

  const porPagamento = useMemo(() => {
    const mapa = new Map<string, { quantidade: number; valor: number }>();
    for (const r of reservas) {
      const item = mapa.get(r.tipo_pagamento) || { quantidade: 0, valor: 0 };
      item.quantidade += 1;
      if (r.status !== "cancelada") item.valor += r.valor;
      mapa.set(r.tipo_pagamento, item);
    }
    return Array.from(mapa.entries())
      .map(([forma, item]) => ({ forma, ...item }))
      .sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);
  }, [reservas]);

  function imprimir() {
    window.print();
  }

  function exportarCsv() {
    const cabecalho = ["Data", "Horário", "Espaço", "Responsável", "Matrícula", "Tipo", "Pagamento", "Status", "Valor", "Data pagamento", "Comprovante"];
    const linhas = reservas.map((r) => [
      dataBR(r.data_reserva),
      `${r.hora_inicio} - ${r.hora_fim}`,
      r.espaco_nome,
      r.responsavel_nome,
      r.matricula || "",
      r.tipo_pessoa === "nao_socio" ? "Não sócio" : "Sócio",
      pagamentoBR(r.tipo_pagamento),
      statusBR(r.status),
      r.valor.toFixed(2).replace(".", ","),
      r.data_pagamento ? dataBR(r.data_pagamento) : "",
      r.comprovante_status || "",
    ]);
    const csv = [cabecalho, ...linhas].map((linha) => linha.map((valor) => escapeCsv(String(valor))).join(";")).join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-reservas-${dataInicial}-${dataFinal}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .nao-imprimir { display: none !important; }
          .relatorio-reservas-print { margin: 0 !important; max-width: none !important; }
          .sombra-impressao { box-shadow: none !important; border: 1px solid #dfe7e2 !important; }
        }
      `}</style>

      <main className="relatorio-reservas-print mx-auto max-w-[1500px] px-6 py-8 lg:ml-[220px]">
        <div className="nao-imprimir mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Link href="/relatorios" className="mb-3 inline-block text-sm font-semibold text-[#005a3c]">← Voltar aos relatórios</Link>
            <p className="text-sm font-medium text-gray-500">Administração</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-extrabold text-[#005a3c]"><BarChart3 className="h-8 w-8" /> Relatório de Reservas</h1>
            <p className="mt-1 text-gray-500">Reservas realizadas, situação, ocupação dos espaços e valores do período.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void carregar()} disabled={carregando} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd9d2] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] shadow-sm disabled:opacity-60"><RefreshCw className="h-4 w-4" /> Atualizar</button>
            <button onClick={exportarCsv} disabled={carregando} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd9d2] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] shadow-sm"><Download className="h-4 w-4" /> Exportar CSV</button>
            <button onClick={imprimir} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white shadow-sm"><Printer className="h-4 w-4" /> Imprimir / PDF</button>
          </div>
        </div>

        <section className="nao-imprimir mb-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
          <div className="mb-4"><h2 className="font-extrabold text-[#003d2b]">Filtros</h2><p className="mt-1 text-sm text-gray-500">Escolha o período e refine por status, espaço, pagamento ou tipo de pessoa.</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-sm font-semibold text-gray-600">Data inicial<input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] px-3 py-3 outline-none focus:border-[#005a3c]" /></label>
            <label className="text-sm font-semibold text-gray-600">Data final<input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] px-3 py-3 outline-none focus:border-[#005a3c]" /></label>
            <label className="text-sm font-semibold text-gray-600">Status<select value={status} onChange={(e) => setStatus(e.target.value as "todos" | Status)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]"><option value="todos">Todos</option><option value="confirmada">Confirmadas</option><option value="pendente">Pendentes</option><option value="cancelada">Canceladas</option></select></label>
            <label className="text-sm font-semibold text-gray-600">Espaço<select value={espacoId} onChange={(e) => setEspacoId(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]"><option value="todos">Todos os espaços</option>{espacos.map((e) => <option key={e.id || e.nome} value={e.id || "todos"}>{e.nome}</option>)}</select></label>
            <label className="text-sm font-semibold text-gray-600">Pagamento<select value={pagamento} onChange={(e) => setPagamento(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]"><option value="todos">Todos</option><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="debito_em_conta">Débito em conta</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option><option value="outro">Outro</option><option value="sem_pagamento">Sem pagamento</option></select></label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="text-sm font-semibold text-gray-600">Tipo de pessoa<select value={tipoPessoa} onChange={(e) => setTipoPessoa(e.target.value)} className="ml-2 rounded-xl border border-[#d5e0da] bg-white px-3 py-2"><option value="todos">Todos</option><option value="socio">Sócio</option><option value="nao_socio">Não sócio</option></select></label>
            <button onClick={() => void carregar()} className="rounded-xl bg-[#005a3c] px-5 py-2.5 text-sm font-bold text-white">Gerar relatório</button>
          </div>
        </section>

        {erro && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{erro}</div>}

        {carregando ? (
          <div className="rounded-2xl border bg-white p-12 text-center text-gray-500 shadow-sm">Carregando relatório de reservas...</div>
        ) : (
          <>
            <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-7">
              {[
                ["Reservas", resumo.total, ""],
                ["Confirmadas", resumo.confirmadas, ""],
                ["Pendentes", resumo.pendentes, ""],
                ["Canceladas", resumo.canceladas, ""],
                ["Valor confirmado", moeda(resumo.valorConfirmado), ""],
                ["Valor pendente", moeda(resumo.valorPendente), ""],
                ["Valor previsto", moeda(resumo.valorPrevisto), ""],
              ].map(([titulo, valor]) => <div key={String(titulo)} className="sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase tracking-wide text-gray-500">{titulo}</div><div className="mt-2 text-2xl font-extrabold text-[#005a3c]">{valor}</div></div>)}
            </section>

            <section className="mb-6 grid gap-6 xl:grid-cols-2">
              <div className="sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-extrabold text-[#005a3c]">Resumo por espaço</h2>
                <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs font-bold uppercase tracking-wide text-gray-500"><th className="px-2 py-3">Espaço</th><th>Qtd.</th><th>Conf.</th><th>Pend.</th><th>Canc.</th><th className="text-right">Valor</th></tr></thead><tbody>{porEspaco.map((item) => <tr key={item.nome} className="border-b last:border-b-0"><td className="px-2 py-3 font-bold">{item.nome}</td><td>{item.quantidade}</td><td>{item.confirmadas}</td><td>{item.pendentes}</td><td>{item.canceladas}</td><td className="text-right font-bold text-[#005a3c]">{moeda(item.valor)}</td></tr>)}</tbody></table>{!porEspaco.length && <p className="py-8 text-center text-gray-500">Nenhuma reserva encontrada.</p>}</div>
              </div>
              <div className="sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-lg font-extrabold text-[#005a3c]">Resumo por pagamento</h2>
                <div className="space-y-3">{porPagamento.map((item) => <div key={item.forma} className="flex items-center justify-between rounded-xl bg-[#f8faf9] px-4 py-3"><div><div className="font-bold">{pagamentoBR(item.forma)}</div><div className="text-xs text-gray-500">{item.quantidade} reserva(s)</div></div><div className="font-extrabold text-[#005a3c]">{moeda(item.valor)}</div></div>)}{!porPagamento.length && <p className="py-8 text-center text-gray-500">Nenhum pagamento no período.</p>}</div>
              </div>
            </section>

            <section className="sombra-impressao rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col justify-between gap-2 md:flex-row md:items-center"><div><h2 className="text-lg font-extrabold text-[#005a3c]">Detalhamento das reservas</h2><p className="text-sm text-gray-500">{reservas.length} registro(s) no filtro atual.</p></div><div className="text-sm text-gray-500">Período: <b>{dataBR(dataInicial)} a {dataBR(dataFinal)}</b></div></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b bg-[#eef6f1] text-left text-xs font-bold uppercase tracking-wide text-gray-600"><th className="px-3 py-3">Data</th><th>Espaço</th><th>Responsável</th><th>Tipo</th><th>Pagamento</th><th>Status</th><th className="text-right">Valor</th></tr></thead><tbody>{reservas.map((r) => <tr key={r.id} className="border-b last:border-b-0"><td className="px-3 py-3 whitespace-nowrap"><b>{dataBR(r.data_reserva)}</b><div className="text-xs text-gray-500">{r.hora_inicio} - {r.hora_fim}</div></td><td className="font-semibold">{r.espaco_nome}</td><td><b>{r.responsavel_nome || "—"}</b><div className="text-xs text-gray-500">{r.matricula || "—"}</div></td><td>{r.tipo_pessoa === "nao_socio" ? "Não sócio" : "Sócio"}</td><td>{pagamentoBR(r.tipo_pagamento)}</td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${r.status === "confirmada" ? "bg-green-100 text-green-700" : r.status === "pendente" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{statusBR(r.status)}</span></td><td className="text-right font-extrabold text-[#005a3c]">{moeda(r.valor)}</td></tr>)}</tbody></table>{!reservas.length && <p className="py-10 text-center text-gray-500">Nenhuma reserva encontrada para os filtros selecionados.</p>}</div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

