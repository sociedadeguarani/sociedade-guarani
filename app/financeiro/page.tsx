"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import { Campo, Modal, Resumo } from "./components/FinanceiroUI";

type Socio = {
  id: string;
  matricula: string | number | null;
  nome: string;
  cpf: string | null;
  whatsapp: string | null;
  telefone: string | null;
  foto_url: string | null;
  situacao: string | null;
  responsavel_id: string | null;
  possui_mensalidade: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
};

type Dependente = {
  id: string;
  socio_id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  ativo: boolean | null;
  possui_mensalidade: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
};

type Mensalidade = {
  id: string;
  socio_id: string;
  dependente_id: string | null;
  competencia: string;
  valor: number;
  data_vencimento: string | null;
  situacao: string | null;
};

type PessoaFinanceira = {
  chave: string;
  socio_id: string;
  dependente_id: string | null;
  nome: string;
  matricula: string | number | null;
  cpf: string | null;
  foto_url: string | null;
  responsavel_nome: string | null;
  possui_mensalidade: boolean;
  valor_mensalidade: number;
  dia_vencimento: number;
  tipo_pagamento: string;
};

type ContaBancaria = {
  id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  saldo_inicial: number;
  data_saldo_inicial: string | null;
  ativo: boolean;
  observacoes: string | null;
};

type MovimentoFinanceiro = {
  id: string;
  conta_bancaria_id: string;
  conta_destino_id: string | null;
  grupo_transferencia: string | null;
  tipo: "entrada" | "saida" | "transferencia";
  categoria: string | null;
  descricao: string;
  valor: number;
  data_movimentacao: string;
  created_at: string | null;
  created_by: string | null;
  forma_pagamento: string | null;
  origem_tipo: string | null;
  origem_id: string | null;
  socio_id: string | null;
  dependente_id: string | null;
  comprovante_url: string | null;
  conciliado: boolean;
  data_conciliacao: string | null;
  observacoes: string | null;
};



const FORMAS = [
  ["pix", "PIX"],
  ["debito_em_conta", "Débito em conta"],
  ["boleto", "Boleto"],
  ["dinheiro", "Dinheiro"],
  ["transferencia", "Transferência"],
  ["outro", "Outro"],
] as const;

function formatarMoeda(valor: number | string | null | undefined) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarData(data: string | null | undefined) {
  if (!data) return "—";
  const p = data.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : data;
}

function formatarHora(data: string | null | undefined) {
  if (!data) return "—";
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatarCompetencia(valor: string) {
  const p = valor.slice(0, 7).split("-");
  return p.length === 2 ? `${p[1]}/${p[0]}` : valor;
}

function ehUrlAbsoluta(valor: string) {
  return /^https?:\/\//i.test(valor);
}

function nivelAtraso(meses: number) {
  if (meses >= 3) {
    return {
      texto: `${meses} ${meses === 1 ? "mês" : "meses"}`,
      classe: "bg-red-100 text-red-700 ring-1 ring-red-200",
      ponto: "bg-red-500",
    };
  }
  if (meses === 2) {
    return {
      texto: "2 meses",
      classe: "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-200",
      ponto: "bg-yellow-500",
    };
  }
  return {
    texto: "Em dia",
    classe: "bg-green-100 text-green-700 ring-1 ring-green-200",
    ponto: "bg-green-500",
  };
}

export default function FinanceiroPage() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [mensagem, setMensagem] = useState("");
  const [busca, setBusca] = useState("");
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [movimentosFinanceiros, setMovimentosFinanceiros] = useState<MovimentoFinanceiro[]>([]);
  const [pessoasMovimentos, setPessoasMovimentos] = useState<Map<string, { nome: string; matricula: string | number | null; tipo: "socio" | "dependente"; responsavelNome?: string | null }>>(new Map());
  const [usuariosMovimentos, setUsuariosMovimentos] = useState<Map<string, { nome: string; email: string | null }>>(new Map());
  const [abaFinanceira, setAbaFinanceira] = useState<"aluguéis" | "entradas" | "saidas" | "inadimplencia" | "contas" | "fluxo">("contas");
  const [mostrarContaModal, setMostrarContaModal] = useState(false);
  const [mostrarMovimentoModal, setMostrarMovimentoModal] = useState(false);
  const [mostrarTransferenciaModal, setMostrarTransferenciaModal] = useState(false);
  const [contaEditando, setContaEditando] = useState<ContaBancaria | null>(null);
  const [contaNome, setContaNome] = useState("");
  const [contaBanco, setContaBanco] = useState("");
  const [contaAgencia, setContaAgencia] = useState("");
  const [contaNumero, setContaNumero] = useState("");
  const [contaSaldoInicial, setContaSaldoInicial] = useState("0");
  const [contaDataSaldo, setContaDataSaldo] = useState(new Date().toISOString().slice(0, 10));
  const [contaObservacoes, setContaObservacoes] = useState("");
  const [contaConferindo, setContaConferindo] = useState<ContaBancaria | null>(null);
  const [saldoConferido, setSaldoConferido] = useState("");
  const [dataConferencia, setDataConferencia] = useState(new Date().toISOString().slice(0, 10));
  const [observacaoConferencia, setObservacaoConferencia] = useState("");
  const [salvandoConferencia, setSalvandoConferencia] = useState(false);
  const [movTipo, setMovTipo] = useState<"entrada" | "saida">("saida");
  const [movConta, setMovConta] = useState("");
  const [movCategoria, setMovCategoria] = useState("");
  const [movDescricao, setMovDescricao] = useState("");
  const [movValor, setMovValor] = useState("");
  const [movData, setMovData] = useState(new Date().toISOString().slice(0, 10));
  const [movForma, setMovForma] = useState("pix");
  const [movObservacoes, setMovObservacoes] = useState("");
  const [movArquivo, setMovArquivo] = useState<File | null>(null);
  const [transOrigem, setTransOrigem] = useState("");
  const [transDestino, setTransDestino] = useState("");
  const [transValor, setTransValor] = useState("");
  const [transData, setTransData] = useState(new Date().toISOString().slice(0, 10));
  const [transDescricao, setTransDescricao] = useState("Transferência entre contas");
  const [transObservacoes, setTransObservacoes] = useState("");

  // Filtros do fluxo de caixa
  const [fluxoInicio, setFluxoInicio] = useState("");
  const [fluxoFim, setFluxoFim] = useState("");
  const [fluxoConta, setFluxoConta] = useState("");
  const [fluxoTipo, setFluxoTipo] = useState<"todos" | "entrada" | "saida" | "transferencia">("todos");
  const [fluxoForma, setFluxoForma] = useState<"todos" | "pix" | "debito_em_conta" | "boleto" | "dinheiro" | "transferencia" | "outro">("todos");
  const [movimentoEstornandoId, setMovimentoEstornandoId] = useState<string | null>(null);
  const [carregandoFinanceiro, setCarregandoFinanceiro] = useState(true);
  const [salvandoConta, setSalvandoConta] = useState(false);
  const [salvandoMovimento, setSalvandoMovimento] = useState(false);
  const [salvandoTransferencia, setSalvandoTransferencia] = useState(false);

  const pessoas = useMemo<PessoaFinanceira[]>(() => {
    const responsaveis = new Map<string, Socio>(
      socios.map((s) => [s.id, s] as [string, Socio])
    );
    const cpfsSociosDependentes = new Set(
      socios
        .filter((s) => Boolean(s.responsavel_id) && s.cpf)
        .map((s) => s.cpf!.replace(/\D/g, ""))
        .filter(Boolean)
    );
    const resultado: PessoaFinanceira[] = [];

    for (const s of socios) {
      if (s.situacao?.toLowerCase() === "inativo") continue;
      if (!s.possui_mensalidade) continue;

      resultado.push({
        chave: `socio:${s.id}`,
        socio_id: s.id,
        dependente_id: null,
        nome: s.nome,
        matricula: s.matricula,
        cpf: s.cpf,
        foto_url: s.foto_url,
        responsavel_nome: s.responsavel_id
          ? responsaveis.get(s.responsavel_id)?.nome || null
          : null,
        possui_mensalidade: true,
        valor_mensalidade: Number(s.valor_mensalidade || 0),
        dia_vencimento: Number(s.dia_vencimento || 10),
        tipo_pagamento: s.tipo_pagamento || "pix",
      });
    }

    for (const d of dependentes) {
      if (d.ativo === false || !d.possui_mensalidade) continue;

      const responsavel = responsaveis.get(d.socio_id);

      // Evita duplicação quando o mesmo dependente já estiver
      // cadastrado também na tabela socios com a mesma pessoa.
      const cpfDependente = d.cpf?.replace(/\D/g, "");
      const duplicado = Boolean(
        cpfDependente &&
          cpfsSociosDependentes.has(cpfDependente)
      );

      if (duplicado) continue;

      resultado.push({
        chave: `dependente:${d.id}`,
        socio_id: d.socio_id,
        dependente_id: d.id,
        nome: d.nome,
        matricula: responsavel?.matricula || null,
        cpf: d.cpf,
        foto_url: null,
        responsavel_nome: responsavel?.nome || null,
        possui_mensalidade: true,
        valor_mensalidade: Number(d.valor_mensalidade || 0),
        dia_vencimento: Number(d.dia_vencimento || 10),
        tipo_pagamento: d.tipo_pagamento || "pix",
      });
    }

    return resultado;
  }, [socios, dependentes]);

  const lancamentosPorPessoa = useMemo(() => {
    const map = new Map<string, Mensalidade[]>();
    for (const m of mensalidades) {
      const chave = m.dependente_id ? `dependente:${m.dependente_id}` : `socio:${m.socio_id}`;
      const lista = map.get(chave);
      if (lista) lista.push(m);
      else map.set(chave, [m]);
    }
    return map;
  }, [mensalidades]);

  const historicoPorPessoa = useMemo(() => {
    const map = new Map<string, number>();
    const hojeIso = new Date().toISOString().slice(0, 10);
    for (const [chave, lancamentos] of lancamentosPorPessoa) {
      const atrasadas = lancamentos.filter((m) => {
        if (m.situacao === "pago" || m.situacao === "isento") return false;
        return Boolean(m.situacao === "em_atraso" || (m.data_vencimento && m.data_vencimento.slice(0, 10) < hojeIso));
      }).length;
      if (atrasadas > 0) map.set(chave, atrasadas);
    }
    return map;
  }, [lancamentosPorPessoa]);

  const atrasoPessoas = useMemo(() => pessoas.map((p) => ({
    pessoa: p,
    meses: historicoPorPessoa.get(p.chave) || 0,
    nivel: nivelAtraso(historicoPorPessoa.get(p.chave) || 0),
  })).filter((x) => x.meses > 0), [pessoas, historicoPorPessoa]);

  const quantidadeAtrasados = atrasoPessoas.length;
  const amarelos = atrasoPessoas.filter((x) => x.meses === 2).length;
  const vermelhos = atrasoPessoas.filter((x) => x.meses >= 3).length;

  const inadimplenciaDetalhada = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return atrasoPessoas.map((x) => {
      const lancamentos = (lancamentosPorPessoa.get(x.pessoa.chave) || []).filter((m) => {
        if (m.situacao === "pago" || m.situacao === "isento") return false;
        return Boolean(m.situacao === "em_atraso" || (m.data_vencimento && m.data_vencimento.slice(0, 10) < new Date().toISOString().slice(0, 10)));
      }).sort((a,b) => String(b.competencia || "").localeCompare(String(a.competencia || "")));
      const valorDevido = lancamentos.reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const correspondeBusca = !termo || x.pessoa.nome.toLowerCase().includes(termo) || String(x.pessoa.matricula || "").includes(termo) || String(x.pessoa.cpf || "").includes(termo) || String(x.pessoa.responsavel_nome || "").toLowerCase().includes(termo);
      return { ...x, lancamentos, valorDevido, competencias: lancamentos.map((m) => formatarCompetencia(m.competencia)), ultimaCompetencia: lancamentos[0]?.competencia || null, correspondeBusca };
    }).filter((x) => x.correspondeBusca);
  }, [atrasoPessoas, busca, lancamentosPorPessoa]);

  const [inadimplenciaCarregada, setInadimplenciaCarregada] = useState(false);
  const [carregandoInadimplencia, setCarregandoInadimplencia] = useState(false);

  async function apiFinanceiro(input: string, init: RequestInit = {}) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("Sessão expirada.");
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const response = await fetch(input, { ...init, headers, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "Operação financeira não concluída.");
    return result;
  }

  async function carregarFinanceiro() {
    setCarregandoFinanceiro(true);
    try {
      const result = await apiFinanceiro("/api/financeiro", { method: "GET" });
      const movimentos = (result.movimentos || []) as MovimentoFinanceiro[];
      const contas = (result.contas || []) as ContaBancaria[];
      setContasBancarias(contas);
      setMovimentosFinanceiros(movimentos);

      const socioIds = Array.from(new Set(movimentos.map((m) => m.socio_id).filter(Boolean))) as string[];
      const dependenteIds = Array.from(new Set(movimentos.map((m) => m.dependente_id).filter(Boolean))) as string[];
      const usuarioIds = Array.from(new Set(movimentos.map((m) => m.created_by).filter(Boolean))) as string[];

      if (!socioIds.length && !dependenteIds.length && !usuarioIds.length) {
        setPessoasMovimentos(new Map());
        setUsuariosMovimentos(new Map());
        return;
      }

      const [{ data: socios, error: sociosError }, { data: dependentes, error: dependentesError }, { data: usuarios, error: usuariosError }] = await Promise.all([
        socioIds.length ? supabase.from("socios").select("id,nome,matricula").in("id", socioIds) : Promise.resolve({ data: [], error: null }),
        dependenteIds.length ? supabase.from("dependentes").select("id,nome,socio_id").in("id", dependenteIds) : Promise.resolve({ data: [], error: null }),
        usuarioIds.length ? supabase.from("usuarios_sistema").select("id,nome_exibicao,email").in("id", usuarioIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (sociosError) throw sociosError;
      if (dependentesError) throw dependentesError;
      if (usuariosError) throw usuariosError;

      const socioRows = (socios || []) as Array<{ id: string; nome: string; matricula: string | number | null }>;
      const dependenteRows = (dependentes || []) as Array<{ id: string; nome: string; socio_id: string | null }>;
      const socioMap = new Map(socioRows.map((socio) => [socio.id, socio]));
      const mapa = new Map<string, { nome: string; matricula: string | number | null; tipo: "socio" | "dependente"; responsavelNome?: string | null }>();
      for (const socio of socioRows) mapa.set(`socio:${socio.id}`, { nome: socio.nome, matricula: socio.matricula, tipo: "socio" });
      for (const dependente of dependenteRows) {
        const responsavel = dependente.socio_id ? socioMap.get(dependente.socio_id) : null;
        mapa.set(`dependente:${dependente.id}`, { nome: dependente.nome, matricula: responsavel?.matricula ?? null, tipo: "dependente", responsavelNome: responsavel?.nome ?? null });
      }
      setPessoasMovimentos(mapa);
      const usuarioMap = new Map<string, { nome: string; email: string | null }>();
      for (const usuario of (usuarios || []) as Array<{ id: string; nome_exibicao: string | null; email: string | null }>) {
        usuarioMap.set(String(usuario.id), { nome: usuario.nome_exibicao || "Usuário sem nome", email: usuario.email || null });
      }
      setUsuariosMovimentos(usuarioMap);
    } catch (error) {
      setMensagem(`Não foi possível carregar o Financeiro. ${error instanceof Error ? error.message : "Erro desconhecido."}`);
    } finally {
      setCarregandoFinanceiro(false);
    }
  }

  async function abrirComprovante(path: string | null) {
    if (!path) return;
    if (ehUrlAbsoluta(path)) {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }
    const { data, error } = await supabase.storage
      .from("comprovantes-financeiro")
      .createSignedUrl(path, 10 * 60);
    if (error || !data?.signedUrl) {
      setMensagem(`Não foi possível abrir o comprovante. ${error?.message || "Arquivo não encontrado."}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function carregarInadimplencia() {
    if (inadimplenciaCarregada || carregandoInadimplencia) return;
    setCarregandoInadimplencia(true);
    try {
      const [sociosResult, dependentesResult, mensalidadesResult] = await Promise.all([
        supabase.from("socios").select("id,matricula,nome,cpf,foto_url,situacao,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento").order("matricula", { ascending: true }),
        supabase.from("dependentes").select("id,socio_id,nome,cpf,ativo,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento").order("nome", { ascending: true }),
        supabase.from("mensalidades").select("id,socio_id,dependente_id,competencia,valor,data_vencimento,situacao").order("competencia", { ascending: false }),
      ]);
      if (sociosResult.error) throw sociosResult.error;
      if (dependentesResult.error) throw dependentesResult.error;
      if (mensalidadesResult.error) throw mensalidadesResult.error;
      setSocios((sociosResult.data || []) as Socio[]);
      setDependentes((dependentesResult.data || []) as Dependente[]);
      setMensalidades((mensalidadesResult.data || []) as Mensalidade[]);
      setInadimplenciaCarregada(true);
    } catch (error) {
      setMensagem(
        `Não foi possível carregar a inadimplência. ${
          error instanceof Error ? error.message : "Erro desconhecido."
        }`
      );
    } finally {
      setCarregandoInadimplencia(false);
    }
  }

  useEffect(() => {
    void carregarFinanceiro();
  }, []);

  const saldosPorConta = useMemo(() => {
    const saldos = new Map<string, number>(
      contasBancarias.map((c) => [c.id, Number(c.saldo_inicial || 0)])
    );

    for (const m of movimentosFinanceiros) {
      const valor = Number(m.valor || 0);
      if (m.tipo === "transferencia") {
        saldos.set(
          m.conta_bancaria_id,
          (saldos.get(m.conta_bancaria_id) || 0) - valor
        );
        if (m.conta_destino_id) {
          saldos.set(
            m.conta_destino_id,
            (saldos.get(m.conta_destino_id) || 0) + valor
          );
        }
      } else if (m.tipo === "entrada") {
        saldos.set(
          m.conta_bancaria_id,
          (saldos.get(m.conta_bancaria_id) || 0) + valor
        );
      } else if (m.tipo === "saida") {
        saldos.set(
          m.conta_bancaria_id,
          (saldos.get(m.conta_bancaria_id) || 0) - valor
        );
      }
    }

    return saldos;
  }, [contasBancarias, movimentosFinanceiros]);

  const saldoConta = (conta: ContaBancaria) => saldosPorConta.get(conta.id) || 0;
  const contasPorId = useMemo(() => new Map(contasBancarias.map((conta) => [conta.id, conta])), [contasBancarias]);

  const pessoaDoMovimento = (movimento: MovimentoFinanceiro) => {
    if (movimento.dependente_id) return pessoasMovimentos.get(`dependente:${movimento.dependente_id}`) || null;
    if (movimento.socio_id) return pessoasMovimentos.get(`socio:${movimento.socio_id}`) || null;
    return null;
  };

  const usuarioDoMovimento = (movimento: MovimentoFinanceiro) => {
    if (!movimento.created_by) return null;
    return usuariosMovimentos.get(movimento.created_by) || null;
  };

  const saldoTotalBancos = useMemo(
    () => Array.from(saldosPorConta.values()).reduce((sum: number, saldo: number) => sum + saldo, 0),
    [saldosPorConta]
  );

  const estornosPorOrigem = useMemo(() => new Set(
    movimentosFinanceiros
      .filter((m) => String(m.origem_tipo || "").startsWith("estorno_") && m.origem_id)
      .map((m) => String(m.origem_id))
  ), [movimentosFinanceiros]);

  const movimentosFluxo = useMemo(() => {
    return movimentosFinanceiros.filter((m) => {
      const data = String(m.data_movimentacao || "").slice(0, 10);
      if (fluxoInicio && data < fluxoInicio) return false;
      if (fluxoFim && data > fluxoFim) return false;
      if (fluxoConta && m.conta_bancaria_id !== fluxoConta) return false;

      if (abaFinanceira === "entradas" && m.tipo !== "entrada") return false;
      if (abaFinanceira === "saidas" && m.tipo !== "saida") return false;
      if (
        abaFinanceira === "aluguéis" &&
        !String(m.categoria || "").toLowerCase().includes("alug")
      ) return false;

      if (abaFinanceira === "fluxo" && fluxoTipo !== "todos" && m.tipo !== fluxoTipo) return false;
      if (fluxoForma !== "todos" && String(m.forma_pagamento || "") !== fluxoForma) return false;
      return true;
    });
  }, [movimentosFinanceiros, fluxoInicio, fluxoFim, fluxoConta, fluxoTipo, fluxoForma, abaFinanceira]);

  const entradasPeriodo = movimentosFluxo
    .filter((m) => m.tipo === "entrada")
    .reduce((sum, m) => sum + Number(m.valor || 0), 0);
  const saidasPeriodo = movimentosFluxo
    .filter((m) => m.tipo === "saida")
    .reduce((sum, m) => sum + Number(m.valor || 0), 0);
  const transferenciasPeriodo = movimentosFluxo
    .filter((m) => m.tipo === "transferencia")
    .reduce((sum, m) => sum + Number(m.valor || 0), 0);

  function selecionarAbaFinanceira(aba: typeof abaFinanceira) {
    setAbaFinanceira(aba);
    if (aba === "entradas") setFluxoTipo("entrada");
    else if (aba === "saidas") setFluxoTipo("saida");
    else if (aba === "fluxo") { setFluxoTipo("todos"); setFluxoForma("todos"); }
    if (aba === "aluguéis") {
      setMovTipo("entrada");
      setMovCategoria("Aluguel");
    }
    if (aba === "inadimplencia") void carregarInadimplencia();
  }

  async function estornarReserva(movimento: MovimentoFinanceiro) {
    if (movimento.origem_tipo !== "reserva" || !movimento.origem_id) return;
    const motivo = window.prompt(
      `Motivo do estorno da reserva de ${formatarMoeda(movimento.valor)}:`,
      "Cancelamento da reserva e devolução do pagamento."
    );
    if (motivo === null) return;
    const ok = window.confirm(
      `Confirmar estorno do pagamento de ${formatarMoeda(movimento.valor)}?\n\nA reserva será cancelada e o estorno ficará registrado no Financeiro.`
    );
    if (!ok) return;

    setMovimentoEstornandoId(movimento.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");
      const response = await fetch("/api/reservas", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: movimento.origem_id, acao: "estornar_pagamento", motivo: motivo.trim() || "Não informado" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Não foi possível estornar a reserva.");
      await carregarFinanceiro();
      setMensagem(result.message || "Pagamento da reserva estornado e reserva cancelada.");
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Não foi possível estornar a reserva.");
    } finally {
      setMovimentoEstornandoId(null);
    }
  }

  async function estornarMovimento(movimento: MovimentoFinanceiro) {
    const origem = String(movimento.origem_tipo || "").toLowerCase();
    if (!["manual", "transferencia"].includes(origem)) {
      setMensagem("Este lançamento está vinculado a outro módulo. Use o estorno no módulo de origem para manter os registros sincronizados.");
      return;
    }
    const motivo = window.prompt(
      `Motivo do estorno de ${formatarMoeda(movimento.valor)}:`,
      "Correção de lançamento."
    );
    if (motivo === null) return;
    const ok = window.confirm(`Confirmar estorno de ${movimento.tipo === "entrada" ? "entrada" : movimento.tipo === "saida" ? "saída" : "transferência"} de ${formatarMoeda(movimento.valor)}?\n\nO histórico original será preservado.`);
    if (!ok) return;
    setMovimentoEstornandoId(movimento.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");
      const response = await fetch("/api/financeiro", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "estornar_movimento", id: movimento.id, motivo: motivo.trim() || "Não informado" }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Não foi possível estornar o lançamento.");
      await carregarFinanceiro();
      setMensagem(result.message || "Estorno registrado com sucesso.");
    } catch (error) {
      setMensagem(error instanceof Error ? error.message : "Não foi possível estornar o lançamento.");
    } finally {
      setMovimentoEstornandoId(null);
    }
  }

  function abrirNovaMovimentacao(tipo: "entrada" | "saida" = "saida") {
    setMovTipo(tipo);
    setMovConta((atual) => atual || contasBancarias[0]?.id || "");
    setMovCategoria(tipo === "entrada" ? "Recebimento" : "Despesa");
    setMovDescricao("");
    setMovValor("");
    setMovData(new Date().toISOString().slice(0, 10));
    setMovForma("pix");
    setMovObservacoes("");
    setMovArquivo(null);
    setMostrarMovimentoModal(true);
  }

  function abrirNovaTransferencia() {
    setTransOrigem(contasBancarias[0]?.id || "");
    setTransDestino(contasBancarias[1]?.id || "");
    setTransValor("");
    setTransData(new Date().toISOString().slice(0, 10));
    setTransDescricao("Transferência entre contas");
    setTransObservacoes("");
    setMostrarTransferenciaModal(true);
  }

  async function salvarContaBancaria() {
    if (salvandoConta) return;
    if (!contaNome.trim()) { setMensagem("Informe o nome da conta."); return; }
    const saldoInicial = Number(String(contaSaldoInicial || "0").replace(",", "."));
    if (!Number.isFinite(saldoInicial) || saldoInicial < 0) { setMensagem("Informe um saldo inicial válido."); return; }
    setSalvandoConta(true);
    try {
      const result = await apiFinanceiro("/api/financeiro", {
        method: "POST",
        body: JSON.stringify({
          acao: "salvar_conta",
          id: contaEditando?.id || null,
          nome: contaNome.trim(),
          banco: contaBanco,
          agencia: contaAgencia,
          conta: contaNumero,
          saldo_inicial: saldoInicial,
          data_saldo_inicial: contaDataSaldo || null,
          observacoes: contaObservacoes,
        }),
      });
      const conta = result.conta as ContaBancaria;
      if (contaEditando) setContasBancarias((lista) => lista.map((c) => c.id === contaEditando.id ? conta : c));
      else setContasBancarias((lista) => [...lista, conta].sort((a, b) => a.nome.localeCompare(b.nome)));
      setMostrarContaModal(false);
      setContaEditando(null);
      setContaNome(""); setContaBanco(""); setContaAgencia(""); setContaNumero(""); setContaSaldoInicial("0"); setContaObservacoes("");
      setMensagem("Conta bancária salva com sucesso.");
    } catch (error) {
      setMensagem(`Não foi possível salvar a conta. ${error instanceof Error ? error.message : "Erro desconhecido."}`);
    } finally {
      setSalvandoConta(false);
    }
  }

  function abrirNovaConta() { setContaEditando(null); setContaNome(""); setContaBanco(""); setContaAgencia(""); setContaNumero(""); setContaSaldoInicial("0"); setContaDataSaldo(new Date().toISOString().slice(0,10)); setContaObservacoes(""); setMostrarContaModal(true); }
  function editarConta(c: ContaBancaria) { setContaEditando(c); setContaNome(c.nome); setContaBanco(c.banco || ""); setContaAgencia(c.agencia || ""); setContaNumero(c.conta || ""); setContaSaldoInicial(String(c.saldo_inicial || 0)); setContaDataSaldo(c.data_saldo_inicial || new Date().toISOString().slice(0,10)); setContaObservacoes(c.observacoes || ""); setMostrarContaModal(true); }

  function abrirConferenciaSaldo(c: ContaBancaria) {
    setContaConferindo(c);
    setSaldoConferido(saldoConta(c).toFixed(2));
    setDataConferencia(new Date().toISOString().slice(0, 10));
    setObservacaoConferencia("Conferência do saldo bancário");
  }

  async function salvarConferenciaSaldo() {
    if (!contaConferindo) return;
    const saldoInformado = Number(String(saldoConferido).replace(",", "."));
    if (!Number.isFinite(saldoInformado) || saldoInformado < 0) { setMensagem("Informe um saldo bancário válido."); return; }
    setSalvandoConferencia(true);
    try {
      const result = await apiFinanceiro("/api/financeiro", {
        method: "POST",
        body: JSON.stringify({
          acao: "conferir_saldo",
          conta_bancaria_id: contaConferindo.id,
          saldo_banco: saldoInformado,
          data_conferencia: dataConferencia,
          observacao: observacaoConferencia || "Conferência do saldo bancário",
        }),
      });
      const diferenca = Number(result.conferencia?.diferenca || 0);
      setMensagem(diferenca === 0
        ? `Saldo de ${contaConferindo.nome} conferido: ${formatarMoeda(saldoInformado)}.`
        : `Conferência de ${contaConferindo.nome} registrada. Diferença: ${formatarMoeda(diferenca)}.`);
      setContaConferindo(null);
    } catch (error) {
      setMensagem(`Não foi possível registrar a conferência. ${error instanceof Error ? error.message : "Erro desconhecido."}`);
    } finally {
      setSalvandoConferencia(false);
    }
  }

  async function salvarMovimentoFinanceiro() {
    if (salvandoMovimento) return;
    const valor = Number(String(movValor || "0").replace(",", "."));
    if (!movConta || !movDescricao.trim() || !Number.isFinite(valor) || valor <= 0) { setMensagem("Informe conta, descrição e valor válido."); return; }
    setSalvandoMovimento(true);
    try {
      const form = new FormData();
      form.set("acao", "salvar_movimento");
      form.set("conta_bancaria_id", movConta);
      form.set("tipo", movTipo);
      form.set("categoria", movCategoria || "");
      form.set("descricao", movDescricao.trim());
      form.set("valor", String(valor));
      form.set("data_movimentacao", movData);
      form.set("forma_pagamento", movForma || "");
      form.set("observacoes", movObservacoes || "");
      if (movArquivo) form.set("arquivo", movArquivo);
      const result = await apiFinanceiro("/api/financeiro", { method: "POST", body: form });
      const movimento = result.movimento as MovimentoFinanceiro;
      setMovimentosFinanceiros((lista) => [movimento, ...lista]);
      setMostrarMovimentoModal(false);
      setMovDescricao(""); setMovValor(""); setMovCategoria(""); setMovObservacoes(""); setMovArquivo(null);
      setMensagem("Movimentação registrada com sucesso.");
    } catch (error) {
      setMensagem(`Não foi possível registrar a movimentação. ${error instanceof Error ? error.message : "Erro desconhecido."}`);
    } finally {
      setSalvandoMovimento(false);
    }
  }

  async function salvarTransferencia() {
    if (salvandoTransferencia) return;
    const valor = Number(String(transValor || "0").replace(",", "."));
    if (!transOrigem || !transDestino || transOrigem === transDestino || !Number.isFinite(valor) || valor <= 0) { setMensagem("Informe contas diferentes e um valor válido."); return; }
    setSalvandoTransferencia(true);
    try {
      const result = await apiFinanceiro("/api/financeiro", {
        method: "POST",
        body: JSON.stringify({
          acao: "transferencia",
          conta_origem_id: transOrigem,
          conta_destino_id: transDestino,
          valor,
          data_movimentacao: transData,
          descricao: transDescricao || "Transferência entre contas",
          observacoes: transObservacoes || null,
        }),
      });
      const movimento = result.movimento as MovimentoFinanceiro;
      setMovimentosFinanceiros((lista) => [movimento, ...lista]);
      setMostrarTransferenciaModal(false);
      setTransValor(""); setTransDescricao("Transferência entre contas"); setTransObservacoes("");
      setMensagem("Transferência registrada com sucesso.");
    } catch (error) {
      setMensagem(`Não foi possível registrar a transferência. ${error instanceof Error ? error.message : "Erro desconhecido."}`);
    } finally {
      setSalvandoTransferencia(false);
    }
  }


  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">
      <CabecalhoPadrao />

      <div className="min-h-[calc(100vh-80px)]">
        <MenuLateralPadrao />

                <section className="min-w-0 flex-1 bg-[#f8faf9] p-5 sm:p-7 lg:ml-[220px] lg:p-8">
          <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-medium text-gray-500">Administração</p>
              <h2 className="mt-1 text-3xl font-bold text-[#005a3c]">
                Financeiro
              </h2>
              <p className="mt-1 text-gray-500">
                Contas bancárias, receitas, despesas e fluxo de caixa.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void carregarFinanceiro()}
                disabled={carregandoFinanceiro}
                className="rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] disabled:opacity-60"
              >
                {carregandoFinanceiro ? "Atualizando..." : "↻ Atualizar"}
              </button>
              <button
                onClick={() => setAbaFinanceira("contas")}
                className={`rounded-xl border border-[#cfe3d8] px-4 py-3 text-sm font-bold ${abaFinanceira === "contas" ? "bg-[#e8f3ee] text-[#005a3c]" : "bg-white text-[#005a3c]"}`}
              >
                🏦 Contas bancárias
              </button>
              <button
                onClick={() => setAbaFinanceira("fluxo")}
                className={`rounded-xl px-4 py-3 text-sm font-bold shadow-sm ${abaFinanceira === "fluxo" ? "bg-[#005a3c] text-white" : "border border-[#cfe3d8] bg-white text-[#005a3c]"}`}
              >
                📊 Fluxo de caixa
              </button>
            </div>
          </div>

          {carregandoFinanceiro && contasBancarias.length === 0 && movimentosFinanceiros.length === 0 && (
            <div className="mb-5 rounded-xl border border-[#cfe3d8] bg-[#eef7f2] px-4 py-3 text-sm font-semibold text-[#005a3c]">
              Carregando contas e movimentações...
            </div>
          )}

          {mensagem && (
            <div className="mb-5 rounded-xl border border-[#cfe3d8] bg-[#eef7f2] px-4 py-3 text-sm font-semibold text-[#005a3c]">
              {mensagem}
            </div>
          )}

          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Resumo
              titulo="Saldo em bancos"
              valor={formatarMoeda(saldoTotalBancos)}
              subtitulo={`${contasBancarias.length} conta(s) ativa(s)`}
              destaque
            />
            <Resumo
              titulo="Entradas"
              valor={formatarMoeda(entradasPeriodo)}
              subtitulo="Movimentações financeiras"
            />
            <Resumo
              titulo="Saídas"
              valor={formatarMoeda(saidasPeriodo)}
              subtitulo="Movimentações financeiras"
            />
            <Resumo
              titulo="Resultado"
              valor={formatarMoeda(entradasPeriodo - saidasPeriodo)}
              subtitulo="Entradas − saídas"
            />
          </div>

          <div className="mb-6 border-b border-[#dfe9e3]">
            <div className="flex flex-wrap gap-1 overflow-x-auto">
              {[
                ["aluguéis", "🏠", "Aluguéis"],
                ["entradas", "💵", "Entradas"],
                ["saidas", "💸", "Saídas"],
                ["inadimplencia", "🚨", `Inadimplência${quantidadeAtrasados > 0 ? ` (${quantidadeAtrasados})` : ""}`],
                ["contas", "🏦", "Contas bancárias"],
                ["fluxo", "📊", "Fluxo de caixa"],
              ].map(([id, icone, label]) => (
                <button
                  key={id}
                  onClick={() => selecionarAbaFinanceira(id as typeof abaFinanceira)}
                  className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold transition ${
                    abaFinanceira === id
                      ? "text-[#005a3c]"
                      : "text-[#8a9a92] hover:text-[#005a3c]"
                  }`}
                >
                  <span className="text-base">{icone}</span>
                  {label}
                  {abaFinanceira === id && (
                    <span className="absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-[#005a3c]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {abaFinanceira === "inadimplencia" && (
            <div className="mb-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Resumo
                  titulo="Total inadimplentes"
                  valor={String(quantidadeAtrasados)}
                  subtitulo="Sócios e dependentes"
                />
                <Resumo
                  titulo="2 meses"
                  valor={String(amarelos)}
                  subtitulo="Atenção"
                />
                <Resumo
                  titulo="3+ meses"
                  valor={String(vermelhos)}
                  subtitulo="Inadimplência crítica"
                />
                <Resumo
                  titulo="Valor total devido"
                  valor={formatarMoeda(
                    inadimplenciaDetalhada.reduce(
                      (soma, item) => soma + item.valorDevido,
                      0
                    )
                  )}
                  subtitulo="Mensalidades vencidas"
                />
              </div>

              <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-lg font-extrabold text-red-700">
                      {quantidadeAtrasados > 0
                        ? `⚠️ ${quantidadeAtrasados} ${
                            quantidadeAtrasados === 1 ? "sócio" : "sócios"
                          } em atraso`
                        : "✓ Nenhum sócio em atraso"}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      🟢 0–1 mês · 🟡 2 meses · 🔴 3 meses ou mais.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      (window.location.href = "/relatorios/inadimplencia")
                    }
                    className="rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white"
                  >
                    📊 Relatório completo
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-extrabold text-[#003d2b]">
                      Lista de inadimplentes
                    </h3>
                    <p className="text-sm text-gray-500">
                      Controle quem está em atraso e quantos meses estão pendentes.
                    </p>
                  </div>
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar nome, matrícula ou responsável..."
                    className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 text-sm outline-none focus:border-[#005a3c] sm:max-w-md"
                  />
                </div>

                <div className="mb-4 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-green-100 px-3 py-2 text-green-700">
                    🟢 Em dia: não aparece nesta lista
                  </span>
                  <span className="rounded-full bg-yellow-100 px-3 py-2 text-yellow-700">
                    🟡 2 meses: {amarelos}
                  </span>
                  <span className="rounded-full bg-red-100 px-3 py-2 text-red-700">
                    🔴 3+ meses: {vermelhos}
                  </span>
                </div>

                {inadimplenciaDetalhada.length === 0 ? (
                  <div className="rounded-xl bg-[#f7faf8] p-10 text-center">
                    <div className="text-4xl">✅</div>
                    <p className="mt-3 font-bold text-gray-700">
                      Nenhum inadimplente encontrado
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      Quando houver mensalidades vencidas, elas aparecerão aqui.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                      <thead className="bg-[#e8f3ee]">
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-3">Pessoa</th>
                          <th className="px-4 py-3">Matrícula</th>
                          <th className="px-4 py-3">Responsável</th>
                          <th className="px-4 py-3">Meses</th>
                          <th className="px-4 py-3">Competências</th>
                          <th className="px-4 py-3">Valor devido</th>
                          <th className="px-4 py-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {inadimplenciaDetalhada.map((item) => (
                          <tr key={item.pessoa.chave} className="hover:bg-[#fafcfb]">
                            <td className="px-4 py-4">
                              <p className="font-bold text-[#173d2e]">
                                {item.pessoa.nome}
                              </p>
                              {item.pessoa.dependente_id && (
                                <p className="text-xs text-gray-500">Dependente</p>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              {item.pessoa.matricula || "—"}
                            </td>
                            <td className="px-4 py-4">
                              {item.pessoa.responsavel_nome || "Titular"}
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${item.nivel.classe}`}
                              >
                                {item.meses}{" "}
                                {item.meses === 1 ? "mês" : "meses"}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600">
                              {item.competencias.join(", ")}
                            </td>
                            <td className="px-4 py-4 font-extrabold text-red-600">
                              {formatarMoeda(item.valorDevido)}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <button
                                onClick={() => {
                                  window.location.href = "/socios";
                                }}
                                className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-xs font-bold text-[#005a3c]"
                              >
                                Abrir cadastro
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {abaFinanceira !== "inadimplencia" && (
            <div className="mb-6 space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <Resumo titulo="Entradas no período" valor={formatarMoeda(entradasPeriodo)} subtitulo="Conforme filtro aplicado" />
                <Resumo titulo="Saídas no período" valor={formatarMoeda(saidasPeriodo)} subtitulo="Conforme filtro aplicado" />
                <Resumo titulo="Resultado do período" valor={formatarMoeda(entradasPeriodo - saidasPeriodo)} subtitulo="Entradas − saídas" />
              </div>

              {abaFinanceira === "contas" && (
                <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div><h3 className="text-lg font-extrabold text-[#003d2b]">Contas bancárias</h3><p className="text-sm text-gray-500">Cadastre os bancos e acompanhe o saldo real de cada conta.</p></div>
                    <div className="flex gap-2"><button onClick={() => abrirNovaMovimentacao("saida")} className="rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-bold text-[#005a3c]">＋ Movimentação</button><button onClick={abrirNovaTransferencia} className="rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-bold text-[#005a3c]">↔ Transferência</button><button onClick={abrirNovaConta} className="rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white">＋ Nova conta</button></div>
                  </div>
                  {contasBancarias.length === 0 ? <div className="rounded-xl bg-[#f7faf8] p-8 text-center text-sm text-gray-500">Nenhuma conta cadastrada. Clique em “Nova conta”.</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{contasBancarias.map((c) => <div key={c.id} className="rounded-2xl border border-[#dfe9e3] bg-[#fafcfb] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Conta</p><h4 className="mt-1 font-extrabold text-[#003d2b]">{c.nome}</h4><p className="text-sm text-gray-500">{c.banco || "Banco não informado"}</p></div><button onClick={() => editarConta(c)} className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-xs font-bold text-[#005a3c]">✏️</button></div><p className="mt-4 text-2xl font-extrabold text-[#005a3c]">{formatarMoeda(saldoConta(c))}</p><p className="mt-1 text-xs text-gray-500">Ag. {c.agencia || "—"} · Conta {c.conta || "—"}</p><p className="mt-3 text-xs text-gray-400">Saldo de abertura: {formatarMoeda(c.saldo_inicial)}</p><div className="mt-4 flex gap-2"><button onClick={() => abrirConferenciaSaldo(c)} className="flex-1 rounded-xl border border-[#cfe3d8] bg-white px-3 py-2 text-xs font-bold text-[#005a3c]">✓ Conferir saldo</button><button onClick={() => { setAbaFinanceira("fluxo"); }} className="rounded-xl bg-[#e8f3ee] px-3 py-2 text-xs font-bold text-[#005a3c]">Extrato</button></div></div>)}</div>}
                </div>
              )}

              {["fluxo", "entradas", "saidas", "aluguéis"].includes(abaFinanceira) && (
                <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
                  <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-lg font-extrabold text-[#003d2b]">
                        {abaFinanceira === "aluguéis"
                          ? "Aluguéis recebidos"
                          : abaFinanceira === "entradas"
                            ? "Entradas financeiras"
                            : abaFinanceira === "saidas"
                              ? "Saídas financeiras"
                              : "Livro de movimentações"}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {abaFinanceira === "aluguéis"
                          ? "Registre e acompanhe os valores recebidos pelo aluguel dos espaços da Sociedade."
                          : "Entradas, saídas e transferências ficam registradas para prestação de contas."}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          if (abaFinanceira === "aluguéis") {
                            abrirNovaMovimentacao("entrada");
                            setMovCategoria("Aluguel");
                          } else {
                            abrirNovaMovimentacao("saida");
                          }
                        }}
                        className="rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white"
                      >
                        ＋ {abaFinanceira === "aluguéis" ? "Novo aluguel" : "Nova movimentação"}
                      </button>
                      {abaFinanceira === "fluxo" && (
                        <button onClick={abrirNovaTransferencia} className="rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-bold text-[#005a3c]">
                          ↔ Transferência
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-5 rounded-2xl bg-[#f7faf8] p-4">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold text-[#003d2b]">Filtros do fluxo de caixa</p>
                        <p className="text-xs text-gray-500">Consulte por período, banco e tipo de movimentação.</p>
                      </div>
                      <button
                        onClick={() => { setFluxoInicio(""); setFluxoFim(""); setFluxoConta(""); setFluxoTipo("todos"); setFluxoForma("todos"); }}
                        className="rounded-lg border border-[#cfe3d8] bg-white px-3 py-2 text-xs font-bold text-[#005a3c]"
                      >
                        Limpar filtros
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Campo label="Data inicial" type="date" value={fluxoInicio} onChange={setFluxoInicio} />
                      <Campo label="Data final" type="date" value={fluxoFim} onChange={setFluxoFim} />
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-700">Conta</label>
                        <select value={fluxoConta} onChange={(e) => setFluxoConta(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3">
                          <option value="">Todas as contas</option>
                          {contasBancarias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-700">Tipo</label>
                        <select
                          value={abaFinanceira === "entradas" ? "entrada" : abaFinanceira === "saidas" ? "saida" : fluxoTipo}
                          disabled={abaFinanceira === "entradas" || abaFinanceira === "saidas"}
                          onChange={(e) => setFluxoTipo(e.target.value as typeof fluxoTipo)}
                          className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 disabled:bg-gray-100"
                        >
                          <option value="todos">Todos</option>
                          <option value="entrada">Entradas</option>
                          <option value="saida">Saídas</option>
                          <option value="transferencia">Transferências</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-700">Forma de pagamento</label>
                        <select value={fluxoForma} onChange={(e) => setFluxoForma(e.target.value as typeof fluxoForma)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3">
                          <option value="todos">Todas</option>
                          <option value="pix">PIX</option>
                          <option value="debito_em_conta">Débito em conta</option>
                          <option value="boleto">Boleto</option>
                          <option value="dinheiro">Dinheiro</option>
                          <option value="transferencia">Transferência</option>
                          <option value="outro">Outro</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="mb-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                      <p className="text-xs font-semibold text-gray-500">Entradas no filtro</p>
                      <p className="mt-1 text-xl font-extrabold text-green-700">{formatarMoeda(entradasPeriodo)}</p>
                    </div>
                    <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                      <p className="text-xs font-semibold text-gray-500">Saídas no filtro</p>
                      <p className="mt-1 text-xl font-extrabold text-red-700">{formatarMoeda(saidasPeriodo)}</p>
                    </div>
                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                      <p className="text-xs font-semibold text-gray-500">Transferências no filtro</p>
                      <p className="mt-1 text-xl font-extrabold text-blue-700">{formatarMoeda(transferenciasPeriodo)}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1050px]">
                      <thead className="bg-[#e8f3ee]">
                        <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-3">Data / hora</th>
                          <th className="px-4 py-3">Associado</th>
                          <th className="px-4 py-3">Registrado por</th>
                          <th className="px-4 py-3">Conta</th>
                          <th className="px-4 py-3">Descrição</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3">Valor</th>
                          <th className="px-4 py-3">Conciliação</th>
                          <th className="px-4 py-3">Comprovante</th>
                          <th className="px-4 py-3">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {movimentosFluxo.map((m) => (
                          <tr key={m.id} className="hover:bg-[#fafcfb]">
                            <td className="px-4 py-3 text-sm">
                              <div className="font-semibold">{formatarData(m.data_movimentacao)}</div>
                              <div className="text-xs text-gray-500">{formatarHora(m.created_at)}</div>
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                const pessoa = pessoaDoMovimento(m);
                                if (!pessoa) return <span className="text-gray-400">—</span>;
                                return (
                                  <div>
                                    <div className="font-semibold">{pessoa.nome}</div>
                                    <div className="text-xs text-gray-500">{pessoa.tipo === "dependente" ? "Dependente" : "Associado"}{pessoa.matricula ? ` • ${pessoa.matricula}` : ""}</div>
                                    {pessoa.tipo === "dependente" && pessoa.responsavelNome ? <div className="text-xs text-gray-400">Resp.: {pessoa.responsavelNome}</div> : null}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                const usuario = usuarioDoMovimento(m);
                                if (!usuario) return <span className="text-xs text-gray-400">Não identificado</span>;
                                return (
                                  <div>
                                    <div className="font-semibold">{usuario.nome}</div>
                                    {usuario.email ? <div className="text-xs text-gray-400">{usuario.email}</div> : null}
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 font-semibold">{contasPorId.get(m.conta_bancaria_id)?.nome || "—"}</td>
                            <td className="px-4 py-3">
                              <p className="font-semibold">{m.descricao}</p>
                              <p className="text-xs text-gray-500">{m.categoria || "Sem categoria"}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${m.tipo === "entrada" ? "bg-green-100 text-green-700" : m.tipo === "saida" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                                {m.tipo === "entrada" ? "Entrada" : m.tipo === "saida" ? "Saída" : "Transferência"}
                              </span>
                            </td>
                            <td className={`px-4 py-3 font-bold ${m.tipo === "entrada" ? "text-green-700" : m.tipo === "saida" ? "text-red-700" : "text-blue-700"}`}>
                              {m.tipo === "saida" ? "− " : m.tipo === "entrada" ? "+ " : "↔ "}{formatarMoeda(m.valor)}
                            </td>
                            <td className="px-4 py-3 text-sm">{m.conciliado ? "✅ Conferido" : "⏳ Pendente"}</td>
                            <td className="px-4 py-3 text-sm">
                              {m.comprovante_url ? (
                                <button onClick={() => void abrirComprovante(m.comprovante_url)} className="font-bold text-[#005a3c] underline">Abrir</button>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {estornosPorOrigem.has(m.id) ? (
                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">↩ Estornado</span>
                              ) : m.origem_tipo === "reserva" ? (
                                <button disabled={movimentoEstornandoId === m.id} onClick={() => void estornarReserva(m)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">
                                  {movimentoEstornandoId === m.id ? "Estornando..." : "↩ Estornar reserva"}
                                </button>
                              ) : m.origem_tipo === "manual" || m.origem_tipo === "transferencia" ? (
                                <button disabled={movimentoEstornandoId === m.id} onClick={() => void estornarMovimento(m)} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">
                                  {movimentoEstornandoId === m.id ? "Estornando..." : "↩ Estornar"}
                                </button>
                              ) : String(m.origem_tipo || "").startsWith("estorno_") ? (
                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">Estornado</span>
                              ) : (
                                <span className="text-xs text-gray-400">Módulo de origem</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {movimentosFluxo.length === 0 && (
                          <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-500">Nenhuma movimentação encontrada com esses filtros.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}


        </section>
      </div>

      {mostrarContaModal && (
        <Modal titulo={contaEditando ? "Editar conta bancária" : "Nova conta bancária"} fechar={() => setMostrarContaModal(false)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Campo label="Nome da conta" value={contaNome} onChange={setContaNome} />
            <Campo label="Banco" value={contaBanco} onChange={setContaBanco} />
            <Campo label="Agência" value={contaAgencia} onChange={setContaAgencia} />
            <Campo label="Número da conta" value={contaNumero} onChange={setContaNumero} />
            <Campo label="Saldo inicial" type="number" value={contaSaldoInicial} onChange={setContaSaldoInicial} />
            <Campo label="Data do saldo inicial" type="date" value={contaDataSaldo} onChange={setContaDataSaldo} />
            <div className="md:col-span-2"><label className="mb-2 block text-sm font-semibold text-gray-700">Observações</label><textarea rows={3} value={contaObservacoes} onChange={(e)=>setContaObservacoes(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3" /></div>
            <div className="flex justify-end gap-3 md:col-span-2"><button onClick={()=>setMostrarContaModal(false)} className="rounded-xl border px-5 py-3 font-semibold">Cancelar</button><button disabled={salvandoConta} onClick={()=>void salvarContaBancaria()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-60">{salvandoConta ? "Salvando..." : "Salvar conta"}</button></div>
          </div>
        </Modal>
      )}

      {contaConferindo && (
        <Modal titulo={`Conferir saldo — ${contaConferindo.nome}`} fechar={() => setContaConferindo(null)}>
          <div className="space-y-5">
            <div className="rounded-2xl bg-[#e8f3ee] p-4">
              <p className="text-sm text-gray-500">Saldo calculado pelo sistema</p>
              <p className="mt-1 text-3xl font-extrabold text-[#005a3c]">{formatarMoeda(saldoConta(contaConferindo))}</p>
              <p className="mt-1 text-xs text-gray-500">Saldo de abertura + entradas − saídas + transferências.</p>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Saldo real informado pelo banco</label>
              <input type="number" step="0.01" min="0" value={saldoConferido} onChange={(e) => setSaldoConferido(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 text-lg font-bold outline-none focus:border-[#005a3c]" />
              <p className="mt-2 text-xs text-gray-500">A conferência fica registrada separadamente e não cria entrada nem saída no caixa.</p>
            </div>
            <Campo label="Data da conferência" type="date" value={dataConferencia} onChange={setDataConferencia} />
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Observação</label>
              <textarea rows={3} value={observacaoConferencia} onChange={(e) => setObservacaoConferencia(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3" />
            </div>
            <div className="rounded-xl bg-yellow-50 p-3 text-sm text-yellow-800">
              <strong>Transparência:</strong> o saldo inicial e as movimentações não serão alterados. A diferença ficará registrada apenas no histórico de conferência bancária.
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setContaConferindo(null)} className="rounded-xl border px-5 py-3 font-semibold">Cancelar</button>
              <button disabled={salvandoConferencia} onClick={() => void salvarConferenciaSaldo()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-50">{salvandoConferencia ? "Salvando..." : "Conferir e salvar saldo"}</button>
            </div>
          </div>
        </Modal>
      )}

      {mostrarMovimentoModal && (
        <Modal titulo="Nova movimentação financeira" fechar={() => setMostrarMovimentoModal(false)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-2 block text-sm font-semibold text-gray-700">Tipo</label><select value={movTipo} onChange={(e)=>setMovTipo(e.target.value as "entrada"|"saida")} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3"><option value="entrada">Entrada</option><option value="saida">Saída</option></select></div>
            <div><label className="mb-2 block text-sm font-semibold text-gray-700">Conta bancária</label><select value={movConta} onChange={(e)=>setMovConta(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3"><option value="">Selecione</option>{contasBancarias.map(c=><option key={c.id} value={c.id}>{c.nome} — {c.banco || ""}</option>)}</select></div>
            <Campo label="Categoria" value={movCategoria} onChange={setMovCategoria} />
            <Campo label="Descrição" value={movDescricao} onChange={setMovDescricao} />
            <Campo label="Valor" type="number" value={movValor} onChange={setMovValor} />
            <Campo label="Data" type="date" value={movData} onChange={setMovData} />
            <div><label className="mb-2 block text-sm font-semibold text-gray-700">Forma de pagamento</label><select value={movForma} onChange={(e)=>setMovForma(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3">{FORMAS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
            <div><label className="mb-2 block text-sm font-semibold text-gray-700">Comprovante</label><input type="file" accept="image/*,.pdf" onChange={(e)=>setMovArquivo(e.target.files?.[0]||null)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 text-sm" /></div>
            <div className="md:col-span-2"><label className="mb-2 block text-sm font-semibold text-gray-700">Observações</label><textarea rows={3} value={movObservacoes} onChange={(e)=>setMovObservacoes(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3" /></div>
            <div className="flex justify-end gap-3 md:col-span-2"><button onClick={()=>setMostrarMovimentoModal(false)} className="rounded-xl border px-5 py-3 font-semibold">Cancelar</button><button disabled={salvandoMovimento} onClick={()=>void salvarMovimentoFinanceiro()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-60">{salvandoMovimento ? "Registrando..." : "Registrar movimentação"}</button></div>
          </div>
        </Modal>
      )}

      {mostrarTransferenciaModal && (
        <Modal titulo="Transferência entre contas" fechar={() => setMostrarTransferenciaModal(false)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="mb-2 block text-sm font-semibold text-gray-700">Conta de origem</label><select value={transOrigem} onChange={(e)=>setTransOrigem(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3"><option value="">Selecione</option>{contasBancarias.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
            <div><label className="mb-2 block text-sm font-semibold text-gray-700">Conta de destino</label><select value={transDestino} onChange={(e)=>setTransDestino(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3"><option value="">Selecione</option>{contasBancarias.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></div>
            <Campo label="Valor" type="number" value={transValor} onChange={setTransValor} />
            <Campo label="Data" type="date" value={transData} onChange={setTransData} />
            <Campo label="Descrição" value={transDescricao} onChange={setTransDescricao} />
            <div className="md:col-span-2"><label className="mb-2 block text-sm font-semibold text-gray-700">Observações</label><textarea rows={3} value={transObservacoes} onChange={(e)=>setTransObservacoes(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3" /></div>
            <div className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800 md:col-span-2">A transferência reduz o saldo da conta de origem e aumenta o saldo da conta de destino, sem contar como receita ou despesa.</div>
            <div className="flex justify-end gap-3 md:col-span-2"><button onClick={()=>setMostrarTransferenciaModal(false)} className="rounded-xl border px-5 py-3 font-semibold">Cancelar</button><button disabled={salvandoTransferencia} onClick={()=>void salvarTransferencia()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-60">{salvandoTransferencia ? "Transferindo..." : "Transferir"}</button></div>
          </div>
        </Modal>
      )}


    </main>
  );
}
