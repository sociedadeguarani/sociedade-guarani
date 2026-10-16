"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { CalendarDays, Download, Printer, RefreshCw } from "lucide-react";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";

type Status = "confirmada" | "pendente" | "cancelada";
type Reserva = {
  id: string;
  espaco_id: string | null;
  espaco_nome: string;
  categoria: string | null;
  responsavel_nome: string;
  motivo_locacao: string | null;
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

function textoNormalizado(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function prioridadeEspaco(nome: string) {
  const n = textoNormalizado(nome);
  // Ordem solicitada pela Sociedade: salões sociais, campo/quadras, CTG,
  // demais espaços, quiosques e Cancha 48 sempre por último.
  if (n.includes("salao social grande")) return 0;
  if (n.includes("salao social pequeno")) return 1;
  if (n.includes("cancha 48")) return 99;
  if (n.includes("campo") || n.includes("quadra") || n.includes("futebol") || n.includes("volei") || n.includes("bocha")) return 2;
  if (n.includes("ctg")) return 3;
  if (n.includes("quiosque")) return 5;
  return 4;
}

function ordenarEspacos<T extends { nome: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => prioridadeEspaco(a.nome) - prioridadeEspaco(b.nome) || a.nome.localeCompare(b.nome, "pt-BR"));
}

function corCabecalhoEspaco(nome: string) {
  const n = textoNormalizado(nome);
  if (n.includes("salao social grande")) return "#c6e0b4";
  if (n.includes("salao social pequeno")) return "#fce4d6";
  if (n.includes("ctg")) return "#ffe699";
  if (n.includes("futebol") || n.includes("campo")) return "#f4b183";
  if (n.includes("volei")) return "#a9d18e";
  if (n.includes("quiosque a")) return "#d9eaf7";
  if (n.includes("quiosque b")) return "#d9ead3";
  if (n.includes("quiosque c")) return "#d9d2e9";
  if (n.includes("cancha 48")) return "#c9daf8";
  if (n.includes("quiosque")) return "#d9eaf7";
  return "#ddebf7";
}

function escapeHtml(valor: unknown) {
  return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
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
  const gradeScrollBarRef = useRef<HTMLDivElement>(null);
  const gradeScrollContentRef = useRef<HTMLDivElement>(null);
  const gradeTableScrollRef = useRef<HTMLDivElement>(null);
  const gradeTableRef = useRef<HTMLTableElement>(null);
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

  // Mantém uma barra de rolagem horizontal sempre visível acima da grade,
  // sincronizada com a tabela para facilitar a navegação entre todos os espaços.
  useEffect(() => {
    const barra = gradeScrollBarRef.current;
    const conteudoBarra = gradeScrollContentRef.current;
    const viewport = gradeTableScrollRef.current;
    const tabela = gradeTableRef.current;
    if (!barra || !conteudoBarra || !viewport || !tabela) return;

    const atualizarLargura = () => {
      const largura = Math.max(tabela.scrollWidth, viewport.clientWidth);
      conteudoBarra.style.width = `${largura}px`;
      if (barra.scrollLeft !== viewport.scrollLeft) barra.scrollLeft = viewport.scrollLeft;
    };
    const aoRolarBarra = () => {
      if (viewport.scrollLeft !== barra.scrollLeft) viewport.scrollLeft = barra.scrollLeft;
    };
    const aoRolarTabela = () => {
      if (barra.scrollLeft !== viewport.scrollLeft) barra.scrollLeft = viewport.scrollLeft;
    };

    atualizarLargura();
    barra.addEventListener("scroll", aoRolarBarra, { passive: true });
    viewport.addEventListener("scroll", aoRolarTabela, { passive: true });
    window.addEventListener("resize", atualizarLargura);
    const observador = typeof ResizeObserver !== "undefined" ? new ResizeObserver(atualizarLargura) : null;
    observador?.observe(tabela);
    observador?.observe(viewport);
    return () => {
      barra.removeEventListener("scroll", aoRolarBarra);
      viewport.removeEventListener("scroll", aoRolarTabela);
      window.removeEventListener("resize", atualizarLargura);
      observador?.disconnect();
    };
  }, [espacos.length, dataInicial, dataFinal, carregando, visualizacao, reservas.length]);

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

  const reservasLimpeza = useMemo(
    () => reservas.filter((r) => r.status !== "cancelada").slice().sort((a, b) =>
      a.data_reserva.localeCompare(b.data_reserva) ||
      a.hora_inicio.localeCompare(b.hora_inicio) ||
      a.espaco_nome.localeCompare(b.espaco_nome, "pt-BR")
    ),
    [reservas],
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
    if (periodoRapido === "mes") {
      const datas = datasDoPeriodo("mes", anoSelecionado, mes, hoje);
      if (datas) {
        setDataInicial(datas.inicio);
        setDataFinal(datas.fim);
      }
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

  function obterEspacosGrade(): EspacoFiltro[] {
    const base = espacos.length
      ? espacos
      : Array.from(new Map(reservas.map((r) => [r.espaco_id || r.espaco_nome, {
          id: r.espaco_id,
          nome: r.espaco_nome,
          categoria: r.categoria,
        }])).values());
    return ordenarEspacos(base);
  }

  function exportarExcelGrade() {
    if (!(visualizacao === "administrativo" && periodoRapido === "mes" && dataInicial.slice(0, 7) === dataFinal.slice(0, 7))) return;
    const [anoGrade, mesGrade] = dataInicial.slice(0, 7).split("-").map(Number);
    const dias = new Date(anoGrade, mesGrade, 0).getDate();
    const espacosGrade = obterEspacosGrade();
    const ativos = reservas.filter((r) => r.status !== "cancelada");
    const cabecalhoEspacos = espacosGrade.map((e) => `<th colspan="3" style="background:${corCabecalhoEspaco(e.nome)};border:1px solid #64748b;text-align:center;padding:8px;font-weight:bold">${escapeHtml(e.nome)}</th>`).join("");
    const subCabecalho = espacosGrade.map((e) => {
      const cor = corCabecalhoEspaco(e.nome);
      return ["Nome", "Motivo", "Pagamento"].map((sub) => `<th style="background:${cor};border:1px solid #94a3b8;text-align:left;padding:5px;font-size:10pt">${sub}</th>`).join("");
    }).join("");
    const linhas = Array.from({ length: dias }, (_, i) => {
      const dia = i + 1;
      const data = `${anoGrade}-${String(mesGrade).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      const reservasDia = ativos.filter((r) => r.data_reserva === data);
      const celulas = espacosGrade.map((espaco) => {
        const itens = reservasDia.filter((r) => r.espaco_id && espaco.id ? r.espaco_id === espaco.id : r.espaco_nome === espaco.nome);
        if (!itens.length) return `<td colspan="3" style="border:1px solid #cbd5e1;padding:6px;color:#94a3b8">Livre</td>`;
        const nomes = itens.map((r) => `<div style="padding:2px 0"><b>${escapeHtml(r.responsavel_nome || "Responsável não informado")}</b><br/><span style="color:#64748b;font-size:9pt">${escapeHtml(horarioExibicao(r))} · ${escapeHtml(statusBR(r.status))}</span></div>`).join("<hr style='border:0;border-top:1px solid #e2e8f0'/>");
        const motivos = itens.map((r) => `<div style="padding:2px 0">${escapeHtml(r.motivo_locacao || "Não informado")}</div>`).join("<hr style='border:0;border-top:1px solid #e2e8f0'/>");
        const pagamentos = itens.map((r) => {
          const quitado = Boolean(r.data_pagamento);
          const situacao = quitado ? "PAGO" : r.tipo_pagamento === "sem_pagamento" ? "SEM PAGAMENTO" : "PENDENTE";
          return `<div style="padding:2px 0;color:${quitado ? "#166534" : "#92400e"}"><b>${situacao}</b><br/>${escapeHtml(moeda(r.valor))}</div>`;
        }).join("<hr style='border:0;border-top:1px solid #e2e8f0'/>");
        const fundo = itens.every((r) => Boolean(r.data_pagamento)) ? "#f0fdf4" : "#fffbeb";
        return `<td style="vertical-align:top;background:${fundo};border:1px solid #cbd5e1;padding:6px;min-width:145px">${nomes}</td><td style="vertical-align:top;background:${fundo};border:1px solid #cbd5e1;padding:6px;min-width:130px">${motivos}</td><td style="vertical-align:top;background:${fundo};border:1px solid #cbd5e1;padding:6px;min-width:120px">${pagamentos}</td>`;
      }).join("");
      return `<tr><td style="vertical-align:top;background:#f8fafc;border:1px solid #cbd5e1;padding:6px;white-space:nowrap"><b>${String(dia).padStart(2, "0")}</b><br/><span style="font-size:9pt">${escapeHtml(diaSemanaBR(data))}</span></td>${celulas}</tr>`;
    }).join("\r\n");

    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><meta name="ProgId" content="Excel.Sheet"><meta name="ExcelWorkbook"><style>body{font-family:Arial,sans-serif;color:#1f2937}table{border-collapse:collapse;font-size:10pt}th,td{mso-number-format:"\@"} .titulo{font-size:16pt;font-weight:bold;color:#005a3c;padding:10px}.subtitulo{padding:5px;color:#64748b}</style></head><body><div class="titulo">SOCIEDADE RECREATIVA GUARANI — GRADE MENSAL</div><div class="subtitulo">${escapeHtml(tituloMes(`${dataInicial.slice(0, 7)}-15`))} · Reservas e pagamentos</div><table><thead><tr><th rowspan="2" style="background:#e7f3ec;border:1px solid #64748b;padding:8px">DIA</th>${cabecalhoEspacos}</tr><tr>${subCabecalho}</tr></thead><tbody>${linhas}</tbody></table></body></html>`;
    const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grade-mensal-reservas-${dataInicial.slice(0, 7)}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportarCsv() {
    // A grade CSV usa duas linhas de cabeçalho para agrupar Nome, Motivo e Pagamento por espaço.
    if (visualizacao === "administrativo" && periodoRapido === "mes" && dataInicial.slice(0, 7) === dataFinal.slice(0, 7)) {
      const [anoGrade, mesGrade] = dataInicial.slice(0, 7).split("-").map(Number);
      const dias = new Date(anoGrade, mesGrade, 0).getDate();
      const espacosGrade = obterEspacosGrade();
      const ativos = reservas.filter((r) => r.status !== "cancelada");
      const cabecalhoPrincipal = ["DIA", ...espacosGrade.flatMap((e) => [e.nome, "", ""])];
      const subCabecalho = ["", ...espacosGrade.flatMap(() => ["Nome", "Motivo", "Pagamento"])];
      const linhas = Array.from({ length: dias }, (_, i) => {
        const dia = i + 1;
        const data = `${anoGrade}-${String(mesGrade).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        const rotuloDia = `${String(dia).padStart(2, "0")} - ${diaSemanaBR(data)}`;
        const reservasDia = ativos.filter((r) => r.data_reserva === data);
        const celulas = espacosGrade.flatMap((espaco) => {
          const itens = reservasDia.filter((r) => r.espaco_id && espaco.id ? r.espaco_id === espaco.id : r.espaco_nome === espaco.nome);
          if (!itens.length) return ["Livre", "", ""];
          const nomes = itens.map((r) => `${r.responsavel_nome || "Responsável não informado"}\n${horarioExibicao(r)} · ${statusBR(r.status)}`).join("\n\n");
          const motivos = itens.map((r) => r.motivo_locacao || "Não informado").join("\n\n");
          const pagamentos = itens.map((r) => `${r.data_pagamento ? "PAGO" : r.tipo_pagamento === "sem_pagamento" ? "SEM PAGAMENTO" : "PENDENTE"} · ${moeda(r.valor)}`).join("\n\n");
          return [nomes, motivos, pagamentos];
        });
        return [rotuloDia, ...celulas];
      });
      const csv = [cabecalhoPrincipal, subCabecalho, ...linhas]
        .map((linha) => linha.map((valor) => escapeCsv(String(valor))).join(";"))
        .join("\r\n");
      const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grade-mensal-reservas-${dataInicial.slice(0, 7)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (visualizacao === "limpeza") {
      const cabecalho = ["Data", "Dia da semana", "Espaço", "Horário", "Responsável / associado", "Situação", "Lista de presença", "Quantidade de convidados"];
      const linhas = reservasLimpeza.map((r) => [
        dataBR(r.data_reserva),
        diaSemanaBR(r.data_reserva),
        r.espaco_nome,
        horarioExibicao(r),
        r.responsavel_nome || "Não informado",
        statusBR(r.status),
        r.lista_presenca_nome ? "Lista anexada" : (r.espaco_nome.toLowerCase().includes("quiosque") ? "Lista não anexada" : "Não se aplica"),
        r.quantidade_convidados == null ? "" : String(r.quantidade_convidados),
      ]);
      const csv = [cabecalho, ...linhas].map((linha) => linha.map((valor) => escapeCsv(String(valor))).join(";")).join("\r\n");
      const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agenda-limpeza-${dataInicial}-${dataFinal}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const cabecalho = ["Data", "Horário", "Espaço", "Motivo da locação", "Responsável", "Matrícula", "Reservado por", "Perfil de quem reservou", "Tipo", "Pagamento", "Status", "Valor", "Data pagamento", "Lista de presença", "Qtd. convidados", "Comprovante"];
    const linhas = reservas.map((r) => [
      dataBR(r.data_reserva),
      horarioExibicao(r),
      r.espaco_nome,
      r.motivo_locacao || "",
      r.responsavel_nome,
      r.matricula || "",
      r.reservado_por_nome || "Não registrado (histórico anterior)",
      r.reservado_por_perfil || "",
      r.tipo_pessoa === "nao_socio" ? "Não sócio" : "Sócio",
      pagamentoBR(r.tipo_pagamento),
      statusBR(r.status),
      r.valor.toFixed(2).replace(".", ","),
      r.data_pagamento ? dataBR(r.data_pagamento) : "",
      r.lista_presenca_nome || "",
      r.quantidade_convidados == null ? "" : String(r.quantidade_convidados),
      r.comprovante_status || "",
    ]);
    const csv = [cabecalho, ...linhas].map((linha) => linha.map((valor) => escapeCsv(String(valor))).join(";")).join("\r\n");
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
        @page { size: landscape; margin: 10mm; }
        @media print {
          body { background: white !important; }
          header, aside { display: none !important; }
          .nao-imprimir { display: none !important; }
          .relatorio-reservas-print { margin: 0 !important; max-width: none !important; padding: 0 !important; }
          .sombra-impressao { box-shadow: none !important; border: 1px solid #dfe7e2 !important; }
          .agenda-limpeza-print { box-shadow: none !important; border: 0 !important; padding: 0 !important; }
          .limpeza-mes { break-inside: auto; page-break-inside: auto; }
          .limpeza-mes tr { break-inside: avoid; page-break-inside: avoid; }
          .limpeza-mes h3 { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <main className="relatorio-reservas-print mx-auto max-w-[1500px] px-6 py-8 lg:ml-[220px]">
        <div className="nao-imprimir mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <Link href="/relatorios" className="mb-3 inline-block text-sm font-semibold text-[#005a3c]">← Voltar aos relatórios</Link>
            <p className="text-sm font-medium text-gray-500">Administração</p>
            <h1 className="mt-1 flex items-center gap-2 text-3xl font-extrabold text-[#005a3c]"><><CalendarDays className="h-8 w-8" /> Agenda mensal de reservas</></h1>
            <p className="mt-1 text-gray-500">&quot;Veja todos os dias do mês, quais espaços estão reservados, por quem, o valor e a situação do pagamento.&quot;</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void carregar(visualizacao === "limpeza" ? { status: "todos", pagamento: "todos", tipoPessoa: "todos" } : {})} disabled={carregando} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd9d2] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] shadow-sm disabled:opacity-60"><RefreshCw className="h-4 w-4" /> Atualizar</button>
            {visualizacao === "administrativo" && periodoRapido === "mes" && dataInicial.slice(0, 7) === dataFinal.slice(0, 7) && <button onClick={exportarExcelGrade} disabled={carregando} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd9d2] bg-[#e8f3ee] px-4 py-3 text-sm font-bold text-[#005a3c] shadow-sm"><Download className="h-4 w-4" /> Excel colorido</button>}<button onClick={exportarCsv} disabled={carregando} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd9d2] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] shadow-sm"><Download className="h-4 w-4" /> Exportar {visualizacao === "limpeza" ? "agenda CSV" : "CSV"}</button>
            <button onClick={imprimir} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white shadow-sm"><Printer className="h-4 w-4" /> Imprimir / PDF</button>
          </div>
        </div>

        <section className="nao-imprimir mb-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
          <div className="mb-4"><h2 className="font-extrabold text-[#003d2b]">Período e filtros</h2><p className="mt-1 text-sm text-gray-500">Escolha um ano inteiro, os meses restantes até dezembro, um mês específico ou um período personalizado.</p></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold text-gray-600">Ano<select value={anoSelecionado} onChange={(e) => mudarAno(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]">{Array.from({ length: anoAtual - 2000 + 11 }, (_, i) => 2000 + i).map((ano) => <option key={ano} value={String(ano)}>{ano}</option>)}</select></label>
            <label className="text-sm font-semibold text-gray-600">Período<select value={periodoRapido} onChange={(e) => aplicarPeriodo(e.target.value as PeriodoRapido)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]"><option value="mes">Mês inteiro</option><option value="ano">Ano inteiro</option><option value="restante">Meses restantes até dezembro</option><option value="personalizado">Período personalizado</option></select></label>
            {periodoRapido === "mes" && <label className="text-sm font-semibold text-gray-600">Mês<select value={mesSelecionado} onChange={(e) => mudarMes(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]">{MESES.map((mes, i) => <option key={mes} value={String(i + 1)}>{mes}</option>)}</select></label>}
            <label className="text-sm font-semibold text-gray-600">Data inicial<input type="date" value={dataInicial} onChange={(e) => { setDataInicial(e.target.value); setPeriodoRapido("personalizado"); }} className="mt-2 w-full rounded-xl border border-[#d5e0da] px-3 py-3 outline-none focus:border-[#005a3c]" /></label>
            <label className="text-sm font-semibold text-gray-600">Data final<input type="date" value={dataFinal} onChange={(e) => { setDataFinal(e.target.value); setPeriodoRapido("personalizado"); }} className="mt-2 w-full rounded-xl border border-[#d5e0da] px-3 py-3 outline-none focus:border-[#005a3c]" /></label>
            {visualizacao === "administrativo" && <label className="text-sm font-semibold text-gray-600">Status<select value={status} onChange={(e) => setStatus(e.target.value as "todos" | Status)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]"><option value="todos">Todos</option><option value="confirmada">Confirmadas</option><option value="pendente">Pendentes</option><option value="cancelada">Canceladas</option></select></label>}
            {visualizacao === "administrativo" && <label className="text-sm font-semibold text-gray-600">Pagamento<select value={pagamento} onChange={(e) => setPagamento(e.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none focus:border-[#005a3c]"><option value="todos">Todos</option><option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="debito_em_conta">Débito em conta</option><option value="boleto">Boleto</option><option value="cartao">Cartão</option><option value="outro">Outro</option><option value="sem_pagamento">Sem pagamento</option></select></label>}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {visualizacao === "administrativo" && <label className="text-sm font-semibold text-gray-600">Tipo de pessoa<select value={tipoPessoa} onChange={(e) => setTipoPessoa(e.target.value)} className="ml-2 rounded-xl border border-[#d5e0da] bg-white px-3 py-2"><option value="todos">Todos</option><option value="socio">Sócio</option><option value="nao_socio">Não sócio</option></select></label>}
            <label className="text-sm font-semibold text-gray-600">Espaço<select value={espacoId} onChange={(e) => setEspacoId(e.target.value)} className="ml-2 rounded-xl border border-[#d5e0da] bg-white px-3 py-2"><option value="todos">Todos os espaços</option>{espacos.map((e) => <option key={e.id || e.nome} value={e.id || "todos"}>{e.nome}</option>)}</select></label>
            <button onClick={() => void carregar(visualizacao === "limpeza" ? { status: "todos", pagamento: "todos", tipoPessoa: "todos" } : {})} className="rounded-xl bg-[#005a3c] px-5 py-2.5 text-sm font-bold text-white">Gerar {visualizacao === "limpeza" ? "agenda" : "relatório"}</button>
          </div>
        </section>

        {erro && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{erro}</div>}

        {carregando ? (
          <div className="rounded-2xl border bg-white p-12 text-center text-gray-500 shadow-sm">Carregando relatório de reservas...</div>
        ) : (
          <>
            {periodoRapido === "mes" && dataInicial.slice(0,7) === dataFinal.slice(0,7) && (() => {
              const [anoGrade, mesGrade] = dataInicial.slice(0,7).split("-").map(Number);
              const dias = new Date(anoGrade, mesGrade, 0).getDate();
              const espacosGrade = obterEspacosGrade();
              const ativos = reservas.filter(r => r.status !== "cancelada");
              return <section className="mb-6 overflow-hidden rounded-2xl border border-[#cbd9d2] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-[#e7f3ec] p-4"><div><p className="text-xs font-bold uppercase tracking-widest text-[#005a3c]">Sociedade Recreativa Guarani</p><h2 className="text-xl font-extrabold capitalize text-[#005a3c]">{tituloMes(`${dataInicial.slice(0,7)}-15`)}</h2><p className="text-sm text-gray-600">Grade mensal · reservas e pagamentos</p></div><div className="flex flex-wrap gap-3 text-xs font-bold"><span className="rounded-full bg-green-100 px-3 py-2 text-green-800">● Pago</span><span className="rounded-full bg-amber-100 px-3 py-2 text-amber-800">● Pendente</span><span className="rounded-full bg-gray-100 px-3 py-2 text-gray-700">— Livre</span></div></div>
                <div className="border-b border-[#dfe7e2] bg-[#f8faf9] px-3 py-2">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span>Use a barra para navegar por todos os espaços →</span>
                    <span>Para preservar as cores ao exportar, use “Excel colorido”.</span>
                  </div>
                  <div ref={gradeScrollBarRef} aria-label="Barra de rolagem horizontal da grade mensal" title="Role para a direita para ver os demais espaços" className="h-4 w-full cursor-ew-resize overflow-x-scroll overflow-y-hidden rounded border border-[#cbd5e1] bg-[#e2e8f0]">
                    <div ref={gradeScrollContentRef} className="h-2" style={{ width: "1200px" }} />
                  </div>
                </div>
                <div ref={gradeTableScrollRef} className="overflow-x-auto"><table ref={gradeTableRef} className="w-max min-w-full border-collapse text-sm"><thead><tr className="text-left text-xs uppercase text-gray-700"><th rowSpan={2} className="sticky left-0 z-20 border-b border-r bg-[#e7f3ec] p-3">Dia</th>{espacosGrade.map((e) => <th key={e.id || e.nome} colSpan={3} style={{ backgroundColor: corCabecalhoEspaco(e.nome) }} className="min-w-[390px] border-b border-r p-3 text-center">{e.nome}</th>)}</tr><tr className="text-left text-[10px] font-bold uppercase text-gray-700">{espacosGrade.map((e) => ["Nome", "Motivo", "Pagamento"].map((sub) => <th key={`${e.id || e.nome}-${sub}`} style={{ backgroundColor: corCabecalhoEspaco(e.nome) }} className="border-b border-r px-2 py-2">{sub}</th>))}</tr></thead><tbody>{Array.from({ length: dias }, (_, i) => { const dia = i + 1; const data = `${anoGrade}-${String(mesGrade).padStart(2, "0")}-${String(dia).padStart(2, "0")}`; const reservasDia = ativos.filter((r) => r.data_reserva === data); return <tr key={data} className="align-top odd:bg-white even:bg-[#fbfcfb]"><td className="sticky left-0 z-10 border-b border-r bg-[#f7faf8] p-3"><b>{String(dia).padStart(2, "0")}</b><div className="text-xs capitalize text-gray-500">{diaSemanaBR(data)}</div></td>{espacosGrade.map((e) => { const itens = reservasDia.filter((r) => r.espaco_id && e.id ? r.espaco_id === e.id : r.espaco_nome === e.nome); if (!itens.length) return <td key={e.id || e.nome} colSpan={3} className="border-b border-r p-2 text-xs text-gray-300">Livre</td>; const fundo = itens.every((r) => Boolean(r.data_pagamento)) ? "bg-green-50" : "bg-amber-50"; return <Fragment key={e.id || e.nome}><td className={`min-w-[145px] border-b border-r p-2 ${fundo}`}>{itens.map((r) => <div key={r.id} className="mb-2 border-b border-white/80 pb-2 last:mb-0 last:border-0 last:pb-0"><div className="font-bold text-[#17382c]">{r.responsavel_nome || "Responsável não informado"}</div><div className="text-xs text-gray-600">{horarioExibicao(r)} · {statusBR(r.status)}</div>{r.reservado_por_nome && <div className="mt-1 text-[10px] text-gray-500">Por: {r.reservado_por_nome}</div>}</div>)}</td><td className={`min-w-[125px] border-b border-r p-2 text-xs ${fundo}`}>{itens.map((r) => <div key={r.id} className="mb-2 border-b border-white/80 pb-2 last:mb-0 last:border-0 last:pb-0">{r.motivo_locacao || <span className="text-gray-400">Não informado</span>}</div>)}</td><td className={`min-w-[120px] border-b border-r p-2 text-xs ${fundo}`}>{itens.map((r) => <div key={r.id} className="mb-2 border-b border-white/80 pb-2 last:mb-0 last:border-0 last:pb-0"><b className={r.data_pagamento ? "text-green-700" : "text-amber-800"}>{r.data_pagamento ? "PAGO" : r.tipo_pagamento === "sem_pagamento" ? "SEM PAGAMENTO" : "PENDENTE"}</b><div className="font-bold">{moeda(r.valor)}</div></div>)}</td></Fragment>; })}</tr>; })}</tbody></table></div>
                <div className="border-t bg-[#f7faf8] p-3 text-xs text-gray-500">{ativos.length} reserva(s) ativa(s) no período · Valores e pagamento conforme os dados registrados na reserva. Confirme no Financeiro em caso de dúvida.</div>
              </section>;
            })()}
            {visualizacao === "limpeza" ? (
              <section className="agenda-limpeza-print rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                <div className="mb-5 border-b border-[#dfe7e2] pb-4">
                  <p className="text-xs font-extrabold uppercase tracking-widest text-[#005a3c]">Sociedade Recreativa Guarani — S.R.G.</p>
                  <h2 className="mt-1 text-2xl font-extrabold text-[#005a3c]">Agenda mensal de reservas</h2>
                  <p className="mt-1 text-sm text-gray-600">Período: {dataBR(dataInicial)} a {dataBR(dataFinal)} · Reservas confirmadas e pendentes; canceladas não aparecem.</p>
                  <p className="mt-1 text-xs text-gray-500">Visão mensal dos espaços reservados, responsável, valor e situação do pagamento.</p>
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
              <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead><tr className="border-b bg-[#eef6f1] text-left text-xs font-bold uppercase tracking-wide text-gray-600"><th className="px-3 py-3">Data</th><th>Espaço</th><th>Motivo da locação</th><th>Responsável</th><th>Reservado por</th><th>Tipo</th><th>Pagamento</th><th>Status</th><th>Lista de presença</th><th className="text-right">Valor</th></tr></thead><tbody>{reservas.map((r) => <tr key={r.id} className="border-b last:border-b-0"><td className="px-3 py-3 whitespace-nowrap"><b>{dataBR(r.data_reserva)}</b><div className="text-xs text-gray-500">{horarioExibicao(r)}</div></td><td className="font-semibold">{r.espaco_nome}</td><td>{r.motivo_locacao || "—"}</td><td><b>{r.responsavel_nome || "—"}</b><div className="text-xs text-gray-500">{r.matricula || "—"}</div></td><td><b>{r.reservado_por_nome || "Não registrado"}</b><div className="text-xs text-gray-500">{r.reservado_por_perfil || "Registro anterior à auditoria"}</div></td><td>{r.tipo_pessoa === "nao_socio" ? "Não sócio" : "Sócio"}</td><td>{pagamentoBR(r.tipo_pagamento)}</td><td><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${r.status === "confirmada" ? "bg-green-100 text-green-700" : r.status === "pendente" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>{statusBR(r.status)}</span></td><td>{r.lista_presenca_url ? <a href={r.lista_presenca_url} target="_blank" rel="noreferrer" className="font-semibold text-[#005a3c] underline">{r.lista_presenca_nome || "Abrir lista"}{r.quantidade_convidados != null ? ` (${r.quantidade_convidados}/16)` : ""}</a> : r.lista_presenca_nome || "—"}</td><td className="text-right font-extrabold text-[#005a3c]">{moeda(r.valor)}</td></tr>)}</tbody></table>{!reservas.length && <p className="py-10 text-center text-gray-500">Nenhuma reserva encontrada para os filtros selecionados.</p>}</div>
            </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

