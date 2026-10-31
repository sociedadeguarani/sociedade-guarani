"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Settings2, X, Save, CreditCard, Percent } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import RegistrarPagamentoMensalidade from "./components/RegistrarPagamentoMensalidade";
import { socioElegivelParaMensalidade } from "@/lib/regrasMensalidade";

// Captura o instante de referência fora da renderização para que os cálculos
// de status não dependam de uma função impura chamada a cada render.
const INSTANTE_REFERENCIA_MS = Date.now();

type Socio = {
  id: string;
  nome: string;
  matricula?: string | number | null;
  cpf?: string | null;
  categoria?: string | null;
  tipo_socio?: string | null;
  responsavel_id?: string | null;
  possui_mensalidade?: boolean | null;
  situacao?: string | null;
  ativo?: boolean | null;
  tipo_pagamento?: string | null;
  conta_bancaria_id?: string | null;
  dia_vencimento?: number | null;
};

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
  updated_at?: string | null;
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

function rotuloTipoSocio(tipo?: string | null) {
  if (!tipo) return "Não informado";
  if (nomes[tipo]) return nomes[tipo];
  return tipo
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letra) => letra.toUpperCase());
}

/** Busca tolerante a acentos e diferenças de formatação em CPF/matrícula. */
function normalizarBusca(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function compactarBusca(valor: unknown): string {
  return normalizarBusca(valor).replace(/[^a-z0-9]/g, "");
}

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
  if (s === "nao_gerada") return ["Não gerada", "bg-gray-100 text-gray-600"];
  if (s === "pago") return ["Pago", "bg-green-100 text-green-700"];
  if (s === "isento") return ["Isento", "bg-gray-100 text-gray-600"];
  if (s === "em_atraso")
    return ["Atrasada", "bg-red-100 text-red-700"];
  return ["Em aberto", "bg-yellow-100 text-yellow-700"];
}

function ehSemSaldo(item: Pick<M, "situacao" | "motivo" | "observacoes">) {
  if (item.situacao === "pago") return false;
  const texto = `${item.motivo || ""} ${item.observacoes || ""}`.toLowerCase();
  return texto.includes("s.s") || texto.includes("sem saldo") || texto.includes("sem_saldo");
}

const PREFIXO_HISTORICO_IMPORTADO = "MIGRACAO_HISTORICO_58_PAGINAS";

function ehObservacaoHistoricoImportado(texto?: string | null) {
  return String(texto || "").startsWith(PREFIXO_HISTORICO_IMPORTADO);
}

function resumoObservacaoMensalidade(texto?: string | null) {
  const valor = String(texto || "").trim();
  if (!valor) return "";
  if (!ehObservacaoHistoricoImportado(valor)) return valor;

  const formaOriginal = valor.match(/Forma original:\s*([^|]+)/i)?.[1]?.trim();
  return formaOriginal
    ? `Histórico importado · ${formaOriginal}`
    : "Histórico importado";
}

function competenciaNaoGeradaAtrasada(item: Pick<M, "situacao" | "competencia" | "socio">) {
  if (item.situacao !== "nao_gerada") return false;

  const competencia = String(item.competencia || "").slice(0, 7);
  const [anoCompetencia, mesCompetencia] = competencia.split("-").map(Number);
  if (!Number.isInteger(anoCompetencia) || mesCompetencia < 1 || mesCompetencia > 12) return false;

  // Segue a mesma regra do gerador: dia configurado, limitado a 28; padrão dia 10.
  const diaConfigurado = Number(item.socio?.dia_vencimento || 10);
  const diaVencimento = Math.min(Math.max(diaConfigurado, 1), 28);
  const vencimento = new Date(anoCompetencia, mesCompetencia - 1, diaVencimento, 23, 59, 59, 999);
  return vencimento.getTime() < Date.now();
}

function statusMensalidade(item: M, semSaldoPermitido = false) {
  if (semSaldoPermitido && ehSemSaldo(item)) return ["S.S", "bg-amber-100 text-amber-700"];
  if (competenciaNaoGeradaAtrasada(item)) {
    return ["Atrasada · não gerada", "bg-red-100 text-red-700"];
  }
  return status(item.situacao);
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
  // A tela permite consultar uma ou várias competências do mesmo ano.
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [mesesSelecionados, setMesesSelecionados] = useState<number[]>([hoje.getMonth() + 1]);
  const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const [busca, setBusca] = useState("");
  const [filtroTipoSocio, setFiltroTipoSocio] = useState("todos");
  const [filtroSituacaoMensalidade, setFiltroSituacaoMensalidade] = useState("todas");
  const [cobrancasSelecionadas, setCobrancasSelecionadas] = useState<string[]>([]);
  const [lista, setLista] = useState<M[]>([]);
  const [carregandoMensalidades, setCarregandoMensalidades] = useState(true);
  const [preparandoMensalidadesAutomaticamente, setPreparandoMensalidadesAutomaticamente] = useState(false);
  const [socios, setSocios] = useState<Socio[]>([]);
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

  const competenciasEmCriacaoRef = useRef<Set<string>>(new Set());
  const [socioSelecionado, setSocioSelecionado] = useState<M | null>(null);
  const [abrirConfirmacaoBaixa, setAbrirConfirmacaoBaixa] = useState(false);
  const [contaRecebimentoSelecionada, setContaRecebimentoSelecionada] = useState("");
  const [historicoSocio, setHistoricoSocio] = useState<M[]>([]);
  const [carregandoHistoricoSocio, setCarregandoHistoricoSocio] = useState(false);
  const [mesHistoricoSelecionado, setMesHistoricoSelecionado] = useState<number | null>(null);
  const [mesesHistoricoSelecionadosBaixa, setMesesHistoricoSelecionadosBaixa] = useState<number[]>([]);
  const [processandoBaixaHistorico, setProcessandoBaixaHistorico] = useState(false);
  const [anoHistoricoSocio, setAnoHistoricoSocio] = useState(hoje.getFullYear());
  const [tipoBaixaSelecionada, setTipoBaixaSelecionada] = useState<"pago" | "sem_saldo">("pago");
  const [processandoBaixa, setProcessandoBaixa] = useState(false);
  const [pagamentoMensalidade, setPagamentoMensalidade] = useState<M | null>(null);

  // Índice reutilizável evita varrer a lista de contas em cada linha filtrada.
  const contasPorId = useMemo(
    () => new Map(contas.map((conta) => [String(conta.id), conta] as const)),
    [contas]
  );

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

  async function carregarHistoricoSocio(item: M | null, anoConsulta = anoHistoricoSocio, mesInicial = mes) {
    if (!item?.socio_id) {
      setHistoricoSocio([]);
      setMesHistoricoSelecionado(null);
      return;
    }

    setCarregandoHistoricoSocio(true);
    try {
      const r = await fetch(
        `/api/mensalidades/admin?ano=${anoConsulta}&mes=0&socio_id=${encodeURIComponent(String(item.socio_id))}`,
        {
          headers: await h(),
          cache: "no-store",
        }
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Não foi possível carregar o histórico.");

      setHistoricoSocio(Array.isArray(d.mensalidades) ? d.mensalidades : []);
      setMesHistoricoSelecionado(anoConsulta === ano ? mesInicial : 1);
    } catch (e) {
      console.error(e);
      setHistoricoSocio([]);
      setMesHistoricoSelecionado(anoConsulta === ano ? mesInicial : 1);
    } finally {
      setCarregandoHistoricoSocio(false);
    }
  }

  async function abrirDetalhesSocio(item: M) {
    setSocioSelecionado(item);
    setMesesHistoricoSelecionadosBaixa([]);
    setAnoHistoricoSocio(ano);
    setTipoBaixaSelecionada("pago");
    const mesDaLinha = Number(String(item.competencia || "").slice(5, 7)) || mes;
    await carregarHistoricoSocio(item, ano, mesDaLinha);
  }

  async function trocarAnoHistoricoSocio(novoAno: number) {
    setAnoHistoricoSocio(novoAno);
    setMesesHistoricoSelecionadosBaixa([]);
    if (socioSelecionado) {
      await carregarHistoricoSocio(socioSelecionado, novoAno);
    }
  }

  function alternarMesHistoricoParaBaixa(numeroMes: number) {
    const registro = historicoPorMes.get(numeroMes);
    if (!registro || registro.situacao === "pago" || registro.situacao === "isento" || String(registro.id).startsWith("virtual-")) {
      return;
    }
    setMesesHistoricoSelecionadosBaixa((atuais) =>
      atuais.includes(numeroMes)
        ? atuais.filter((m) => m !== numeroMes)
        : [...atuais, numeroMes].sort((a, b) => a - b)
    );
  }

  async function gerarCompetenciaAtualDoHistorico() {
    if (!socioSelecionado || processandoBaixaHistorico) return;
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;
    if (anoHistoricoSocio !== anoAtual || mesHistoricoSelecionado !== mesAtual || historicoPorMes.has(mesAtual)) return;

    setProcessandoBaixaHistorico(true);
    setErro("");
    setMsg("");
    try {
      const r = await fetch("/api/mensalidades/admin", {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({
          acao: "gerar",
          ano: anoAtual,
          mes: mesAtual,
          socio_ids: [String(socioSelecionado.socio_id)],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Não foi possível gerar a mensalidade do mês vigente.");
      await carregar();
      await carregarHistoricoSocio(socioSelecionado, anoHistoricoSocio, mesAtual);
      setMsg(d.message || `Mensalidade de ${String(mesAtual).padStart(2, "0")}/${anoAtual} gerada. Agora você pode registrar o pagamento.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar a mensalidade do mês vigente.");
    } finally {
      setProcessandoBaixaHistorico(false);
    }
  }

  async function baixarMesesDoHistorico() {
    if (!socioSelecionado || processandoBaixaHistorico) return;
    const registros = mesesHistoricoSelecionadosBaixa
      .map((numeroMes) => historicoPorMes.get(numeroMes))
      .filter((item): item is M => Boolean(item && item.situacao !== "pago" && item.situacao !== "isento" && !String(item.id).startsWith("virtual-")));
    if (!registros.length) {
      setErro("Selecione pelo menos uma mensalidade gerada e ainda não paga.");
      return;
    }
    const competencias = registros.map((item) => String(item.competencia || "").slice(5, 7) + "/" + String(item.competencia || "").slice(0, 4));
    if (!window.confirm(`Confirmar o pagamento de ${registros.length} mensalidade(s) de ${socioSelecionado.socio?.nome || "este associado"}?\n\nCompetências: ${competencias.join(", ")}\n\nA baixa será registrada no Financeiro.`)) return;

    setProcessandoBaixaHistorico(true);
    setErro("");
    setMsg("");
    try {
      const r = await fetch("/api/mensalidades/admin", {
        method: "POST",
        headers: await h(),
        body: JSON.stringify({
          acao: "baixar",
          ids: registros.map((item) => item.id),
          data_pagamento: new Date().toISOString().slice(0, 10),
          ...(contaRecebimentoSelecionada ? { conta_recebimento_id: contaRecebimentoSelecionada } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Não foi possível registrar a baixa das mensalidades selecionadas.");
      setMesesHistoricoSelecionadosBaixa([]);
      setMsg(d.message || `${registros.length} mensalidade(s) baixada(s) com sucesso.`);
      await carregar();
      await carregarHistoricoSocio(socioSelecionado, anoHistoricoSocio, mesHistoricoSelecionado || hoje.getMonth() + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a baixa das mensalidades selecionadas.");
    } finally {
      setProcessandoBaixaHistorico(false);
    }
  }

  async function alterarMensalidadeDoModal(acao: "baixar" | "marcar_sem_saldo" | "estornar") {
    const registro = mesHistoricoSelecionado
      ? historicoPorMes.get(mesHistoricoSelecionado) || null
      : null;

    if (!registro || String(registro.id).startsWith("virtual-")) {
      setErro("Esta competência ainda não possui uma mensalidade gerada.");
      return;
    }

    const competenciaTexto = `${String(mesHistoricoSelecionado || 1).padStart(2, "0")}/${anoHistoricoSocio}`;
    const nome = registro.socio?.nome || socioSelecionado?.socio?.nome || "este associado";

    if (acao === "baixar") {
      const ok = window.confirm(
        `Confirmar pagamento da mensalidade de ${competenciaTexto} de ${nome}?\n\nA baixa será registrada no Financeiro.`
      );
      if (!ok) return;
    } else if (acao === "marcar_sem_saldo") {
      const ok = window.confirm(
        `Marcar a mensalidade de ${competenciaTexto} de ${nome} como S.S — Sem saldo?\n\nNenhum lançamento financeiro será criado.`
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        `Estornar o pagamento da mensalidade de ${competenciaTexto} de ${nome}?`
      );
      if (!ok) return;
    }

    setErro("");
    setMsg("");

    try {
      const body = acao === "baixar"
        ? {
            acao: "baixar",
            ids: [registro.id],
            data_pagamento: new Date().toISOString().slice(0, 10),
          }
        : acao === "marcar_sem_saldo"
          ? {
              acao: "marcar_sem_saldo",
              ids: [registro.id],
              motivo: "S.S",
              observacoes: "S.S — Sem saldo",
            }
          : { acao: "estornar", id: registro.id };

      const r = await fetch("/api/mensalidades/admin", {
        method: "POST",
        headers: await h(),
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Não foi possível atualizar a mensalidade.");

      setMsg(d.message || "Mensalidade atualizada com sucesso.");
      await carregar();
      if (socioSelecionado) {
        await carregarHistoricoSocio(socioSelecionado, anoHistoricoSocio);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar a mensalidade.");
    }
  }

  async function carregar() {
    setCarregandoMensalidades(true);
    try {
      setErro("");
      const mesesConsulta: number[] = [...new Set<number>(mesesSelecionados)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
      if (mesesConsulta.length === 0) return;

      // Faz uma consulta por competência para não atingir o limite de linhas
      // da API quando vários meses são selecionados.
      const headers = await h();
      const respostas = await Promise.all(mesesConsulta.map(async (mesConsulta) => {
        const r = await fetch(
          `/api/mensalidades/admin?ano=${ano}&mes=${mesConsulta}`,
          { headers, cache: "no-store" }
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.error || `Erro ao carregar mensalidades de ${String(mesConsulta).padStart(2, "0")}/${ano}.`);
        return d;
      }));

      const d = respostas[0] || {};
      const mensalidadesUnicas = new Map<string, M>();
      respostas.forEach((resposta) => {
        (Array.isArray(resposta.mensalidades) ? resposta.mensalidades : []).forEach((item: M) => {
          mensalidadesUnicas.set(String(item.id), item);
        });
      });

      setLista([...mensalidadesUnicas.values()]);
      setSocios(d.socios || []);
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
    } finally {
      setCarregandoMensalidades(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, [ano, mesesSelecionados]);

  // As mensalidades são criadas automaticamente para todas as competências
  // selecionadas, inclusive futuras. O administrador não precisa executar
  // uma ação de geração para registrar um pagamento antecipado.
  useEffect(() => {
    if (!socios.length || !mesesSelecionados.length) return;

    const elegiveis = socios.filter(socioElegivelParaMensalidade);
    if (!elegiveis.length) return;

    const existentes = new Set(
      lista.map((item) => `${String(item.competencia || "").slice(5, 7)}:${String(item.socio_id)}`)
    );
    const faltantes = [...mesesSelecionados].sort((a, b) => a - b).filter((mesItem) => {
      const chaveCompetencia = `${ano}-${String(mesItem).padStart(2, "0")}`;
      const jaCompleta = elegiveis.every((socio) => existentes.has(`${String(mesItem).padStart(2, "0")}:${String(socio.id)}`));
      return !jaCompleta && !competenciasEmCriacaoRef.current.has(chaveCompetencia);
    });
    if (!faltantes.length) return;

    faltantes.forEach((mesItem) => competenciasEmCriacaoRef.current.add(`${ano}-${String(mesItem).padStart(2, "0")}`));
    setPreparandoMensalidadesAutomaticamente(true);

    void (async () => {
      let houveCriacao = false;
      try {
        for (const mesItem of faltantes) {
          const resposta = await fetch("/api/mensalidades/admin", {
            method: "POST",
            headers: await h(),
            body: JSON.stringify({ acao: "gerar", ano, mes: mesItem }),
          });
          const dados = await resposta.json();
          if (!resposta.ok) throw new Error(dados.error || `Não foi possível preparar ${String(mesItem).padStart(2, "0")}/${ano}.`);
          houveCriacao = true;
        }
        if (houveCriacao) await carregar();
      } catch (erro) {
        setErro(erro instanceof Error ? erro.message : "Não foi possível preparar as mensalidades automaticamente.");
      } finally {
        faltantes.forEach((mesItem) => competenciasEmCriacaoRef.current.delete(`${ano}-${String(mesItem).padStart(2, "0")}`));
        setPreparandoMensalidadesAutomaticamente(false);
      }
    })();
  }, [ano, mesesSelecionados, lista, socios]);

  function atualizarMesesSelecionados(proximos: number[], mesAtivo?: number) {
    const ordenados = [...new Set(proximos)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
    if (ordenados.length === 0) return; // Sempre manter pelo menos uma competência selecionada.
    setMesesSelecionados(ordenados);
    setMes(mesAtivo && ordenados.includes(mesAtivo) ? mesAtivo : ordenados[0]);
    setSel([]);
  }

  function alternarMesSelecionado(mesAlvo: number) {
    const selecionados = mesesSelecionados.includes(mesAlvo)
      ? mesesSelecionados.filter((m) => m !== mesAlvo)
      : [...mesesSelecionados, mesAlvo];
    if (selecionados.length === 0) return;
    atualizarMesesSelecionados(selecionados, mesesSelecionados.includes(mesAlvo) ? selecionados[0] : mesAlvo);
  }

  // A tela usa exatamente a mesma regra da API de geração. Isso impede
  // que dependentes com categoria "Dependente"/"Titular" e um indicador
  // legado possui_mensalidade=true apareçam como cobraveis virtuais.
  const sociosElegiveis = useMemo(
    () => socios.filter(socioElegivelParaMensalidade),
    [socios]
  );

  const dependentesComConflitoMensalidade = useMemo(() => {
    // Tipos estruturados com sufixo _mensalidade são autoritativos: associados
    // promovidos para Sócios podem manter responsavel_id histórico e uma
    // categoria textual genérica, sem que isso seja um conflito de cobrança.
    const tiposComCobrancaPropria = new Set([
      "dependente_patrimonial_familiar_mensalidade",
      "dependente_patrimonial_individual_mensalidade",
      "dependente_contribuinte_familiar_mensalidade",
      "dependente_contribuinte_individual_mensalidade",
    ]);
    return socios.filter((s) => {
      const tipo = String(s.tipo_socio ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
      if (tiposComCobrancaPropria.has(tipo)) return false;
      return Boolean(s.responsavel_id) && s.possui_mensalidade === true && !socioElegivelParaMensalidade(s);
    });
  }, [socios]);

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
    const pagamento = normalizarPagamento(m.tipo_pagamento || m.socio?.tipo_pagamento);

    // PIX/Boleto continuam sendo identificados diretamente pelo lançamento.
    if (pagamento === "pix") return "pix";
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
    const conta = contasPorId.get(String(contaId));
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

  function podeMarcarSemSaldo(item: M) {
    // S.S. é uma característica da cobrança DESTE associado.
    // Só é permitido para boleto ou débito em conta com banco vinculado.
    const pagamentoAssociado = normalizarPagamento(item.socio?.tipo_pagamento);
    const pagamentoRegistro = normalizarPagamento(item.tipo_pagamento);
    const pagamento = pagamentoAssociado || pagamentoRegistro;
    const contaId = String(
      item.conta_pagadora_id || item.socio?.conta_bancaria_id || ""
    ).trim();

    if (pagamento === "boleto") return true;

    if (
      pagamento === "debito_em_conta" ||
      pagamento === "debito" ||
      pagamento === "debito_em_conta_bancaria" ||
      pagamento === "banrisul" ||
      pagamento === "sicredi" ||
      pagamento === "bb" ||
      pagamento === "banco_do_brasil"
    ) {
      return Boolean(contaId);
    }

    return false;
  }

  function situacaoVisual(item: M) {
    if (item.situacao === "em_aberto" && item.data_vencimento) {
      const vencimento = new Date(`${String(item.data_vencimento).slice(0, 10)}T23:59:59`);
      if (!Number.isNaN(vencimento.getTime()) && vencimento.getTime() < INSTANTE_REFERENCIA_MS) {
        return "em_atraso";
      }
    }
    return item.situacao;
  }

  const socioPorId = useMemo(() => {
    const mapa = new Map<string, Socio>();
    socios.forEach((s) => mapa.set(String(s.id), s));
    return mapa;
  }, [socios]);

  // A API retorna também lançamentos antigos de associados que hoje não têm
  // direito a cobrança própria. Eles permanecem preservados no banco e no
  // histórico individual, mas não entram na grade principal de mensalidades.
  const mensalidadesElegiveisParaExibicao = useMemo<M[]>(
    () => lista.filter((item) => {
      const socio = socioPorId.get(String(item.socio_id)) || item.socio;
      // A grade principal mostra somente associados com cobrança própria.
      // Lançamentos antigos de dependentes sem mensalidade ficam preservados
      // no banco e no histórico individual, mas não aparecem nesta lista.
      return Boolean(socio) && socioElegivelParaMensalidade(socio);
    }),
    [lista, socioPorId]
  );

  const linhasExibicao = useMemo<M[]>(() => {
    // Não mostrar estados virtuais "Não gerada" enquanto os dados reais
    // estão carregando ou a API está criando as cobranças automaticamente.
    if (carregandoMensalidades || preparandoMensalidadesAutomaticamente) return [];

    const existentes = new Map<string, M>();
    mensalidadesElegiveisParaExibicao.forEach((item) => {
      const mesItem = Number(String(item.competencia || "").slice(5, 7));
      existentes.set(`${mesItem}:${String(item.socio_id)}`, item);
    });

    // Gera uma linha por associado e competência selecionada. A chave inclui
    // o mês para que o mesmo associado apareça corretamente em vários meses.
    const linhas: M[] = [];
    const mesesOrdenados = [...mesesSelecionados].sort((a, b) => a - b);
    for (const mesItem of mesesOrdenados) {
      for (const socio of sociosElegiveis) {
        const chave = `${mesItem}:${String(socio.id)}`;
        const existente = existentes.get(chave);
        if (existente) {
          linhas.push(existente);
          continue;
        }
        linhas.push({
          id: `virtual-${ano}-${String(mesItem).padStart(2, "0")}-${socio.id}`,
          socio_id: String(socio.id),
          competencia: `${ano}-${String(mesItem).padStart(2, "0")}-01`,
          valor: 0,
          valor_base: null,
          tarifa_pagamento: null,
          multa: 0,
          juros: 0,
          desconto: 0,
          total_cobrado: null,
          data_vencimento: null,
          situacao: "nao_gerada",
          data_pagamento: null,
          tipo_pagamento: socio.tipo_pagamento || null,
          observacoes: null,
          motivo: "Mensalidade ainda não gerada",
          conta_pagadora_id: socio.conta_bancaria_id || null,
          socio,
        });
      }
    }

    return linhas.map((item) => ({ ...item, situacao: situacaoVisual(item) }));
  }, [mensalidadesElegiveisParaExibicao, sociosElegiveis, ano, mesesSelecionados, carregandoMensalidades, preparandoMensalidadesAutomaticamente]);

  const tiposSocioDisponiveis = useMemo<string[]>(() => {
    const tipos = sociosElegiveis
      .map((socio) => String(socio.tipo_socio || "").trim())
      .filter((tipo): tipo is string => tipo.length > 0);
    return [...new Set<string>(tipos)].sort((a, b) =>
      rotuloTipoSocio(a).localeCompare(rotuloTipoSocio(b), "pt-BR")
    );
  }, [sociosElegiveis]);

  const filtrada = useMemo(() => {
    const q = normalizarBusca(busca);
    const qCompacta = compactarBusca(busca);

    return linhasExibicao.filter((x) => {
      const nome = normalizarBusca(x.socio?.nome);
      const matricula = normalizarBusca(x.socio?.matricula);
      const cpf = normalizarBusca(x.socio?.cpf);
      const matriculaCompacta = compactarBusca(x.socio?.matricula);
      const cpfCompacto = compactarBusca(x.socio?.cpf);
      const bateBusca =
        !q ||
        nome.includes(q) ||
        matricula.includes(q) ||
        cpf.includes(q) ||
        (qCompacta.length > 0 &&
          (matriculaCompacta.includes(qCompacta) || cpfCompacto.includes(qCompacta)));

      // Linhas ainda não geradas não devem desaparecer quando um filtro
      // de banco é aplicado: o banco/tipo de cobrança vem do cadastro do sócio.
      const cobrancaAtual = tipoCobranca(x);
      const bateCobranca =
        cobrancasSelecionadas.length === 0 ||
        cobrancasSelecionadas.includes(cobrancaAtual);

      const bateTipoSocio =
        filtroTipoSocio === "todos" || String(x.socio?.tipo_socio || "") === filtroTipoSocio;
      const semSaldo = ehSemSaldo(x);
      const bateSituacao =
        filtroSituacaoMensalidade === "todas" ||
        (filtroSituacaoMensalidade === "sem_saldo"
          ? semSaldo
          : !semSaldo && (
              String(x.situacao || "") === filtroSituacaoMensalidade ||
              (filtroSituacaoMensalidade === "em_atraso" && competenciaNaoGeradaAtrasada(x))
            ));

      return bateBusca && bateCobranca && bateTipoSocio && bateSituacao;
    });
  }, [
    linhasExibicao,
    busca,
    cobrancasSelecionadas,
    contasPorId,
    filtroTipoSocio,
    filtroSituacaoMensalidade,
  ]);
const selecionadasBaixa = useMemo(
    () =>
      linhasExibicao.filter(
        (item) =>
          sel.includes(item.id) &&
          item.situacao !== "pago" &&
          item.situacao !== "nao_gerada"
      ),
    [linhasExibicao, sel]
  );

  const resumoBaixa = useMemo(() => {
    const porConta = new Map<string, { nome: string; banco?: string | null; quantidade: number; valor: number }>();
    let receita = 0;
    let tarifas = 0;
    let totalCobrado = 0;

    for (const item of selecionadasBaixa) {
      const socio = socioPorId.get(String(item.socio_id));
      const contaId = contaRecebimentoSelecionada || item.conta_pagadora_id || socio?.conta_bancaria_id || "";
      const conta = contasPorId.get(String(contaId));
      const nomeConta = conta?.nome || "Conta não identificada";
      const chave = String(contaId || nomeConta);

      receita += Number(item.valor_base ?? item.valor ?? 0);
      tarifas += Number(item.tarifa_pagamento ?? 0);
      totalCobrado += Number(item.total_cobrado ?? item.valor_base ?? item.valor ?? 0);

      const atual = porConta.get(chave) || {
        nome: nomeConta,
        banco: conta?.banco,
        quantidade: 0,
        valor: 0,
      };
      atual.quantidade += 1;
      atual.valor += Number(item.valor_base ?? item.valor ?? 0);
      porConta.set(chave, atual);
    }

    return {
      quantidade: selecionadasBaixa.length,
      receita,
      tarifas,
      totalCobrado,
      contas: Array.from(porConta.values()).sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }, [selecionadasBaixa, socioPorId, contasPorId, contaRecebimentoSelecionada]);


  async function confirmarBaixaSelecionadas() {
    if (processandoBaixa) return;
    if (selecionadasBaixa.length === 0) {
      setErro("Selecione ao menos uma mensalidade em aberto para baixar.");
      return;
    }

    if (tipoBaixaSelecionada === "pago") {
      const semConta = !contaRecebimentoSelecionada && selecionadasBaixa.some((item) => {
        const socio = socioPorId.get(String(item.socio_id));
        const contaId = item.conta_pagadora_id || socio?.conta_bancaria_id;
        return !contaId || !contasPorId.has(String(contaId));
      });
      if (semConta) {
        setErro("Selecione a conta bancária de destino (por exemplo, Banrisul ou Sicredi) antes de confirmar a baixa.");
        return;
      }
    }

    setProcessandoBaixa(true);
    setAbrirConfirmacaoBaixa(false);

    try {
      if (tipoBaixaSelecionada === "sem_saldo") {
        await post({
          acao: "marcar_sem_saldo",
          ids: selecionadasBaixa.map((item) => item.id),
          motivo: "S.S",
          observacoes: "S.S — Sem saldo",
        });
        setTipoBaixaSelecionada("pago");
        return;
      }

      await post({
        acao: "baixar",
        ids: selecionadasBaixa.map((item) => item.id),
        data_pagamento: new Date().toISOString().slice(0, 10),
        ...(contaRecebimentoSelecionada ? { conta_recebimento_id: contaRecebimentoSelecionada } : {}),
      });
      setTipoBaixaSelecionada("pago");
    } finally {
      setProcessandoBaixa(false);
    }
  }

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

  // Uma única fonte de verdade para o histórico anual.
  // Se houver mais de um lançamento na mesma competência, S.S. tem
  // prioridade visual, depois Isento, Pago, Atrasada e Em aberto.
  const historicoPorMes = useMemo(() => {
    const prioridade = (item: M) => {
      if (ehSemSaldo(item) && podeMarcarSemSaldo(item)) return 50;
      if (item.situacao === "isento") return 40;
      if (item.situacao === "pago") return 30;
      if (situacaoVisual(item) === "em_atraso") return 20;
      if (item.situacao === "em_aberto") return 10;
      return 0;
    };

    const mapa = new Map<number, M>();

    for (const item of historicoSocio) {
      const competencia = String(item.competencia || "").slice(0, 10);
      const partes = competencia.split("-");
      const anoItem = Number(partes[0]);
      const mesItem = Number(partes[1]);

      if (anoItem !== Number(anoHistoricoSocio) || mesItem < 1 || mesItem > 12) continue;

      const atual = mapa.get(mesItem);
      if (!atual) {
        mapa.set(mesItem, item);
        continue;
      }

      const prioridadeAtual = prioridade(atual);
      const prioridadeNovo = prioridade(item);
      const dataAtual = String(atual.updated_at || atual.data_pagamento || "");
      const dataNovo = String(item.updated_at || item.data_pagamento || "");

      if (prioridadeNovo > prioridadeAtual || (prioridadeNovo === prioridadeAtual && dataNovo > dataAtual)) {
        mapa.set(mesItem, item);
      }
    }

    return mapa;
  }, [historicoSocio, anoHistoricoSocio, contas]);

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

  const mesesAteAtual = ano < hoje.getFullYear()
    ? Array.from({ length: 12 }, (_, i) => i + 1)
    : ano === hoje.getFullYear()
      ? Array.from({ length: hoje.getMonth() + 1 }, (_, i) => i + 1)
      : [];

  return (
    <div className="min-h-screen w-full min-w-0 overflow-x-hidden bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />

      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-[1400px] space-y-6">
          <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-gray-500">Financeiro</p>
              <h1 className="text-2xl font-black text-[#005a3c] sm:text-3xl">
                Mensalidades
              </h1>
              <p className="text-sm text-gray-500">
                Lançamento, cobrança e controle das mensalidades.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                onClick={abrirConfiguracao}
                className="w-full rounded-xl border bg-white px-4 py-3 text-center font-bold sm:w-auto"
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

          {dependentesComConflitoMensalidade.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-extrabold">Conflito de classificação de dependentes</p>
              <p className="mt-1">
                {dependentesComConflitoMensalidade.length} dependente(s) estão marcados com mensalidade no cadastro, mas a categoria não indica cobrança própria. Eles foram excluídos da geração automática. Se já houver lançamentos financeiros anteriores, eles permanecem visíveis para conferência do histórico.
              </p>
            </div>
          )}

          <section className="min-w-0 rounded-2xl border bg-white p-3 sm:p-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <label className="min-w-[260px] flex-1">
                <span className="text-sm font-bold text-gray-600">Ano</span>
                <select
                  value={ano}
                  onChange={(e) => {
                    setAno(Number(e.target.value));
                    setSel([]);
                                }}
                  className="mt-2 w-full rounded-xl border p-3 font-bold"
                >
                  {Array.from({ length: 7 }, (_, i) => hoje.getFullYear() - 2 + i).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>

              <div className="min-w-[280px] flex-[1.6]">
                <span className="text-sm font-bold text-gray-600">Meses da competência (selecione um ou vários)</span>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {nomesMeses.map((nomeMes, i) => {
                    const numeroMes = i + 1;
                    const ativo = mesesSelecionados.includes(numeroMes);
                    return (
                      <button
                        key={nomeMes}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => alternarMesSelecionado(numeroMes)}
                        className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${ativo ? "border-[#005a3c] bg-[#005a3c] text-white shadow-sm" : "border-[#d5e0da] bg-white text-[#315447] hover:bg-[#eef7f2]"}`}
                      >
                        {String(numeroMes).padStart(2, "0")} — {nomeMes}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={mesesAteAtual.length === 0}
                    onClick={() => atualizarMesesSelecionados(mesesAteAtual, mesesAteAtual[mesesAteAtual.length - 1])}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-[#005a3c] hover:bg-[#eef7f2] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Janeiro até {mesesAteAtual.length > 0 ? nomesMeses[mesesAteAtual[mesesAteAtual.length - 1] - 1] : "mês atual"}
                  </button>
                  <button type="button" onClick={() => atualizarMesesSelecionados(Array.from({ length: 12 }, (_, i) => i + 1), mes)} className="rounded-lg px-2 py-1 text-xs font-bold text-[#005a3c] hover:bg-[#eef7f2]">Selecionar todos</button>
                  <button type="button" onClick={() => atualizarMesesSelecionados([mes], mes)} className="rounded-lg px-2 py-1 text-xs font-bold text-[#005a3c] hover:bg-[#eef7f2]">Manter somente {nomesMeses[mes - 1]}</button>
                </div>
              </div>

              <div className="min-w-[210px] rounded-xl bg-[#eef7f2] px-4 py-3 text-sm">
                <span className="text-gray-500">Visualizando:</span>{" "}
                <b className="text-[#005a3c]">{mesesSelecionados.length === 1 ? `${String(mesesSelecionados[0]).padStart(2, "0")}/${ano}` : `${mesesSelecionados.length} meses de ${ano}`}</b>
                <p className="mt-1 text-xs text-gray-600">{mesesSelecionados.map((mesItem) => nomesMeses[mesItem - 1]).join(" • ")}</p>
                <span className="text-xs text-gray-500">A lista carrega automaticamente.</span>
              </div>
            </div>
          </section>

          <div className="min-w-0 rounded-2xl border bg-white p-3 sm:p-4">
            <div className="space-y-3">
              <div className="flex w-full items-center gap-2 rounded-xl border px-3">
                <Search className="h-4 w-4 shrink-0 text-gray-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, CPF ou matrícula..."
                  className="w-full py-3 outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                    Tipo de sócio
                  </span>
                  <select
                    value={filtroTipoSocio}
                    onChange={(e) => setFiltroTipoSocio(e.target.value)}
                    className="w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-2.5 text-sm text-[#173d2e] outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
                  >
                    <option value="todos">Todos os tipos</option>
                    {tiposSocioDisponiveis.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {rotuloTipoSocio(tipo)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                    Situação da mensalidade
                  </span>
                  <select
                    value={filtroSituacaoMensalidade}
                    onChange={(e) => setFiltroSituacaoMensalidade(e.target.value)}
                    className="w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-2.5 text-sm text-[#173d2e] outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
                  >
                    <option value="todas">Todas as situações</option>
                    <option value="nao_gerada">Não gerada</option>
                    <option value="em_aberto">Em aberto</option>
                    <option value="em_atraso">Em atraso</option>
                    <option value="pago">Pago</option>
                    <option value="isento">Isento</option>
                    <option value="sem_saldo">S.S. — Sem saldo</option>
                  </select>
                </label>
              </div>

              {(busca || filtroTipoSocio !== "todos" || filtroSituacaoMensalidade !== "todas" || cobrancasSelecionadas.length > 0) && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setBusca("");
                      setFiltroTipoSocio("todos");
                      setFiltroSituacaoMensalidade("todas");
                      setCobrancasSelecionadas([]);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#005a3c] hover:bg-[#eef7f2]"
                  >
                    Limpar filtros
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm font-bold text-gray-600">
                  Tipo de cobrança:
                </span>
                {[
                  ["banrisul", "Banrisul"],
                  ["sicredi", "Sicredi"],
                  ["bb", "Banco do Brasil"],
                  ["boleto", "Boleto"],
                  ["pix", "PIX"],
                  ["dinheiro", "Dinheiro"],
                  ["transferencia", "Transferência"],
                  ["outro", "Outro"],
                  ["sem_pagamento", "Não identificado"],
                ].map(([valor, label]) => {
                  const ativo = cobrancasSelecionadas.includes(valor);
                  return (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={ativo}
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

              <div className="flex flex-col gap-3 rounded-xl bg-[#f7faf8] p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-xs text-gray-500">
                  Exibindo <b>{filtrada.length}</b> de <b>{linhasExibicao.length}</b> associado(s)
                </div>

                <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto">
                <button
                  type="button"
                  disabled={!selecionadasBaixa.length}
                  onClick={() => {
                    setTipoBaixaSelecionada("pago");
                    setAbrirConfirmacaoBaixa(true);
                  }}
                  className="w-full rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white disabled:opacity-40 sm:w-auto"
                >
                  💰 Baixar selecionadas ({selecionadasBaixa.length})
                </button>
                </div>
              </div>
            </div>

            {sel.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-[#eef7f2] p-3 text-sm font-bold text-[#005a3c]">
                {selecionadasBaixa.length > 0 && (
                  <span>💰 {selecionadasBaixa.length} para baixar</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSel([]);
                                  setAbrirConfirmacaoBaixa(false);
                  }}
                  className="ml-auto text-xs font-bold underline"
                >
                  Limpar seleção
                </button>
              </div>
            )}

            <div className="mt-4 grid gap-3 md:hidden">
              {filtrada.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-500">
                  {carregandoMensalidades || preparandoMensalidadesAutomaticamente ? "Carregando e preparando as mensalidades automaticamente..." : "Nenhum associado encontrado com os filtros atuais."}
                </div>
              ) : (
                filtrada.map((x) => {
                  const st = statusMensalidade(x, podeMarcarSemSaldo(x));
                  const acrescimos = Number(x.multa || 0) + Number(x.juros || 0);
                  const total = x.total_cobrado ?? Number(x.valor_base ?? x.valor) + Number(x.tarifa_pagamento || 0) + Number(x.multa || 0) + Number(x.juros || 0) - Number(x.desconto || 0);
                  const marcado = x.situacao !== "pago" && x.situacao !== "nao_gerada" && sel.includes(x.id);
                  return (
                    <article key={`mobile-${x.id}`} className="min-w-0 rounded-xl border border-[#d8e7df] bg-white p-3 shadow-sm">
                      <div className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5 shrink-0 accent-[#005a3c]"
                          disabled={x.situacao === "pago" || x.situacao === "nao_gerada"}
                          checked={marcado}
                          aria-label={`Selecionar mensalidade de ${x.socio?.nome || "associado"}`}
                          onChange={() => {
                            if (x.situacao === "pago") return;
                            setSel((atual) => atual.includes(x.id) ? atual.filter((id) => id !== x.id) : [...atual, x.id]);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <button type="button" onClick={() => void abrirDetalhesSocio(x)} className="break-words text-left font-bold text-[#005a3c] underline-offset-2 hover:underline">
                            {x.socio?.nome || "Associado sem identificação"}
                          </button>
                          <p className="mt-1 break-words text-xs text-gray-500">Matrícula: {x.socio?.matricula || "—"}</p>
                          <p className="mt-1 break-words text-xs font-bold text-[#005a3c]">Competência: {String(x.competencia || "").slice(5, 7)}/{String(x.competencia || "").slice(0, 4)}</p>
                          <p className="mt-1 break-words text-sm text-gray-700">{nomes[x.socio?.tipo_socio] || x.socio?.tipo_socio || "Tipo não informado"}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${st[1]}`}>{st[0]}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-gray-100 pt-3 text-sm">
                        <div><p className="text-xs text-gray-500">Vencimento</p><p className="font-medium">{data(x.data_vencimento)}</p></div>
                        <div><p className="text-xs text-gray-500">Total cobrado</p><p className="font-black text-[#005a3c]">{moeda(total)}</p></div>
                        <div><p className="text-xs text-gray-500">Base</p><p>{moeda(x.valor_base ?? x.valor)}</p></div>
                        <div><p className="text-xs text-gray-500">Tarifa + acréscimos</p><p>{moeda(Number(x.tarifa_pagamento || 0) + acrescimos)}</p></div>
                      </div>
                      {(x.motivo || x.observacoes) && (
                        ehObservacaoHistoricoImportado(x.motivo || x.observacoes) ? (
                          <details className="mt-2 min-w-0 text-xs text-gray-500">
                            <summary
                              className="cursor-pointer font-semibold text-gray-600"
                              title={x.motivo || x.observacoes || ""}
                            >
                              {resumoObservacaoMensalidade(x.motivo || x.observacoes)}
                            </summary>
                            <p className="mt-1 break-words">{x.motivo || x.observacoes}</p>
                          </details>
                        ) : (
                          <p className="mt-2 break-words text-xs text-gray-500">
                            Motivo: {x.motivo || x.observacoes}
                          </p>
                        )
                      )}
                      {x.situacao === "pago" && <button type="button" onClick={() => void estornarBaixa(x)} className="mt-3 w-full rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm font-bold text-yellow-700">↩️ Estornar baixa</button>}
                      {x.situacao === "nao_gerada" && (
                        <p className={`mt-3 text-xs font-semibold ${competenciaNaoGeradaAtrasada(x) ? "text-red-600" : "text-gray-400"}`}>
                          {competenciaNaoGeradaAtrasada(x) ? "Preparando cobrança vencida automaticamente…" : "Preparando cobrança automaticamente…"}
                        </p>
                      )}
                    </article>
                  );
                })
              )}
            </div>

            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-[#e8f3ee]">
                  <tr>
                    <th className="p-3">✓</th>
                    <th className="p-3 text-left">Competência</th>
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
                  {filtrada.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="p-6 text-center text-gray-500">
                        Nenhum associado encontrado com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    filtrada.map((x) => {
                    const st = statusMensalidade(x, podeMarcarSemSaldo(x));
                    const acrescimos =
                      Number(x.multa || 0) + Number(x.juros || 0);

                    return (
                      <tr key={x.id}>
                        <td className="p-3">
                          <input
                            type="checkbox"
                            disabled={x.situacao === "pago" || x.situacao === "nao_gerada"}
                            checked={x.situacao !== "pago" && x.situacao !== "nao_gerada" && sel.includes(x.id)}
                            onChange={() => {

                              if (x.situacao === "pago") return;

                              setSel((s) =>
                                s.includes(x.id)
                                  ? s.filter((i) => i !== x.id)
                                  : [...s, x.id]
                              );
                            }}
                          />
                        </td>

                        <td className="whitespace-nowrap p-3 font-bold text-[#005a3c]">
                          {String(x.competencia || "").slice(5, 7)}/{String(x.competencia || "").slice(0, 4)}
                        </td>

                        <td className="p-3 font-bold">
                          <button
                            type="button"
                            onClick={() => void abrirDetalhesSocio(x)}
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

                        <td className="max-w-[240px] p-3 align-top">
                          {ehObservacaoHistoricoImportado(x.motivo || x.observacoes) ? (
                            <details className="max-w-[220px] text-xs text-gray-500">
                              <summary
                                className="cursor-pointer font-semibold text-gray-600"
                                title={x.motivo || x.observacoes || ""}
                              >
                                {resumoObservacaoMensalidade(x.motivo || x.observacoes)}
                              </summary>
                              <p className="mt-1 max-w-[320px] whitespace-normal break-words">
                                {x.motivo || x.observacoes}
                              </p>
                            </details>
                          ) : (
                            x.motivo || x.observacoes || "—"
                          )}
                        </td>

                        <td className="sticky right-0 z-10 bg-white p-3 shadow-[-4px_0_8px_rgba(0,0,0,0.06)]">
                          {x.situacao === "nao_gerada" ? (
                            <span className={`text-xs font-semibold ${competenciaNaoGeradaAtrasada(x) ? "text-red-600" : "text-gray-400"}`}>
                              {competenciaNaoGeradaAtrasada(x) ? "Preparando cobrança vencida…" : "Preparando cobrança…"}
                            </span>
                          ) : x.situacao === "pago" ? (
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
                  })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <section className="min-w-0 rounded-2xl border bg-white p-3 sm:p-5">
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-white px-5 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  Cadastro do associado
                </p>
                <h2 className="text-xl font-black text-[#005a3c] sm:text-2xl">
                  {socioSelecionado.socio?.nome || "Associado"}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Matrícula {socioSelecionado.socio?.matricula || "—"} · {ano}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSocioSelecionado(null);
                  setMesesHistoricoSelecionadosBaixa([]);
                  setHistoricoSocio([]);
                  setMesHistoricoSelecionado(null);
                  setAnoHistoricoSocio(ano);
                }}
                className="rounded-full p-2 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ["Matrícula", socioSelecionado.socio?.matricula],
                  ["CPF", socioSelecionado.socio?.cpf],
                  ["Categoria", socioSelecionado.socio?.categoria],
                  [
                    "Tipo de sócio",
                    nomes[socioSelecionado.socio?.tipo_socio] ||
                      socioSelecionado.socio?.tipo_socio,
                  ],
                ].map(([label, valor]) => (
                  <div key={label} className="rounded-xl border bg-gray-50 p-3">
                    <div className="text-[10px] font-bold uppercase text-gray-500">
                      {label}
                    </div>
                    <div className="mt-1 break-words text-sm font-bold">
                      {valor || "—"}
                    </div>
                  </div>
                ))}
              </div>

              <section className="rounded-2xl border border-[#cfe6da] bg-[#f7fbf8] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="text-lg font-black text-[#005a3c]">
                      Controle de mensalidades — {anoHistoricoSocio}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      X = pago · SS = sem saldo (débito/boleto) · I = isento · em atraso = vencida
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-bold text-gray-500">Ano</label>
                    <select
                      value={anoHistoricoSocio}
                      onChange={(e) => void trocarAnoHistoricoSocio(Number(e.target.value))}
                      className="rounded-xl border bg-white px-3 py-2 text-sm font-black text-[#005a3c]"
                    >
                      {Array.from({ length: 7 }, (_, i) => hoje.getFullYear() - 2 + i).map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    {carregandoHistoricoSocio && (
                      <span className="text-xs font-bold text-gray-500">Carregando...</span>
                    )}
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <div className="min-w-[760px] rounded-xl border bg-white">
                    <div className="grid grid-cols-13 border-b bg-[#eaf4ee] text-center text-xs font-black text-[#005a3c]"
                         style={{ gridTemplateColumns: "minmax(180px,1.5fr) repeat(12,minmax(42px,1fr))" }}>
                      <div className="px-2 py-3 text-left">Competência</div>
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((numeroMes) => (
                        <div key={numeroMes} className="px-1 py-3">
                          {String(numeroMes).padStart(2, "0")}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-13 text-center"
                         style={{ gridTemplateColumns: "minmax(180px,1.5fr) repeat(12,minmax(42px,1fr))" }}>
                      <div className="border-r px-2 py-3 text-left">
                        <div className="font-black text-[#005a3c]">Mensalidade</div>
                        <div className="mt-1 text-[11px] text-gray-500">
                          Clique em um mês para ver os detalhes
                        </div>
                      </div>

                      {Array.from({ length: 12 }, (_, index) => index + 1).map((numeroMes) => {
                        const registro = historicoPorMes.get(numeroMes);
                        const situacao = registro?.situacao || "nao_gerada";
                        const semSaldo = Boolean(registro && ehSemSaldo(registro) && podeMarcarSemSaldo(registro));
                        const pago = Boolean(registro && !semSaldo && situacao === "pago");
                        const isento = Boolean(registro && !semSaldo && situacao === "isento");
                        const naoGerada = !registro;
                        const selecionado = mesHistoricoSelecionado === numeroMes;

                        return (
                          <button
                            key={numeroMes}
                            type="button"
                            onClick={() => setMesHistoricoSelecionado(numeroMes)}
                            title={
                              pago
                                ? `${String(numeroMes).padStart(2, "0")}/${anoHistoricoSocio}: Pago`
                                : semSaldo
                                  ? `${String(numeroMes).padStart(2, "0")}/${anoHistoricoSocio}: Sem saldo`
                                  : naoGerada
                                    ? `${String(numeroMes).padStart(2, "0")}/${anoHistoricoSocio}: Não gerada`
                                    : `${String(numeroMes).padStart(2, "0")}/${anoHistoricoSocio}: Em aberto`
                            }
                            className={`border-l px-1 py-3 text-center transition ${
                              selecionado ? "bg-[#d9eee2] ring-2 ring-inset ring-[#00704a]" : "hover:bg-gray-50"
                            }`}
                          >
                            <span
                              className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black ${
                                pago
                                  ? "bg-green-100 text-green-700"
                                  : semSaldo
                                    ? "bg-amber-100 text-amber-700"
                                    : isento
                                      ? "bg-gray-100 text-gray-500"
                                      : naoGerada
                                        ? "bg-gray-50 text-gray-300"
                                        : "bg-white text-gray-300"
                              }`}
                            >
                              {pago ? "X" : semSaldo ? "SS" : isento ? "I" : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-[#d8e9df] bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-[#005a3c]">Baixa antecipada / múltiplos meses</p>
                    <span className="text-xs text-gray-500">Selecione as competências em aberto</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((numeroMes) => {
                      const registro = historicoPorMes.get(numeroMes);
                      const elegivel = Boolean(registro && registro.situacao !== "pago" && registro.situacao !== "isento" && !String(registro.id).startsWith("virtual-"));
                      const marcado = mesesHistoricoSelecionadosBaixa.includes(numeroMes);
                      return (
                        <label key={`baixa-${numeroMes}`} className={`flex items-center gap-1 rounded-lg border px-2 py-2 text-xs font-bold ${elegivel ? "cursor-pointer border-gray-200" : "cursor-not-allowed border-gray-100 text-gray-300"} ${marcado ? "border-[#00704a] bg-[#eaf4ee] text-[#005a3c]" : "bg-white"}`}>
                          <input type="checkbox" checked={marcado} disabled={!elegivel || processandoBaixaHistorico} onChange={() => alternarMesHistoricoParaBaixa(numeroMes)} />
                          {String(numeroMes).padStart(2, "0")}/{String(anoHistoricoSocio).slice(-2)}
                        </label>
                      );
                    })}
                  </div>
                  {mesesHistoricoSelecionadosBaixa.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-gray-600">{mesesHistoricoSelecionadosBaixa.length} mês(es) selecionado(s). A baixa usa a data de pagamento de hoje.</p>
                      <button type="button" disabled={processandoBaixaHistorico} onClick={() => void baixarMesesDoHistorico()} className="rounded-xl bg-[#005a3c] px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                        {processandoBaixaHistorico ? "Processando..." : `💰 Dar baixa em ${mesesHistoricoSelecionadosBaixa.length} mês(es)`}
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">X Pago</span>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">SS Sem saldo</span>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-500">I Isento</span>
                  <span className="rounded-full border bg-white px-3 py-1 text-gray-400">Em aberto / PIX pendente</span>
                  <span className="rounded-full bg-gray-50 px-3 py-1 text-gray-400">Não gerada</span>
                </div>
              </section>

              {(() => {
                const registroMes = mesHistoricoSelecionado
                  ? historicoPorMes.get(mesHistoricoSelecionado) || null
                  : null;

                return (
                  <section className="rounded-2xl border border-[#cfe6da] bg-[#f4faf7] p-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="font-black text-[#005a3c]">
                        Detalhes — {String(mesHistoricoSelecionado || mes).padStart(2, "0")}/{anoHistoricoSocio}
                      </h3>
                      <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${
                        !registroMes
                          ? "bg-gray-100 text-gray-500"
                          : ehSemSaldo(registroMes) && podeMarcarSemSaldo(registroMes)
                            ? "bg-amber-100 text-amber-700"
                            : situacaoVisual(registroMes) === "pago"
                              ? "bg-green-100 text-green-700"
                              : situacaoVisual(registroMes) === "em_atraso"
                                ? "bg-red-100 text-red-700"
                                : situacaoVisual(registroMes) === "isento"
                                  ? "bg-gray-100 text-gray-500"
                                  : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {registroMes
                          ? (ehSemSaldo(registroMes) && podeMarcarSemSaldo(registroMes)
                              ? "S.S"
                              : status(situacaoVisual(registroMes))[0])
                          : "Não gerada"}
                      </span>
                    </div>

                    {registroMes ? (
                      <>
                      <div className="mt-3 grid gap-3 sm:grid-cols-4">
                        <div>
                          <span className="text-xs text-gray-500">Valor base</span>
                          <p className="font-bold">{moeda(registroMes.valor_base ?? registroMes.valor)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500">Tarifa</span>
                          <p className="font-bold">{moeda(registroMes.tarifa_pagamento)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500">Total cobrado</span>
                          <p className="font-black text-[#005a3c]">{moeda(registroMes.total_cobrado)}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500">Pagamento</span>
                          <p className="font-bold">{data(registroMes.data_pagamento)}</p>
                        </div>
                      </div>

                      <div className="mt-4 border-t pt-4">
                        {registroMes.situacao === "pago" ? (
                          <button
                            type="button"
                            onClick={() => void alterarMensalidadeDoModal("estornar")}
                            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 hover:bg-amber-100"
                          >
                            ↩ Estornar pagamento
                          </button>
                        ) : registroMes.situacao !== "isento" ? (
                          <>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setErro("");
                                  setMsg("");
                                  setPagamentoMensalidade(registroMes);
                                }}
                                className="rounded-xl bg-[#005a3c] px-4 py-2 text-sm font-black text-white hover:bg-[#004a31]"
                              >
                                💰 Dar baixa / Registrar pagamento
                              </button>
                              {podeMarcarSemSaldo(registroMes) && (
                                <button
                                  type="button"
                                  onClick={() => void alterarMensalidadeDoModal("marcar_sem_saldo")}
                                  className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 hover:bg-amber-100"
                                >
                                  SS — Sem saldo
                                </button>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                              Forma de cobrança: <b>{tipoCobranca(registroMes) === "banrisul" ? "Débito Banrisul" : tipoCobranca(registroMes) === "sicredi" ? "Débito Sicredi" : tipoCobranca(registroMes) === "bb" ? "Débito Banco do Brasil" : tipoCobranca(registroMes) === "boleto" ? "Boleto" : tipoCobranca(registroMes) === "pix" ? "PIX" : "Outra / não definida"}</b>. S.S. é usado somente para débito em conta ou boleto.
                            </p>
                          </>
                        ) : null}
                      </div>
                      </>
                    ) : (
                      <p className="mt-3 rounded-xl bg-white p-3 text-sm text-gray-500">
                        Essa competência ainda não possui lançamento para este associado.
                      </p>
                    )}
                  </section>
                );
              })()}
            </div>

            <div className="flex justify-end border-t bg-gray-50 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setSocioSelecionado(null);
                  setMesesHistoricoSelecionadosBaixa([]);
                  setHistoricoSocio([]);
                  setMesHistoricoSelecionado(null);
                  setAnoHistoricoSocio(ano);
                }}
                className="rounded-xl bg-[#005a3c] px-5 py-2 font-bold text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {pagamentoMensalidade && (
        <RegistrarPagamentoMensalidade
          key={pagamentoMensalidade.id}
          registro={pagamentoMensalidade}
          contas={contas}
          onClose={() => setPagamentoMensalidade(null)}
          onError={(mensagem) => {
            if (mensagem) setErro(mensagem);
          }}
          onSuccess={async (mensagem) => {
            setMsg(mensagem);
            setErro("");
            setPagamentoMensalidade(null);
            await carregar();
            if (socioSelecionado) {
              await carregarHistoricoSocio(socioSelecionado, anoHistoricoSocio);
            }
          }}
        />
      )}

      {abrirConfirmacaoBaixa && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAbrirConfirmacaoBaixa(false);
          }}
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b p-5">
              <div>
                <h2 className="text-xl font-black text-[#005a3c]">
                  Confirmar baixa
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  Confira os lançamentos antes de registrar no Financeiro.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbrirConfirmacaoBaixa(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <p className="mb-2 text-sm font-black text-[#005a3c]">Como deseja registrar esta baixa?</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setTipoBaixaSelecionada("pago")}
                    className={`rounded-xl border-2 p-4 text-left transition ${
                      tipoBaixaSelecionada === "pago"
                        ? "border-[#005a3c] bg-[#eef7f2]"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-black text-[#005a3c]">✓ Pago</div>
                    <div className="mt-1 text-xs text-gray-500">Registra a entrada no Financeiro e marca X.</div>
                  </button>
                  <button
                    type="button"
                    disabled={!selecionadasBaixa.length || !selecionadasBaixa.every((item) => podeMarcarSemSaldo(item))}
                    onClick={() => setTipoBaixaSelecionada("sem_saldo")}
                    className={`rounded-xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      tipoBaixaSelecionada === "sem_saldo"
                        ? "border-amber-400 bg-amber-50"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-black text-amber-700">SS · Sem saldo</div>
                    <div className="mt-1 text-xs text-gray-500">Não lança no Financeiro e marca SS no histórico.</div>
                  </button>
                </div>
              </div>

              {tipoBaixaSelecionada === "pago" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-[#eef7f2] p-3">
                  <p className="text-xs font-bold text-gray-500">Mensalidades</p>
                  <p className="mt-1 text-xl font-black text-[#005a3c]">{resumoBaixa.quantidade}</p>
                </div>
                <div className="rounded-xl bg-[#eef7f2] p-3">
                  <p className="text-xs font-bold text-gray-500">Receita</p>
                  <p className="mt-1 text-lg font-black text-[#005a3c]">{moeda(resumoBaixa.receita)}</p>
                </div>
                <div className="rounded-xl bg-[#fff8e6] p-3">
                  <p className="text-xs font-bold text-gray-500">Tarifas</p>
                  <p className="mt-1 text-lg font-black text-amber-700">{moeda(resumoBaixa.tarifas)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs font-bold text-gray-500">Total cobrado</p>
                  <p className="mt-1 text-lg font-black text-gray-800">{moeda(resumoBaixa.totalCobrado)}</p>
                </div>
              </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="font-black text-amber-800">SS — Sem saldo</div>
                  <p className="mt-1">Nenhuma receita, tarifa ou entrada financeira será lançada. O registro ficará em aberto apenas para controle e aparecerá como <b>SS</b> no histórico anual.</p>
                </div>
              )}


              {tipoBaixaSelecionada === "pago" && (
              <div className="rounded-xl border p-4">
                <label htmlFor="conta-recebimento-baixa" className="mb-2 block text-sm font-black text-[#005a3c]">Conta bancária de destino</label>
                <select
                  id="conta-recebimento-baixa"
                  value={contaRecebimentoSelecionada}
                  onChange={(e) => setContaRecebimentoSelecionada(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-semibold"
                >
                  <option value="">Usar conta cadastrada do associado (quando identificada)</option>
                  {contas.map((conta) => (
                    <option key={conta.id} value={conta.id}>{conta.nome}{conta.banco ? ` — ${conta.banco}` : ""}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-gray-500">Escolha Banrisul, Sicredi ou outra conta cadastrada. A seleção será aplicada a todas as mensalidades desta baixa.</p>
                <div className="mt-3 divide-y rounded-lg bg-gray-50 px-3">
                  {resumoBaixa.contas.map((conta) => (
                    <div key={`${conta.nome}-${conta.banco || ""}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                      <div><p className="font-bold">{conta.nome}</p>{conta.banco && <p className="text-xs text-gray-500">{conta.banco}</p>}</div>
                      <div className="text-right"><p className="font-black text-[#005a3c]">{moeda(conta.valor)}</p><p className="text-xs text-gray-500">{conta.quantidade} mensalidade(s)</p></div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              <div className="max-h-48 overflow-y-auto rounded-xl border">
                <div className="border-b bg-gray-50 px-4 py-3 text-sm font-black">Associados selecionados</div>
                <div className="divide-y">
                  {selecionadasBaixa.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-bold">
                          {item.socio?.nome || socioPorId.get(String(item.socio_id))?.nome || "Associado"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.socio?.matricula || socioPorId.get(String(item.socio_id))?.matricula || "Sem matrícula"}
                        </p>
                      </div>
                      <span className="shrink-0 font-black">
                        {moeda(Number(item.valor_base ?? item.valor ?? 0))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${tipoBaixaSelecionada === "sem_saldo" ? "rounded-xl bg-amber-50 p-3 text-sm text-amber-800" : "rounded-xl bg-blue-50 p-3 text-sm text-blue-800"}`}>
                {tipoBaixaSelecionada === "sem_saldo"
                  ? "S.S significa Sem Saldo. Nenhuma entrada financeira será criada; a mensalidade continuará em aberto e ficará identificada como SS no histórico anual."
                  : "A baixa registra a receita da mensalidade no Financeiro e, quando houver, a tarifa bancária separadamente. Mensalidades já pagas não entram nesta operação."}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t bg-gray-50 p-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setAbrirConfirmacaoBaixa(false)}
                className="rounded-xl border bg-white px-5 py-3 font-bold text-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selecionadasBaixa.length || processandoBaixa}
                onClick={() => void confirmarBaixaSelecionadas()}
                className={`rounded-xl px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-40 ${tipoBaixaSelecionada === "sem_saldo" ? "bg-amber-600" : "bg-[#005a3c]"}`}
              >
                {processandoBaixa
                  ? "⏳ Processando..."
                  : tipoBaixaSelecionada === "sem_saldo"
                    ? "Confirmar S.S — Sem saldo"
                    : "Confirmar baixa no Financeiro"}
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

