"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { BarChart3, CalendarDays, ClipboardList, Download, Printer, RefreshCw } from "lucide-react";
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
  reservado_por_nome: string | null;
  reservado_por_perfil: string | null;
  lista_presenca_nome: string | null;
  quantidade_convidados: number | null;
  lista_presenca_url: string | null;
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

type PeriodoRapido = "ano" | "restante" | "mes" | "personalizado";
type Visualizacao = "administrativo" | "limpeza";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function dataLocalISO(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function datasDoPeriodo(periodo: PeriodoRapido, ano: string, mes: string, hoje: string) {
  const anoNumero = Number(ano);
  const mesNumero = Math.min(12, Math.max(1, Number(mes) || 1));
  if (periodo === "restante") {
    const inicio = ano === hoje.slice(0, 4) ? hoje : `${ano}-01-01`;
    return { inicio, fim: `${ano}-12-31` };
  }
  if (periodo === "mes") {
    const mm = String(mesNumero).padStart(2, "0");
    const ultimoDia = new Date(anoNumero, mesNumero, 0).getDate();
    return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimoDia).padStart(2, "0")}` };
  }
  if (periodo === "personalizado") return null;
  return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
}

function diaSemanaBR(valor: string) {
  if (!valor) return "";
  return new Date(`${valor.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
}

function tituloMes(valor: string) {
  const [ano, mes] = valor.slice(0, 7).split("-").map(Number);
  return new Date(ano, (mes || 1) - 1, 15).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function horarioExibicao(r: Pick<Reserva, "espaco_nome" | "hora_inicio" | "hora_fim">) {
  const nome = r.espaco_nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (nome.includes("quiosque") || nome.includes("salao") || nome.includes("pavilhao")) return "Diária (dia todo)";
  return `${r.hora_inicio} - ${r.hora_fim}`;
}

export default function RelatorioReservasPage() {
  const hoje = dataLocalISO();
  const anoAtual = Number(hoje.slice(0, 4));
  const [anoSelecionado, setAnoSelecionado] = useState(String(anoAtual));
  const [periodoRapido, setPeriodoRapido] = useState<PeriodoRapido>("mes");
  const [mesSelecionado, setMesSelecionado] = useState(String(new Date().getMonth() + 1));
  const periodoInicial = datasDoPeriodo("mes", String(anoAtual), String(new Date().getMonth() + 1), hoje)!;
  const [dataInicial, setDataInicial] = useState(periodoInicial.inicio);
  const [dataFinal, setDataFinal] = useState(periodoInicial.fim);
  const [visualizacao, setVisualizacao] = useState<Visualizacao>("administrativo");
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

  async function carregar(opcoes: { status?: "todos" | Status; pagamento?: string; tipoPessoa?: string; dataInicial?: string; dataFinal?: string } = {}) {
    const inicioConsulta = opcoes.dataInicial ?? dataInicial;
    const fimConsulta = opcoes.dataFinal ?? dataFinal;
    const statusConsulta = opcoes.status ?? status;
    const pagamentoConsulta = opcoes.pagamento ?? pagamento;
    const tipoPessoaConsulta = opcoes.tipoPessoa ?? tipoPessoa;
    setCarregando(true);
    setErro("");
    try {
      const params = new URLSearchParams({
        data_inicial: inicioConsulta,
        data_final: fimConsulta,
        status: statusConsulta,
        espaco_id: espacoId,
        pagamento: pagamentoConsulta,
        tipo_pessoa: tipoPessoaConsulta,
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

  const reservasOrdenadas = useMemo(
    () => [...reservas].sort((a, b) =>
      a.data_reserva.localeCompare(b.data_reserva) ||
      a.hora_inicio.localeCompare(b.hora_inicio) ||
      a.espaco_nome.localeCompare(b.espaco_nome, "pt-BR")
    ),
    [reservas],
  );

  const reservasLimpeza = useMemo(
    () => reservasOrdenadas.filter((r) => r.status !== "cancelada"),
    [reservasOrdenadas],
  );

  const gruposLimpeza = useMemo(() => {
    const mapa = new Map<string, Reserva[]>();
    for (const reserva of reservasLimpeza) {
      const mes = reserva.data_reserva.slice(0, 7);
      if (!mapa.has(mes)) mapa.set(mes, []);
      mapa.get(mes)!.push(reserva);
    }
    return Array.from(mapa.entries()).map(([mes, itens]) => ({ mes, titulo: tituloMes(`${mes}-15`), reservas: itens }));
  }, [reservasLimpeza]);

  function aplicarPeriodo(periodo: PeriodoRapido, ano = anoSelecionado, mes = mesSelecionado) {
    setPeriodoRapido(periodo);
    const datas = datasDoPeriodo(periodo, ano, mes, hoje);
    if (datas) {
      setDataInicial(datas.inicio);
      setDataFinal(datas.fim);
    }
  }

  function mudarAno(ano: string) {
    setAnoSelecionado(ano);
    if (periodoRapido !== "personalizado") {
      const datas = datasDoPeriodo(periodoRapido, ano, mesSelecionado, hoje);
      if (datas) {
        setDataInicial(datas.inicio);
        setDataFinal(datas.fim);
      }
    }
  }

  function mudarMes(mes: string) {
    setMesSelecionado(mes);
    setPeriodoRapido("mes");
    const datas = datasDoPeriodo("mes", anoSelecionado, mes, hoje);
    if (datas) {
      setDataInicial(datas.inicio);
      setDataFinal(datas.fim);
    }
  }

  function abrirAgendaLimpeza() {
    setVisualizacao("limpeza");
    // A agenda de limpeza inclui reservas confirmadas e pendentes, sem filtrar pagamento ou tipo de pessoa.
    void carregar({ status: "todos", pagamento: "todos", tipoPessoa: "todos" });
  }

  function abrirRelatorioAdministrativo() {
    setVisualizacao("administrativo");
    void carregar();
  }

  function exportarCsv() {
    // CSV simples, em ordem cronológica e com cabeçalhos objetivos,
    // para abrir melhor no Excel em português (UTF-8 + delimitador ;).
    const itens = [...(visualizacao === "limpeza" ? reservasLimpeza : reservas)].sort((a, b) =>
      a.data_reserva.localeCompare(b.data_reserva) ||
      a.hora_inicio.localeCompare(b.hora_inicio) ||
      a.espaco_nome.localeCompare(b.espaco_nome, "pt-BR")
    );

    let cabecalho: string[];
    let linhas: string[][];

    if (visualizacao === "limpeza") {
      cabecalho = [
        "Data da reserva", "Dia da semana", "Espaço reservado", "Horário / período",
        "Reservado para", "Reserva cadastrada por", "Situação da reserva",
        "Lista de presença", "Quantidade de convidados"
      ];
      linhas = itens.map((r) => [
        dataBR(r.data_reserva),
        diaSemanaBR(r.data_reserva),
        r.espaco_nome,
        horarioExibicao(r),
        r.responsavel_nome || "Responsável não informado",
        r.reservado_por_nome || "Não identificado (cadastro antigo)",
        statusBR(r.status),
        r.lista_presenca_nome
          ? "Lista anexada"
          : (r.espaco_nome.toLowerCase().includes("quiosque") ? "ATENÇÃO: lista não anexada" : "Não se aplica"),
        r.quantidade_convidados == null ? "" : String(r.quantidade_convidados),
      ]);
    } else {
      cabecalho = [
        "Data da reserva", "Horário / período", "Espaço reservado", "Associado / responsável",
        "Matrícula", "Reserva cadastrada por", "Perfil de quem cadastrou", "Tipo de pessoa",
        "Forma de pagamento", "Situação da reserva", "Valor previsto (R$)", "Data do pagamento",
        "Arquivo da lista de presença", "Quantidade de convidados", "Situação do comprovante"
      ];
      linhas = itens.map((r) => [
        dataBR(r.data_reserva),
        horarioExibicao(r),
        r.espaco_nome,
        r.responsavel_nome || "Responsável não informado",
        r.matricula || "",
        r.reservado_por_nome || "Não identificado (cadastro antigo)",
        r.reservado_por_perfil || "",
        r.tipo_pessoa === "nao_socio" ? "Não sócio" : "Sócio",
        pagamentoBR(r.tipo_pagamento),
        statusBR(r.status),
        Number(r.valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        r.data_pagamento ? dataBR(r.data_pagamento) : "",
        r.lista_presenca_nome || "",
        r.quantidade_convidados == null ? "" : String(r.quantidade_convidados),
        r.comprovante_status || "",
      ]);
    }

    const csv = [cabecalho, ...linhas]
      .map((linha) => linha.map((valor) => escapeCsv(String(valor))).join(";"))
      .join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const periodoArquivo = periodoRapido === "mes"
      ? `${anoSelecionado}-${String(mesSelecionado).padStart(2, "0")}-${MESES[Number(mesSelecionado) - 1].toLowerCase()}`
      : periodoRapido === "ano"
        ? anoSelecionado
        : `${dataInicial}_a_${dataFinal}`;
    a.download = `${visualizacao === "limpeza" ? "Agenda_para_limpeza" : "Relatorio_da_diretoria"}_reservas_${periodoArquivo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <style jsx global>{`
        @page { size: landscape; margin: 10mm; }
        @media print {
          body { background: white !important; }
          header, aside { display: none !important; }
          .nao-imprimir { display: none !important; }
          .relatorio-reservas-print { margin: 0 !important; max-width: none !important; padding: 0 !important; }
          .sombra-impressao { box-shadow: none !important; border: 1px solid #dfe7e2 !important; }
          .agenda-limpeza-print { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
          .limpeza-mes { break-inside: auto; page-break-inside: auto; }
          .agenda-limpeza-print table { font-size: 10pt !important; }
          .agenda-limpeza-print th, .agenda-limpeza-print td { padding-top: 6px !important; padding-bottom: 6px !important; }
          .relatorio-reservas-print tr { break-inside: avoid; page-break-inside: avoid; }
          .relatorio-reservas-print h2 { break-after: avoid-page; }
          .limpeza-mes tr { break-inside: avoid; page-break-inside: avoid; }
          .limpeza-mes h3 { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <main className="relatorio-reservas-print mx-auto max-w-[1500px] px-6 py-8 lg:ml-[220px]">
        <div className="nao-imprimir mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Link href="/relatorios" className="mb-3 inline-block text-sm font-semibold text-[#005a3c]">← Voltar aos relatórios</Link>
            <p className="text-sm font-medium text-gray-500">Administração</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-extrabold text-[#005a3c]">{visualizacao === "limpeza" ? <><CalendarDays className="h-8 w-8" /> Agenda de limpeza</> : <><BarChart3 className="h-8 w-8" /> Relatório de Reservas</>}</h1>
            <p className="mt-1 text-gray-500">{visualizacao === "limpeza" ? "Lista simples para encaminhar à limpeza: locais, datas e horários, sem valores financeiros." : "Relatório completo para presidente e diretoria, com situação, responsáveis e valores."}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void carregar(visualizacao === "limpeza" ? { status: "todos", pagamento: "todos", tipoPessoa: "todos" } : {})} disabled={carregando} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd9d2] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] shadow-sm disabled:opacity-60"><RefreshCw className="h-4 w-4" /> Atualizar</button>
            <button onClick={abrirRelatorioAdministrativo} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold shadow-sm ${visualizacao === "administrativo" ? "border-[#005a3c] bg-[#e7f3ec] text-[#005a3c]" : "border-[#cbd9d2] bg-white text-[#005a3c]"}`}><BarChart3 className="h-4 w-4" /> Para presidente / diretoria</button>
            <button onClick={abrirAgendaLimpeza} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold shadow-sm ${visualizacao === "limpeza" ? "border-[#005a3c] bg-[#e7f3ec] text-[#005a3c]" : "border-[#cbd9d2] bg-white text-[#005a3c]"}`}><ClipboardList className="h-4 w-4" /> Para equipe de limpeza</button>
            <button onClick={exportarCsv} disabled={carregando} title="CSV com colunas organizadas para abrir e filtrar no Excel" className="inline-flex items-center gap-2 rounded-xl border border-[#cbd9d2] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] shadow-sm disabled:opacity-60"><Download className="h-4 w-4" /> Baixar para Excel (CSV)</button>
            <button onClick={imprimir} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white shadow-sm"><Printer className="h-4 w-4" /> Salvar / imprimir PDF</button>
          </div>
        </div>

        <section className="nao-imprimir mb-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-extrabold text-[#003d2b]">Escolha o mês ou período para enviar</h2>
            <p className="mt-1 text-sm text-gray-600">
              Para enviar setembro inteiro, escolha o ano e o mês abaixo, clique em <b>Mês inteiro</b>, depois em Gerar e em <b>Salvar / imprimir PDF</b>.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold text-gray-700">
              Ano
              <select value={anoSelecionado} onChange={(e) => mudarAno(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]">
                {Array.from({ length: anoAtual - 2000 + 11 }, (_, i) => 2000 + i).map((ano) => <option key={ano} value={String(ano)}>{ano}</option>)}
              </select>
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Mês
              <select value={mesSelecionado} onChange={(e) => mudarMes(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]">
                {MESES.map((mes, i) => <option key={mes} value={String(i + 1)}>{mes}</option>)}
              </select>
            </label>

            {periodoRapido === "personalizado" && <>
              <label className="text-sm font-semibold text-gray-700">Data inicial
                <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] px-3 py-3 outline-none focus:border-[#005a3c]" />
              </label>
              <label className="text-sm font-semibold text-gray-700">Data final
                <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] px-3 py-3 outline-none focus:border-[#005a3c]" />
              </label>
            </>}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {([
              ["mes", "Mês inteiro"],
              ["ano", "Ano inteiro"],
              ["restante", anoSelecionado === hoje.slice(0, 4) ? "Hoje até dezembro" : "Ano inteiro do ano escolhido"],
            ] as Array<[PeriodoRapido, string]>).map(([periodo, rotulo]) => (
              <button type="button" key={periodo} onClick={() => aplicarPeriodo(periodo)} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${periodoRapido === periodo ? "border-[#005a3c] bg-[#e7f3ec] text-[#005a3c]" : "border-[#cbd9d2] bg-white text-[#42574d]"}`}>
                {rotulo}
              </button>
            ))}
            <button type="button" onClick={() => setPeriodoRapido("personalizado")} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${periodoRapido === "personalizado" ? "border-[#005a3c] bg-[#e7f3ec] text-[#005a3c]" : "border-[#cbd9d2] bg-white text-[#42574d]"}`}>
              Escolher datas
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-[#f1f7f3] px-4 py-3 text-sm text-[#174b37]">
            <span className="font-bold">Você vai gerar: </span>
            {periodoRapido === "mes"
              ? `reservas de ${MESES[Number(mesSelecionado) - 1]} de ${anoSelecionado} (${dataBR(dataInicial)} a ${dataBR(dataFinal)})`
              : periodoRapido === "ano"
                ? `todas as reservas de ${anoSelecionado} (${dataBR(dataInicial)} a ${dataBR(dataFinal)})`
                : periodoRapido === "restante"
                  ? `reservas de ${dataBR(dataInicial)} até ${dataBR(dataFinal)}`
                  : `reservas entre ${dataBR(dataInicial)} e ${dataBR(dataFinal)}`}
            .
            <div className="mt-1 text-xs text-[#4e6a5d]">
              Para encaminhar por WhatsApp ou e-mail, prefira o PDF. A planilha é indicada para quem precisa filtrar ou trabalhar com os dados no Excel.
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {visualizacao === "administrativo" && <>
              <label className="text-sm font-semibold text-gray-600">Status
                <select value={status} onChange={(e) => setStatus(e.target.value as "todos" | Status)} className="ml-2 rounded-xl border border-[#d5e0da] bg-white px-3 py-2">
                  <option value="todos">Todos</option><option value="confirmada">Confirmadas</option><option value="pendente">Pendentes</option><option value="cancelada">Canceladas</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-gray-600">Pagamento
                <select value={pagamento} onChange={(e) => setPagamento(e.target.value)} className="ml-2 rounded-xl border border-[#d5e0da] bg-white px-3 py-2">
                  <option value="todos">Todos</option><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="debito_em_conta">Débito em conta</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option><option value="outro">Outro</option><option value="sem_pagamento">Sem pagamento</option>
                </select>
              </label>
              <label className="text-sm font-semibold text-gray-600">Tipo de pessoa
                <select value={tipoPessoa} onChange={(e) => setTipoPessoa(e.target.value)} className="ml-2 rounded-xl border border-[#d5e0da] bg-white px-3 py-2"><option value="todos">Todos</option><option value="socio">Sócio</option><option value="nao_socio">Não sócio</option></select>
              </label>
            </>}
            <label className="text-sm font-semibold text-gray-600">Espaço
              <select value={espacoId} onChange={(e) => setEspacoId(e.target.value)} className="ml-2 rounded-xl border border-[#d5e0da] bg-white px-3 py-2">
                <option value="todos">Todos os espaços</option>{espacos.map((e) => <option key={e.id || e.nome} value={e.id || "todos"}>{e.nome}</option>)}
              </select>
            </label>
            <button onClick={() => void carregar(visualizacao === "limpeza" ? { status: "todos", pagamento: "todos", tipoPessoa: "todos" } : {})} className="rounded-xl bg-[#005a3c] px-5 py-2.5 text-sm font-bold text-white shadow-sm">
              Gerar {visualizacao === "limpeza" ? "lista para limpeza" : "relatório da diretoria"}
            </button>
          </div>
        </section>

        {erro && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{erro}</div>}

        {carregando ? (
          <div className="rounded-2xl border bg-white p-12 text-center text-gray-500 shadow-sm">Carregando relatório de reservas...</div>
        ) : (
          <>
            {visualizacao === "limpeza" ? (
              <section className="agenda-limpeza-print rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                <div className="mb-5 border-b border-[#dfe7e2] pb-4">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-[#005a3c]">Sociedade Recreativa Guarani — S.R.G.</p>
                  <h2 className="mt-1 text-2xl font-extrabold text-[#005a3c]">{periodoRapido === "mes" ? `Agenda de reservas — ${MESES[Number(mesSelecionado) - 1]} de ${anoSelecionado}` : "Agenda de limpeza e preparação dos espaços"}</h2>
                  <p className="mt-1 text-sm text-gray-600">Período: {dataBR(dataInicial)} a {dataBR(dataFinal)} · Reservas confirmadas e pendentes; canceladas não aparecem.</p>
                  <p className="mt-1 text-xs text-gray-500">Relatório operacional. Não contém valores financeiros nem dados de pagamento.</p>
                </div>
                <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-[#dfe7e2] bg-[#f8faf9] p-3"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Reservas no período</p><p className="mt-1 text-2xl font-extrabold text-[#005a3c]">{reservasLimpeza.length}</p></div>
                  <div className="rounded-xl border border-green-200 bg-green-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-green-800">Confirmadas</p><p className="mt-1 text-2xl font-extrabold text-green-800">{reservasLimpeza.filter((r) => r.status === "confirmada").length}</p></div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-amber-900">Aguardando confirmação</p><p className="mt-1 text-2xl font-extrabold text-amber-900">{reservasLimpeza.filter((r) => r.status === "pendente").length}</p></div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-amber-900">Quiosques sem lista</p><p className="mt-1 text-2xl font-extrabold text-amber-900">{reservasLimpeza.filter((r) => r.espaco_nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("quiosque") && !r.lista_presenca_nome).length}</p></div>
                </div>
                {reservasLimpeza.some((r) => r.espaco_nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("quiosque") && !r.lista_presenca_nome) && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                    Atenção: {reservasLimpeza.filter((r) => r.espaco_nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("quiosque") && !r.lista_presenca_nome).length} reserva(s) de quiosque sem lista de presença anexada. Verifique a lista antes do evento.
                  </div>
                )}
                {gruposLimpeza.map((grupo) => (
                  <section key={grupo.mes} className="limpeza-mes mb-7 last:mb-0">
                    <h3 className="mb-2 rounded-lg bg-[#e7f3ec] px-3 py-2 text-lg font-extrabold capitalize text-[#005a3c]">{grupo.titulo}</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead><tr className="border-b bg-[#f8faf9] text-left text-xs font-extrabold uppercase tracking-wide text-gray-600"><th className="px-3 py-3">Data</th><th>Espaço</th><th>Horário / período</th><th>Reservado para</th><th>Situação</th><th>Lista / convidados</th></tr></thead>
                        <tbody>{grupo.reservas.map((r) => {
                          const ehQuiosque = r.espaco_nome.toLowerCase().includes("quiosque");
                          const lista = r.lista_presenca_nome ? `Lista anexada${r.quantidade_convidados != null ? ` · ${r.quantidade_convidados} convidados` : ""}` : (ehQuiosque ? "Lista não anexada" : "—");
                          return <tr key={r.id} className="border-b last:border-b-0 align-top"><td className="whitespace-nowrap px-3 py-3"><b>{dataBR(r.data_reserva)}</b><div className="text-xs capitalize text-gray-500">{diaSemanaBR(r.data_reserva)}</div></td><td className="py-3 font-bold">{r.espaco_nome}</td><td className="py-3">{horarioExibicao(r)}</td><td className="py-3">{r.responsavel_nome || "Não informado"}</td><td className="py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${r.status === "confirmada" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"}`}>{r.status === "confirmada" ? "Confirmada" : "Pendente de confirmação"}</span></td><td className={`py-3 ${ehQuiosque && !r.lista_presenca_nome ? "font-bold text-amber-700" : "text-gray-600"}`}>{lista}</td></tr>;
                        })}</tbody>
                      </table>
                    </div>
                  </section>
                ))}
                {!reservasLimpeza.length && <p className="py-12 text-center text-gray-500">Nenhuma reserva confirmada ou pendente neste período.</p>}
                <p className="mt-6 border-t border-[#dfe7e2] pt-3 text-xs text-gray-500">Gerado em {dataBR(hoje)} · Para alterações na agenda, consulte o módulo Reservas.</p>
              </section>
            ) : (
              <>
            <section className="hidden print:block mb-6 border-b-2 border-[#005a3c] pb-4">
              <p className="text-xs font-extrabold uppercase tracking-widest text-[#005a3c]">Sociedade Recreativa Guarani — S.R.G.</p>
              <h1 className="mt-1 text-2xl font-extrabold text-[#005a3c]">Relatório de reservas — Diretoria / Presidência</h1>
              <p className="mt-1 text-sm text-gray-600">Período: {dataBR(dataInicial)} a {dataBR(dataFinal)} · Gerado em {dataBR(hoje)}</p>
            </section>
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
              <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b bg-[#eef6f1] text-left text-xs font-bold uppercase tracking-wide text-gray-600"><th className="px-3 py-3">Data</th><th>Espaço</th><th>Responsável</th><th>Reservado por</th><th>Tipo</th><th>Pagamento</th><th>Status</th><th>Lista de presença</th><th className="text-right">Valor</th></tr></thead><tbody>{reservasOrdenadas.map((r) => <tr key={r.id} className="border-b last:border-b-0"><td className="px-3 py-3 whitespace-nowrap"><b>{dataBR(r.data_reserva)}</b><div className="text-xs text-gray-500">{horarioExibicao(r)}</div></td><td className="font-semibold">{r.espaco_nome}</td><td><b>{r.responsavel_nome || "—"}</b><div className="text-xs text-gray-500">{r.matricula || "—"}</div></td><td><b>{r.reservado_por_nome || "Não registrado"}</b><div className="text-xs text-gray-500">{r.reservado_por_perfil || "Registro anterior à auditoria"}</div></td><td>{r.tipo_pessoa === "nao_socio" ? "Não sócio" : "Sócio"}</td><td>{pagamentoBR(r.tipo_pagamento)}</td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${r.status === "confirmada" ? "bg-green-100 text-green-700" : r.status === "pendente" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{statusBR(r.status)}</span></td><td>{r.lista_presenca_url ? <a href={r.lista_presenca_url} target="_blank" rel="noreferrer" className="font-semibold text-[#005a3c] underline">{r.lista_presenca_nome || "Abrir lista"}{r.quantidade_convidados != null ? ` (${r.quantidade_convidados}/16)` : ""}</a> : r.lista_presenca_nome || "—"}</td><td className="text-right font-extrabold text-[#005a3c]">{moeda(r.valor)}</td></tr>)}</tbody></table>{!reservas.length && <p className="py-10 text-center text-gray-500">Nenhuma reserva encontrada para os filtros selecionados.</p>}</div>
            </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

