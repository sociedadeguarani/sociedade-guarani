"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Socio = {
  id: string;
  matricula: number | null;
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
  conta_bancaria_id: string | null;
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
  conta_bancaria_id: string | null;
};

type Mensalidade = {
  id: string;
  socio_id: string;
  dependente_id: string | null;
  competencia: string;
  valor: number;
  data_vencimento: string | null;
  situacao: string | null;
  data_pagamento: string | null;
  tipo_pagamento: string | null;
  comprovante_url: string | null;
  observacoes: string | null;
  numero_recibo?: string | null;
  created_at?: string;
};

type PessoaFinanceira = {
  chave: string;
  socio_id: string;
  dependente_id: string | null;
  nome: string;
  matricula: number | null;
  cpf: string | null;
  foto_url: string | null;
  responsavel_nome: string | null;
  possui_mensalidade: boolean;
  valor_mensalidade: number;
  dia_vencimento: number;
  tipo_pagamento: string;
  conta_bancaria_id: string | null;
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

const MENU = [
  ["Início", "🏠", "/painel"],
  ["Sócios", "👥", "/socios"],
  ["Dependentes", "👨‍👩‍👧‍👦", "/dependentes"],
  ["Reservas", "📅", "/reservas"],
  ["Eventos", "🎉", "/eventos"],
  ["Financeiro", "💰", "/financeiro"],
  ["Espaços", "🏛️", "/espacos"],
  ["Relatórios", "📊", "/relatorios"],
  ["Inventário", "📦", "/inventario"],
] as const;

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

function formatarCompetencia(valor: string) {
  const p = valor.slice(0, 7).split("-");
  return p.length === 2 ? `${p[1]}/${p[0]}` : valor;
}

function primeiroDia(valor: string) {
  return `${valor}-01`;
}

function vencimentoCompetencia(competencia: string, dia: number) {
  const [ano, mes] = competencia.split("-").map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  const seguro = Math.min(Math.max(Number(dia || 10), 1), ultimo);
  return `${competencia}-${String(seguro).padStart(2, "0")}`;
}

function diferencaMeses(inicio: string, fim: string) {
  const [a1, m1] = inicio.slice(0, 7).split("-").map(Number);
  const [a2, m2] = fim.slice(0, 7).split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

function situacaoRotulo(situacao: string | null | undefined) {
  if (situacao === "pago") return "Pago";
  if (situacao === "isento") return "Isento";
  if (situacao === "em_atraso") return "Em atraso";
  return "Em aberto";
}

function situacaoClasse(situacao: string | null | undefined) {
  if (situacao === "pago") return "bg-green-100 text-green-700";
  if (situacao === "isento") return "bg-gray-100 text-gray-600";
  if (situacao === "em_atraso") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
}

function nivelAtraso(meses: number) {
  if (meses >= 3) {
    return {
      texto: "3+ meses",
      classe: "bg-red-100 text-red-700 ring-1 ring-red-200",
      ponto: "bg-red-500",
    };
  }
  if (meses >= 1) {
    return {
      texto: `${meses} ${meses === 1 ? "mês" : "meses"}`,
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
  const hoje = new Date();
  const [competencia, setCompetencia] = useState(
    `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`
  );

  const [socios, setSocios] = useState<Socio[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroBancoId, setFiltroBancoId] = useState("todos");
  const [selecionadosLote, setSelecionadosLote] = useState<string[]>([]);
  const [processandoLote, setProcessandoLote] = useState(false);

  const [filtroAtraso, setFiltroAtraso] = useState<
    "todos" | "atrasados" | "verde" | "amarelo" | "vermelho"
  >("todos");

  const [pagamento, setPagamento] = useState<Mensalidade | null>(null);
  const [mesesPagamento, setMesesPagamento] = useState<Mensalidade[]>([]);
  const [mesesSelecionados, setMesesSelecionados] = useState<string[]>([]);
  const [carregandoMesesPagamento, setCarregandoMesesPagamento] = useState(false);
  const [valorPagamento, setValorPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [tipoPagamento, setTipoPagamento] = useState("pix");
  const [observacoes, setObservacoes] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvandoPagamento, setSalvandoPagamento] = useState(false);

  const [edicao, setEdicao] = useState<Mensalidade | null>(null);
  const [edicaoValor, setEdicaoValor] = useState("");
  const [edicaoVencimento, setEdicaoVencimento] = useState("");
  const [edicaoSituacao, setEdicaoSituacao] = useState("em_aberto");

  const [reciboItens, setReciboItens] = useState<Mensalidade[]>([]);
  const [processandoEstorno, setProcessandoEstorno] = useState(false);

  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [movimentosFinanceiros, setMovimentosFinanceiros] = useState<MovimentoFinanceiro[]>([]);
  const [abaFinanceira, setAbaFinanceira] = useState<"mensalidades" | "aluguéis" | "entradas" | "saidas" | "inadimplencia" | "contas" | "fluxo">("mensalidades");
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
  const [contaPagamentoId, setContaPagamentoId] = useState("");

  // Filtros do fluxo de caixa
  const [fluxoInicio, setFluxoInicio] = useState("");
  const [fluxoFim, setFluxoFim] = useState("");
  const [fluxoConta, setFluxoConta] = useState("");
  const [fluxoTipo, setFluxoTipo] = useState<"todos" | "entrada" | "saida" | "transferencia">("todos");

  const pessoas = useMemo<PessoaFinanceira[]>(() => {
    const responsaveis = new Map<string, string>(socios.map((s) => [s.id, s.nome] as [string, string]));
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
          ? responsaveis.get(s.responsavel_id) || null
          : null,
        possui_mensalidade: true,
        valor_mensalidade: Number(s.valor_mensalidade || 0),
        dia_vencimento: Number(s.dia_vencimento || 10),
        tipo_pagamento: s.tipo_pagamento || "pix",
        conta_bancaria_id: s.conta_bancaria_id || null,
      });
    }

    for (const d of dependentes) {
      if (d.ativo === false || !d.possui_mensalidade) continue;

      const responsavel = socios.find((s) => s.id === d.socio_id);

      // Evita duplicação quando o mesmo dependente já estiver
      // cadastrado também na tabela socios com a mesma pessoa.
      const duplicado = socios.some(
        (s) =>
          s.id !== d.socio_id &&
          Boolean(s.responsavel_id) &&
          d.cpf &&
          s.cpf &&
          s.cpf.replace(/\D/g, "") === d.cpf.replace(/\D/g, "")
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
        conta_bancaria_id: responsavel?.conta_bancaria_id || d.conta_bancaria_id || null,
      });
    }

    return resultado;
  }, [socios, dependentes]);

  // Mapa usado para identificar os lançamentos já existentes.
  // Importante: ele inclui TODOS os sócios/dependentes, e não somente
  // quem está marcado atualmente com possui_mensalidade = true.
  // Assim, lançamentos antigos continuam mostrando corretamente o nome
  // mesmo que a configuração financeira do cadastro tenha mudado depois.
  const mapaPessoa = useMemo(() => {
    const map = new Map<string, PessoaFinanceira>();

    const responsaveis = new Map<string, Socio>(
      socios.map((s) => [s.id, s] as [string, Socio])
    );

    for (const s of socios) {
      map.set(`socio:${s.id}`, {
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
        possui_mensalidade: Boolean(s.possui_mensalidade),
        valor_mensalidade: Number(s.valor_mensalidade || 0),
        dia_vencimento: Number(s.dia_vencimento || 10),
        tipo_pagamento: s.tipo_pagamento || "pix",
      });
    }

    for (const d of dependentes) {
      const responsavel = responsaveis.get(d.socio_id);

      map.set(`dependente:${d.id}`, {
        chave: `dependente:${d.id}`,
        socio_id: d.socio_id,
        dependente_id: d.id,
        nome: d.nome,
        matricula: responsavel?.matricula || null,
        cpf: d.cpf,
        foto_url: null,
        responsavel_nome: responsavel?.nome || null,
        possui_mensalidade: Boolean(d.possui_mensalidade),
        valor_mensalidade: Number(d.valor_mensalidade || 0),
        dia_vencimento: Number(d.dia_vencimento || 10),
        tipo_pagamento: d.tipo_pagamento || "pix",
      });
    }

    return map;
  }, [socios, dependentes]);

  const pessoaDoLancamento = (item: Mensalidade) => {
    if (item.dependente_id) {
      return (
        mapaPessoa.get(`dependente:${item.dependente_id}`) ||
        mapaPessoa.get(`socio:${item.socio_id}`) ||
        null
      );
    }

    return mapaPessoa.get(`socio:${item.socio_id}`) || null;
  };

  const mensalidadesCompetencia = useMemo(
    () =>
      mensalidades
        .filter((m) => m.competencia?.slice(0, 7) === competencia)
        .sort((a, b) =>
          String(a.data_vencimento || "").localeCompare(
            String(b.data_vencimento || "")
          )
        ),
    [mensalidades, competencia]
  );

  const historicoPorPessoa = useMemo(() => {
    const map = new Map<string, number>();

    for (const m of mensalidades) {
      if (m.situacao === "pago" || m.situacao === "isento") continue;

      const vencida =
        m.situacao === "em_atraso" ||
        (m.data_vencimento &&
          m.data_vencimento.slice(0, 10) < new Date().toISOString().slice(0, 10));

      if (!vencida) continue;

      const chave = m.dependente_id
        ? `dependente:${m.dependente_id}`
        : `socio:${m.socio_id}`;

      map.set(chave, (map.get(chave) || 0) + 1);
    }

    return map;
  }, [mensalidades]);

  const atrasoPessoas = useMemo(() => {
    return pessoas
      .map((p) => ({
        pessoa: p,
        meses: historicoPorPessoa.get(p.chave) || 0,
        nivel: nivelAtraso(historicoPorPessoa.get(p.chave) || 0),
      }))
      .filter((x) => x.meses > 0);
  }, [pessoas, historicoPorPessoa]);

  const quantidadeAtrasados = atrasoPessoas.length;
  const amarelos = atrasoPessoas.filter((x) => x.meses <= 2).length;
  const vermelhos = atrasoPessoas.filter((x) => x.meses >= 3).length;

  const inadimplenciaDetalhada = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return atrasoPessoas
      .map((x) => {
        const lancamentos = mensalidades
          .filter((m) => {
            const chave = m.dependente_id
              ? `dependente:${m.dependente_id}`
              : `socio:${m.socio_id}`;

            if (chave !== x.pessoa.chave) return false;
            if (m.situacao === "pago" || m.situacao === "isento") return false;

            const vencida =
              m.situacao === "em_atraso" ||
              Boolean(
                m.data_vencimento &&
                  m.data_vencimento.slice(0, 10) <
                    new Date().toISOString().slice(0, 10)
              );

            return vencida;
          })
          .sort((a, b) =>
            String(b.competencia || "").localeCompare(
              String(a.competencia || "")
            )
          );

        const valorDevido = lancamentos.reduce(
          (soma, item) => soma + Number(item.valor || 0),
          0
        );

        const correspondeBusca =
          !termo ||
          x.pessoa.nome.toLowerCase().includes(termo) ||
          String(x.pessoa.matricula || "").includes(termo) ||
          String(x.pessoa.cpf || "").includes(termo) ||
          String(x.pessoa.responsavel_nome || "")
            .toLowerCase()
            .includes(termo);

        return {
          ...x,
          lancamentos,
          valorDevido,
          competencias: lancamentos.map((m) => formatarCompetencia(m.competencia)),
          ultimaCompetencia: lancamentos[0]?.competencia || null,
          correspondeBusca,
        };
      })
      .filter((x) => x.correspondeBusca);
  }, [atrasoPessoas, mensalidades, busca]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return mensalidadesCompetencia.filter((item) => {
      const pessoa = pessoaDoLancamento(item);

      const correspondeBusca =
        !termo ||
        !pessoa ||
        pessoa.nome.toLowerCase().includes(termo) ||
        String(pessoa.matricula || "").includes(termo) ||
        String(pessoa.cpf || "").toLowerCase().includes(termo);

      if (!correspondeBusca) return false;

      if (filtroBancoId !== "todos") {
        if (!pessoa || pessoa.conta_bancaria_id !== filtroBancoId) return false;
      }

      if (filtroAtraso === "todos") return true;

      // O filtro pode chegar aqui mesmo quando o lançamento não encontrou
      // um cadastro correspondente. Nesse caso, não tentamos acessar
      // pessoa.chave para evitar erro de TypeScript/null em produção.
      if (!pessoa) return false;

      const meses = historicoPorPessoa.get(pessoa.chave) || 0;

      if (filtroAtraso === "atrasados") return meses > 0;
      if (filtroAtraso === "verde") return meses === 0;
      if (filtroAtraso === "amarelo") return meses >= 1 && meses <= 2;
      return meses >= 3;
    });
  }, [
    mensalidadesCompetencia,
    busca,
    filtroAtraso,
    filtroBancoId,
    historicoPorPessoa,
    pessoas,
  ]);

  useEffect(() => {
    setSelecionadosLote([]);
  }, [competencia, filtroBancoId]);

  const mensalidadesLote = useMemo(() => mensalidadesCompetencia.filter((m) => {
    if (m.situacao === "pago" || m.situacao === "isento") return false;
    const pessoa = pessoaDoLancamento(m);
    if (!pessoa) return false;
    return filtroBancoId !== "todos" && pessoa.conta_bancaria_id === filtroBancoId;
  }), [mensalidadesCompetencia, filtroBancoId, pessoas]);

  const todosLoteSelecionados = mensalidadesLote.length > 0 && mensalidadesLote.every((m) => selecionadosLote.includes(m.id));
  const totalLote = mensalidadesLote.filter((m) => selecionadosLote.includes(m.id)).reduce((s,m)=>s+Number(m.valor||0),0);

  const totalLancado = mensalidadesCompetencia.reduce(
    (s, m) => s + Number(m.valor || 0),
    0
  );
  const totalRecebido = mensalidadesCompetencia
    .filter((m) => m.situacao === "pago")
    .reduce((s, m) => s + Number(m.valor || 0), 0);
  const totalAberto = mensalidadesCompetencia
    .filter((m) => m.situacao === "em_aberto")
    .reduce((s, m) => s + Number(m.valor || 0), 0);
  const totalAtrasado = mensalidadesCompetencia
    .filter((m) => m.situacao === "em_atraso")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  async function carregarTudo() {
    setCarregando(true);

    try {
      const perfilLocal = typeof window !== "undefined" ? window.localStorage.getItem("guarani_usuario_perfil") : "";

      if (perfilLocal === "administrador") {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          window.location.href = "/login";
          return;
        }

        const response = await fetch("/api/financeiro", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "Não foi possível carregar o financeiro.");

        setSocios((data.socios || []) as Socio[]);
        setDependentes((data.dependentes || []) as Dependente[]);
        setMensalidades((data.mensalidades || []) as Mensalidade[]);
        setContasBancarias((data.contasBancarias || []) as ContaBancaria[]);
        setMovimentosFinanceiros((data.movimentosFinanceiros || []) as MovimentoFinanceiro[]);
        setMensagem("");
        return;
      }

      const [sociosResult, dependentesResult, mensalidadesResult, contasResult, movimentosResult] = await Promise.all([
        supabase.from("socios").select("id,matricula,nome,cpf,whatsapp,telefone,foto_url,situacao,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento").order("matricula", { ascending: true }),
        supabase.from("dependentes").select("id,socio_id,nome,cpf,telefone,ativo,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento").order("nome", { ascending: true }),
        supabase.from("mensalidades").select("*").order("competencia", { ascending: false }).order("data_vencimento", { ascending: true }),
        supabase.from("contas_bancarias").select("*").eq("ativo", true).order("nome", { ascending: true }),
        supabase.from("movimentacoes_financeiras").select("*").order("data_movimentacao", { ascending: false }).order("created_at", { ascending: false }),
      ]);

      const erros = [sociosResult.error, dependentesResult.error, mensalidadesResult.error, contasResult.error, movimentosResult.error].filter(Boolean);
      if (sociosResult.data) setSocios(sociosResult.data as Socio[]);
      if (dependentesResult.data) setDependentes(dependentesResult.data as Dependente[]);
      if (mensalidadesResult.data) setMensalidades(mensalidadesResult.data as Mensalidade[]);
      if (contasResult.data) setContasBancarias(contasResult.data as ContaBancaria[]);
      if (movimentosResult.data) setMovimentosFinanceiros(movimentosResult.data as MovimentoFinanceiro[]);
      if (erros.length > 0) setMensagem("Não foi possível carregar uma parte do financeiro. Verifique as permissões do Supabase.");
    } catch (error) {
      console.error(error);
      setMensagem(error instanceof Error ? error.message : "Não foi possível carregar o financeiro.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      const { data } = await supabase.auth.getSession();

      if (!ativo) return;

      if (!data.session) {
        window.location.href = "/login";
        return;
      }

      await carregarTudo();
    }

    void iniciar();

    return () => {
      ativo = false;
    };
  }, []);

  async function atualizarAtrasos() {
    const hojeIso = new Date().toISOString().slice(0, 10);
    const ids = mensalidades
      .filter(
        (m) =>
          m.situacao === "em_aberto" &&
          m.data_vencimento &&
          m.data_vencimento.slice(0, 10) < hojeIso
      )
      .map((m) => m.id);

    if (ids.length === 0) return;

    const { error } = await supabase
      .from("mensalidades")
      .update({ situacao: "em_atraso" })
      .in("id", ids);

    if (error) {
      console.error(error);
      return;
    }

    setMensalidades((lista) =>
      lista.map((m) => (ids.includes(m.id) ? { ...m, situacao: "em_atraso" } : m))
    );
  }

  async function gerarMensalidades() {
    setGerando(true);
    setMensagem("");

    try {
      await atualizarAtrasos();

      const existentes = mensalidades.filter(
        (m) => m.competencia?.slice(0, 7) === competencia
      );

      const chavesExistentes = new Set(
        existentes.map((m) =>
          m.dependente_id
            ? `dependente:${m.dependente_id}`
            : `socio:${m.socio_id}`
        )
      );

      const novos = pessoas
        .filter((p) => !chavesExistentes.has(p.chave))
        .map((p) => ({
          socio_id: p.socio_id,
          dependente_id: p.dependente_id,
          competencia: primeiroDia(competencia),
          valor: Number(p.valor_mensalidade || 0),
          data_vencimento: vencimentoCompetencia(
            competencia,
            p.dia_vencimento
          ),
          situacao:
            Number(p.valor_mensalidade || 0) === 0 ? "isento" : "em_aberto",
          data_pagamento: null,
          tipo_pagamento: p.tipo_pagamento || "pix",
          comprovante_url: null,
          observacoes: null,
        }));

      if (novos.length === 0) {
        setMensagem(
          `As mensalidades de ${formatarCompetencia(
            competencia
          )} já estão lançadas.`
        );
        return;
      }

      const { data, error } = await supabase
        .from("mensalidades")
        .insert(novos)
        .select("*");

      if (error) throw error;

      setMensalidades((lista) => [...(data as Mensalidade[]), ...lista]);

      setMensagem(
        `${novos.length} mensalidade(s) gerada(s) para ${formatarCompetencia(
          competencia
        )}.`
      );
    } catch (error) {
      console.error(error);
      setMensagem(
        `Não foi possível gerar as mensalidades. ${
          error instanceof Error ? error.message : ""
        }`
      );
    } finally {
      setGerando(false);
    }
  }

  async function confirmarPagamentoLote() {
    if (filtroBancoId === "todos") {
      setMensagem("Selecione um banco para fazer a baixa em lote.");
      return;
    }
    const selecionadas = mensalidadesLote.filter((m) => selecionadosLote.includes(m.id));
    if (!selecionadas.length) {
      setMensagem("Selecione pelo menos uma mensalidade.");
      return;
    }
    const conta = contasBancarias.find((c) => c.id === filtroBancoId);
    if (!conta) { setMensagem("Conta bancária não encontrada."); return; }
    if (!window.confirm(`Confirmar baixa de ${selecionadas.length} mensalidade(s) da competência ${formatarCompetencia(competencia)} no banco ${conta.nome}?\n\nTotal: ${formatarMoeda(totalLote)}`)) return;

    setProcessandoLote(true); setMensagem("");
    try {
      const ids = selecionadas.map(m=>m.id);
      const hoje = new Date().toISOString().slice(0,10);
      const { data: atuais, error: checkError } = await supabase.from("mensalidades").select("id,situacao").in("id", ids);
      if (checkError) throw checkError;
      const invalidas = (atuais||[]).filter(m=>m.situacao === "pago" || m.situacao === "isento");
      if (invalidas.length) throw new Error("Uma ou mais mensalidades já foram pagas ou estão isentas. Atualize a tela e tente novamente.");

      const { error } = await supabase.from("mensalidades").update({ situacao:"pago", data_pagamento:hoje, tipo_pagamento:"debito_em_conta" }).in("id", ids);
      if (error) throw error;

      const { data: movimento, error: movimentoError } = await supabase.from("movimentacoes_financeiras").insert({
        conta_bancaria_id: conta.id, conta_destino_id:null, grupo_transferencia:null, tipo:"entrada", categoria:"Mensalidade",
        descricao:`Mensalidades ${formatarCompetencia(competencia)} — ${selecionadas.length} associados — ${conta.nome}`, valor:totalLote,
        data_movimentacao:hoje, forma_pagamento:"debito_em_conta", origem_tipo:"mensalidade_lote", origem_id:competencia, socio_id:null, dependente_id:null, comprovante_url:null, conciliado:false, data_conciliacao:null, observacoes:`Baixa em lote de ${selecionadas.length} mensalidade(s).`,
      }).select("*").single();
      if (movimentoError) throw movimentoError;

      setMensalidades(lista=>lista.map(m=>ids.includes(m.id)?{...m,situacao:"pago",data_pagamento:hoje,tipo_pagamento:"debito_em_conta"}:m));
      if (movimento) setMovimentosFinanceiros(lista=>[movimento as MovimentoFinanceiro,...lista]);
      setSelecionadosLote([]);
      setMensagem(`${selecionadas.length} mensalidade(s) baixada(s) no ${conta.nome}. Total: ${formatarMoeda(totalLote)}.`);
    } catch(error) {
      console.error(error);
      setMensagem(`Não foi possível fazer a baixa em lote. ${error instanceof Error ? error.message : ""}`);
    } finally { setProcessandoLote(false); }
  }

  async function abrirPagamento(item: Mensalidade) {
    setContaPagamentoId("");
    setPagamento(item);
    setValorPagamento(String(Number(item.valor || 0)));
    setDataPagamento(new Date().toISOString().slice(0, 10));
    setTipoPagamento(item.tipo_pagamento || "pix");
    setObservacoes("");
    setArquivo(null);
    setMesesPagamento([]);
    setMesesSelecionados([item.id]);
    setCarregandoMesesPagamento(true);

    try {
      let query = supabase
        .from("mensalidades")
        .select("*")
        .eq("socio_id", item.socio_id)
        .order("competencia", { ascending: false });

      query = item.dependente_id
        ? query.eq("dependente_id", item.dependente_id)
        : query.is("dependente_id", null);

      const { data, error } = await query;
      if (error) throw error;

      const pendentes = ((data || []) as Mensalidade[]).filter(
        (m) => m.situacao !== "pago" && m.situacao !== "isento"
      );

      const lista = pendentes.some((m) => m.id === item.id)
        ? pendentes
        : [item, ...pendentes];

      setMesesPagamento(lista);
      setMesesSelecionados([item.id]);
      setValorPagamento(String(Number(item.valor || 0)));
    } catch (error) {
      console.error(error);
      setMesesPagamento([item]);
      setMesesSelecionados([item.id]);
      setMensagem(
        `Não foi possível carregar as mensalidades pendentes. ${
          error instanceof Error ? error.message : ""
        }`
      );
    } finally {
      setCarregandoMesesPagamento(false);
    }
  }

  function alternarMesPagamento(id: string) {
    setMesesSelecionados((atual) => {
      const nova = atual.includes(id)
        ? atual.filter((itemId) => itemId !== id)
        : [...atual, id];

      const total = mesesPagamento
        .filter((m) => nova.includes(m.id))
        .reduce((soma, m) => soma + Number(m.valor || 0), 0);

      setValorPagamento(String(total));
      return nova;
    });
  }

  async function confirmarPagamento() {
    if (!pagamento) return;

    const selecionadas = mesesPagamento.filter((m) =>
      mesesSelecionados.includes(m.id)
    );

    if (selecionadas.length === 0) {
      setMensagem("Selecione pelo menos uma competência.");
      return;
    }

    setSalvandoPagamento(true);
    setMensagem("");

    try {
      let comprovante = selecionadas[0].comprovante_url;

      if (arquivo) {
        const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
        const caminho = `mensalidades/pagamento-${selecionadas[0].id}-${Date.now()}.${ext}`;

        const upload = await supabase.storage
          .from("comprovantes-financeiro")
          .upload(caminho, arquivo, {
            upsert: true,
            contentType: arquivo.type || "application/octet-stream",
          });

        if (upload.error) throw upload.error;
        comprovante = caminho;
      }

      const ids = selecionadas.map((m) => m.id);

      const totalSelecionado = selecionadas.reduce(
        (soma, m) => soma + Number(m.valor || 0),
        0
      );
      const totalInformado = Number(valorPagamento || 0);

      if (Math.abs(totalInformado - totalSelecionado) > 0.01) {
        throw new Error(
          `O valor informado (${formatarMoeda(totalInformado)}) deve ser igual ao total das competências selecionadas (${formatarMoeda(totalSelecionado)}).`
        );
      }

      const { error } = await supabase
        .from("mensalidades")
        .update({
          situacao: "pago",
          data_pagamento: dataPagamento || null,
          tipo_pagamento: tipoPagamento || null,
          comprovante_url: comprovante || null,
          observacoes: observacoes || null,
        })
        .in("id", ids);

      if (error) throw error;

      const pessoa = pessoaDoLancamento(pagamento);
      if (pessoa && !pessoa.dependente_id) {
        await supabase
          .from("socios")
          .update({
            situacao_financeira: "em_dia",
            data_ultimo_pagamento: dataPagamento || null,
          })
          .eq("id", pessoa.socio_id);
      }

      const numero = await gerarNumeroRecibo(selecionadas[0]);

      const { error: reciboError } = await supabase
        .from("mensalidades")
        .update({ numero_recibo: numero })
        .in("id", ids);

      if (reciboError) throw reciboError;

      const atualizadas = selecionadas.map((m) => ({
        ...m,
        situacao: "pago",
        data_pagamento: dataPagamento || null,
        tipo_pagamento: tipoPagamento || null,
        comprovante_url: comprovante || null,
        observacoes: observacoes || null,
        numero_recibo: numero,
      }));

      setMensalidades((lista) =>
        lista.map((m) => atualizadas.find((a) => a.id === m.id) || m)
      );

      if (contaPagamentoId) {
        const pessoa = pessoaDoLancamento(pagamento);
        const { data: movimentoData, error: movimentoError } = await supabase
          .from("movimentacoes_financeiras")
          .insert({
            conta_bancaria_id: contaPagamentoId,
            conta_destino_id: null,
            grupo_transferencia: null,
            tipo: "entrada",
            categoria: "Mensalidade",
            descricao: `Mensalidade ${selecionadas.map((m) => formatarCompetencia(m.competencia)).join(", ")} - ${pessoa?.nome || "Cadastro não localizado"}`,
            valor: totalSelecionado,
            data_movimentacao: dataPagamento || new Date().toISOString().slice(0,10),
            forma_pagamento: tipoPagamento || null,
            origem_tipo: "mensalidade",
            origem_id: selecionadas[0].id,
            socio_id: pessoa?.socio_id || null,
            dependente_id: pessoa?.dependente_id || null,
            comprovante_url: comprovante || null,
            conciliado: false,
            data_conciliacao: null,
            observacoes: observacoes || null,
          })
          .select("*")
          .single();
        if (movimentoError) throw movimentoError;
        setMovimentosFinanceiros((lista) => [movimentoData as MovimentoFinanceiro, ...lista]);
      }

      setMensagem(
        selecionadas.length === 1
          ? "Pagamento registrado com sucesso."
          : `${selecionadas.length} mensalidades pagas em um único pagamento.`
      );

      setPagamento(null);
      setMesesPagamento([]);
      setMesesSelecionados([]);
      setReciboItens(atualizadas);
    } catch (error) {
      console.error(error);
      setMensagem(
        `Não foi possível registrar o pagamento. ${
          error instanceof Error ? error.message : ""
        }`
      );
    } finally {
      setSalvandoPagamento(false);
    }
  }

  function abrirEdicao(item: Mensalidade) {
    setEdicao(item);
    setEdicaoValor(String(Number(item.valor || 0)));
    setEdicaoVencimento(item.data_vencimento || "");
    setEdicaoSituacao(item.situacao || "em_aberto");
  }

  async function salvarEdicao() {
    if (!edicao) return;

    const { error } = await supabase
      .from("mensalidades")
      .update({
        valor: Number(edicaoValor || 0),
        data_vencimento: edicaoVencimento || null,
        situacao: edicaoSituacao,
      })
      .eq("id", edicao.id);

    if (error) {
      console.error(error);
      setMensagem(`Não foi possível atualizar. ${error.message}`);
      return;
    }

    setMensalidades((lista) =>
      lista.map((m) =>
        m.id === edicao.id
          ? {
              ...m,
              valor: Number(edicaoValor || 0),
              data_vencimento: edicaoVencimento || null,
              situacao: edicaoSituacao,
            }
          : m
      )
    );

    setEdicao(null);
    setMensagem("Mensalidade atualizada.");
  }

  async function excluir(item: Mensalidade) {
    if (!window.confirm("Deseja realmente excluir esta mensalidade?")) return;

    const { error } = await supabase
      .from("mensalidades")
      .delete()
      .eq("id", item.id);

    if (error) {
      console.error(error);
      setMensagem(`Não foi possível excluir. ${error.message}`);
      return;
    }

    setMensalidades((lista) => lista.filter((m) => m.id !== item.id));
    setMensagem("Mensalidade excluída.");
  }

  async function gerarNumeroRecibo(item: Mensalidade) {
    if (item.numero_recibo) return item.numero_recibo;

    const { data, error } = await supabase
      .from("mensalidades")
      .select("numero_recibo")
      .eq("competencia", item.competencia)
      .not("numero_recibo", "is", null);

    if (error) throw error;

    const maior = (data || [])
      .map((row) => {
        const valor = String(row.numero_recibo || "");
        const match = valor.match(/-(\d+)$/);
        return match ? Number(match[1]) : 0;
      })
      .reduce((max, atual) => Math.max(max, atual), 0);

    const numero = `REC-${item.competencia.slice(0, 7).replace("-", "")}-${String(
      maior + 1
    ).padStart(3, "0")}`;

    const { error: updateError } = await supabase
      .from("mensalidades")
      .update({ numero_recibo: numero })
      .eq("id", item.id);

    if (updateError) throw updateError;

    setMensalidades((lista) =>
      lista.map((m) =>
        m.id === item.id ? { ...m, numero_recibo: numero } : m
      )
    );

    return numero;
  }

  async function abrirRecibo(item: Mensalidade) {
    if (item.situacao !== "pago") return;

    try {
      const numero = await gerarNumeroRecibo(item);
      setReciboItens([{ ...item, numero_recibo: numero }]);
    } catch (error) {
      console.error(error);
      setMensagem(
        `Não foi possível gerar o recibo. ${
          error instanceof Error ? error.message : ""
        }`
      );
    }
  }

  async function estornarPagamento(item: Mensalidade) {
    if (item.situacao !== "pago") return;

    const confirmar = window.confirm(
      "Deseja estornar este pagamento? A mensalidade voltará para Em aberto."
    );

    if (!confirmar) return;

    setProcessandoEstorno(true);
    setMensagem("");

    try {
      const { error } = await supabase
        .from("mensalidades")
        .update({
          situacao: "em_aberto",
          data_pagamento: null,
          tipo_pagamento: null,
          comprovante_url: null,
          observacoes: "Pagamento estornado.",
        })
        .eq("id", item.id);

      if (error) throw error;

      setMensalidades((lista) =>
        lista.map((m) =>
          m.id === item.id
            ? {
                ...m,
                situacao: "em_aberto",
                data_pagamento: null,
                tipo_pagamento: null,
                comprovante_url: null,
                observacoes: "Pagamento estornado.",
              }
            : m
        )
      );

      setMensagem("Pagamento estornado com sucesso.");
    } catch (error) {
      console.error(error);
      setMensagem(
        `Não foi possível estornar o pagamento. ${
          error instanceof Error ? error.message : ""
        }`
      );
    } finally {
      setProcessandoEstorno(false);
    }
  }

  function imprimirRecibo() {
    window.print();
  }

  async function abrirComprovante(path: string | null) {
    if (!path) return;

    const { data, error } = await supabase.storage
      .from("comprovantes-financeiro")
      .createSignedUrl(path, 600);

    if (error || !data?.signedUrl) {
      setMensagem("Não foi possível abrir o comprovante.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  const saldoConta = (conta: ContaBancaria) => {
    const movimentos = movimentosFinanceiros.filter((m) => m.conta_bancaria_id === conta.id);
    let saldo = Number(conta.saldo_inicial || 0);
    for (const m of movimentos) {
      if (m.tipo === "entrada") saldo += Number(m.valor || 0);
      else if (m.tipo === "saida") saldo -= Number(m.valor || 0);
      else if (m.tipo === "transferencia") {
        saldo -= Number(m.valor || 0);
      }
    }
    saldo += movimentosFinanceiros
      .filter((m) => m.tipo === "transferencia" && m.conta_destino_id === conta.id)
      .reduce((sum, m) => sum + Number(m.valor || 0), 0);
    return saldo;
  };

  const saldoTotalBancos = contasBancarias.reduce((sum, c) => sum + saldoConta(c), 0);

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
      return true;
    });
  }, [movimentosFinanceiros, fluxoInicio, fluxoFim, fluxoConta, fluxoTipo, abaFinanceira]);

  const entradasPeriodo = movimentosFluxo
    .filter((m) => m.tipo === "entrada")
    .reduce((sum, m) => sum + Number(m.valor || 0), 0);
  const saidasPeriodo = movimentosFluxo
    .filter((m) => m.tipo === "saida")
    .reduce((sum, m) => sum + Number(m.valor || 0), 0);
  const transferenciasPeriodo = movimentosFluxo
    .filter((m) => m.tipo === "transferencia")
    .reduce((sum, m) => sum + Number(m.valor || 0), 0);

  async function salvarContaBancaria() {
    if (!contaNome.trim()) { setMensagem("Informe o nome da conta."); return; }
    const payload = { nome: contaNome.trim(), banco: contaBanco || null, agencia: contaAgencia || null, conta: contaNumero || null, saldo_inicial: Number(contaSaldoInicial || 0), data_saldo_inicial: contaDataSaldo || null, ativo: true, observacoes: contaObservacoes || null };
    const result = contaEditando
      ? await supabase.from("contas_bancarias").update(payload).eq("id", contaEditando.id).select("*").single()
      : await supabase.from("contas_bancarias").insert(payload).select("*").single();
    if (result.error) { setMensagem(`Não foi possível salvar a conta. ${result.error.message}`); return; }
    if (contaEditando) setContasBancarias((lista) => lista.map((c) => c.id === contaEditando.id ? result.data as ContaBancaria : c));
    else setContasBancarias((lista) => [...lista, result.data as ContaBancaria].sort((a,b)=>a.nome.localeCompare(b.nome)));
    setMostrarContaModal(false); setContaEditando(null); setContaNome(""); setContaBanco(""); setContaAgencia(""); setContaNumero(""); setContaSaldoInicial("0"); setContaObservacoes(""); setMensagem("Conta bancária salva com sucesso.");
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
    if (!Number.isFinite(saldoInformado) || saldoInformado < 0) {
      setMensagem("Informe um saldo bancário válido.");
      return;
    }

    const saldoAtual = saldoConta(contaConferindo);
    const diferenca = Number((saldoInformado - saldoAtual).toFixed(2));

    setSalvandoConferencia(true);

    try {
      const { error } = await supabase
        .from("conferencias_bancarias")
        .insert({
          conta_bancaria_id: contaConferindo.id,
          saldo_sistema: saldoAtual,
          saldo_banco: saldoInformado,
          diferenca,
          data_conferencia: dataConferencia,
          observacao:
            observacaoConferencia ||
            "Conferência do saldo bancário",
        });

      if (error) throw error;

      setMensagem(
        diferenca === 0
          ? `Saldo de ${contaConferindo.nome} conferido: ${formatarMoeda(saldoInformado)}.`
          : `Conferência de ${contaConferindo.nome} registrada. Diferença: ${formatarMoeda(diferenca)}.`
      );
      setContaConferindo(null);
    } catch (error) {
      setMensagem(
        `Não foi possível registrar a conferência. ${
          error instanceof Error ? error.message : "Erro desconhecido."
        }`
      );
    } finally {
      setSalvandoConferencia(false);
    }
  }

  async function salvarMovimentoFinanceiro() {
    if (!movConta || !movDescricao.trim() || Number(movValor || 0) <= 0) { setMensagem("Informe conta, descrição e valor válido."); return; }
    let comprovante: string | null = null;
    if (movArquivo) { const ext = movArquivo.name.split(".").pop()?.toLowerCase() || "bin"; const caminho = `movimentos/${Date.now()}-${movArquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`; const up = await supabase.storage.from("comprovantes-financeiro").upload(caminho, movArquivo, { upsert: true, contentType: movArquivo.type || "application/octet-stream" }); if (up.error) { setMensagem(`Não foi possível enviar o comprovante. ${up.error.message}`); return; } comprovante = caminho; }
    const payload = { conta_bancaria_id: movConta, conta_destino_id: null, grupo_transferencia: null, tipo: movTipo, categoria: movCategoria || null, descricao: movDescricao.trim(), valor: Number(movValor), data_movimentacao: movData, forma_pagamento: movForma || null, origem_tipo: "manual", origem_id: null, socio_id: null, dependente_id: null, comprovante_url: comprovante, conciliado: false, data_conciliacao: null, observacoes: movObservacoes || null };
    const { data, error } = await supabase.from("movimentacoes_financeiras").insert(payload).select("*").single();
    if (error) { setMensagem(`Não foi possível registrar a movimentação. ${error.message}`); return; }
    setMovimentosFinanceiros((lista) => [data as MovimentoFinanceiro, ...lista]); setMostrarMovimentoModal(false); setMovDescricao(""); setMovValor(""); setMovCategoria(""); setMovObservacoes(""); setMovArquivo(null); setMensagem("Movimentação registrada com sucesso.");
  }

  async function salvarTransferencia() {
    if (!transOrigem || !transDestino || transOrigem === transDestino || Number(transValor || 0) <= 0) { setMensagem("Informe contas diferentes e um valor válido."); return; }
    const grupo = crypto.randomUUID();
    const base = { grupo_transferencia: grupo, tipo: "transferencia", categoria: "Transferência interna", descricao: transDescricao || "Transferência entre contas", valor: Number(transValor), data_movimentacao: transData, forma_pagamento: "transferencia", origem_tipo: "transferencia", origem_id: null, socio_id: null, dependente_id: null, comprovante_url: null, conciliado: false, data_conciliacao: null, observacoes: transObservacoes || null };
    const { data, error } = await supabase.from("movimentacoes_financeiras").insert({ ...base, conta_bancaria_id: transOrigem, conta_destino_id: transDestino }).select("*").single();
    if (error) { setMensagem(`Não foi possível registrar a transferência. ${error.message}`); return; }
    setMovimentosFinanceiros((lista) => [data as MovimentoFinanceiro, ...lista]); setMostrarTransferenciaModal(false); setTransValor(""); setTransDescricao("Transferência entre contas"); setTransObservacoes(""); setMensagem("Transferência registrada com sucesso.");
  }

  async function abrirPagamentoComConta(item: Mensalidade) { setContaPagamentoId(""); await abrirPagamento(item); }

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />

      <section className="min-w-0 p-5 sm:p-7 lg:ml-[220px] lg:p-8">
          <div className="mb-6 md:hidden">
            <div className="grid grid-cols-2 gap-2">
              {MENU.map(([nome, icone, rota]) => (
                <button
                  key={nome}
                  onClick={() => {
                    if (rota !== "/financeiro") window.location.href = rota;
                  }}
                  className={`rounded-xl p-3 text-left text-xs font-bold ${
                    nome === "Financeiro"
                      ? "bg-[#005a3c] text-white"
                      : "bg-white text-gray-700 shadow-sm"
                  }`}
                >
                  <span className="mr-2 text-lg">{icone}</span>
                  {nome}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-sm font-medium text-gray-500">Administração</p>
              <h2 className="mt-1 text-3xl font-bold text-[#005a3c]">
                Financeiro
              </h2>
              <p className="mt-1 text-gray-500">
                Mensalidades, pagamentos, vencimentos e inadimplência.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-xl border border-[#d5e0da] bg-white px-3 py-2">
                <label className="mr-2 text-xs font-bold text-gray-500">
                  Competência
                </label>
                <input
                  type="month"
                  value={competencia}
                  onChange={(e) => setCompetencia(e.target.value)}
                  className="font-bold text-[#005a3c] outline-none"
                />
              </div>

              <button
                onClick={() => void gerarMensalidades()}
                disabled={gerando || carregando}
                className="rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
              >
                {gerando ? "Gerando..." : "⚡ Gerar mensalidades"}
              </button>
            </div>
          </div>

          {mensagem && (
            <div className="mb-5 rounded-xl border border-[#cfe3d8] bg-[#eef7f2] px-4 py-3 text-sm font-semibold text-[#005a3c]">
              {mensagem}
            </div>
          )}

          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <Resumo
              titulo="Saldo em bancos"
              valor={formatarMoeda(saldoTotalBancos)}
              subtitulo={`${contasBancarias.length} conta(s) ativa(s)`}
              destaque
            />
            <Resumo titulo="Recebido no mês" valor={formatarMoeda(totalRecebido)} />
            <Resumo titulo="Em aberto" valor={formatarMoeda(totalAberto)} />
            <Resumo titulo="Em atraso" valor={formatarMoeda(totalAtrasado)} />
            <Resumo titulo="Total lançado" valor={formatarMoeda(totalLancado)} />
            <Resumo
              titulo="Com mensalidade"
              valor={String(pessoas.length)}
              subtitulo="Sócios e dependentes"
            />
          </div>

          <div
            className={`mb-5 rounded-2xl border p-5 ${
              quantidadeAtrasados > 0
                ? "border-red-200 bg-red-50"
                : "border-green-200 bg-green-50"
            }`}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p
                  className={`text-lg font-extrabold ${
                    quantidadeAtrasados > 0
                      ? "text-red-700"
                      : "text-green-700"
                  }`}
                >
                  {quantidadeAtrasados > 0
                    ? `⚠️ ${quantidadeAtrasados} ${
                        quantidadeAtrasados === 1 ? "sócio" : "sócios"
                      } em atraso`
                    : "✓ Nenhum sócio em atraso"}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Atrasos são calculados pelo histórico de mensalidades.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-green-100 px-3 py-2 text-green-700">
                  🟢 Em dia
                </span>
                <span className="rounded-full bg-yellow-100 px-3 py-2 text-yellow-700">
                  🟡 1–2 meses: {amarelos}
                </span>
                <span className="rounded-full bg-red-100 px-3 py-2 text-red-700">
                  🔴 3+ meses: {vermelhos}
                </span>
              </div>
            </div>
          </div>

          {atrasoPessoas.length > 0 && (
            <div className="mb-6 rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-extrabold text-[#003d2b]">
                    Alertas de inadimplência
                  </h3>
                  <p className="text-sm text-gray-500">
                    Verde = em dia · amarelo = 1 ou 2 meses · vermelho = 3 ou mais.
                  </p>
                </div>

                <div className="flex gap-2">
                  {(["todos", "atrasados", "verde", "amarelo", "vermelho"] as const).map(
                    (filtro) => (
                      <button
                        key={filtro}
                        onClick={() => setFiltroAtraso(filtro)}
                        className={`rounded-lg px-3 py-2 text-xs font-bold ${
                          filtroAtraso === filtro
                            ? "bg-[#005a3c] text-white"
                            : "bg-[#f1f5f2] text-gray-600"
                        }`}
                      >
                        {filtro === "todos"
                          ? "Todos"
                          : filtro === "atrasados"
                            ? "⚠️"
                            : filtro === "verde"
                              ? "🟢"
                              : filtro === "amarelo"
                                ? "🟡"
                                : "🔴"}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {atrasoPessoas
                  .filter((x) => {
                    if (filtroAtraso === "todos") return true;
                    if (filtroAtraso === "atrasados") return x.meses > 0;
                    if (filtroAtraso === "verde") return x.meses === 0;
                    if (filtroAtraso === "amarelo")
                      return x.meses >= 1 && x.meses <= 2;
                    return x.meses >= 3;
                  })
                  .map((x) => (
                    <div
                      key={x.pessoa.chave}
                      className="flex items-center justify-between rounded-xl border border-[#e2ebe6] bg-[#fafcfb] p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-[#173d2e]">
                          {x.pessoa.nome}
                        </p>
                        <p className="text-xs text-gray-500">
                          Matrícula {x.pessoa.matricula || "—"}
                          {x.pessoa.responsavel_nome
                            ? ` · Resp.: ${x.pessoa.responsavel_nome}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${x.nivel.classe}`}
                      >
                        {x.nivel.texto}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="mb-6 border-b border-[#dfe9e3]">
            <div className="flex flex-wrap gap-1 overflow-x-auto">
              {[
                ["mensalidades", "💰", "Mensalidades"],
                ["aluguéis", "🏠", "Aluguéis"],
                ["entradas", "💵", "Entradas"],
                ["saidas", "💸", "Saídas"],
                ["inadimplencia", "🚨", `Inadimplência${quantidadeAtrasados > 0 ? ` (${quantidadeAtrasados})` : ""}`],
                ["contas", "🏦", "Contas bancárias"],
                ["fluxo", "📊", "Fluxo de caixa"],
              ].map(([id, icone, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    const aba = id as typeof abaFinanceira;
                    setAbaFinanceira(aba);
                    if (aba === "entradas") setFluxoTipo("entrada");
                    else if (aba === "saidas") setFluxoTipo("saida");
                    else if (aba === "fluxo") setFluxoTipo("todos");
                    if (aba === "aluguéis") {
                      setMovTipo("entrada");
                      setMovCategoria("Aluguel");
                    }
                  }}
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
                  titulo="1 ou 2 meses"
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
                      🟡 1–2 meses em atraso · 🔴 3 meses ou mais.
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
                    🟡 1–2 meses: {amarelos}
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

          {abaFinanceira !== "mensalidades" &&
            abaFinanceira !== "inadimplencia" && (
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
                    <div className="flex gap-2"><button onClick={() => setMostrarMovimentoModal(true)} className="rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-bold text-[#005a3c]">＋ Movimentação</button><button onClick={() => setMostrarTransferenciaModal(true)} className="rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-bold text-[#005a3c]">↔ Transferência</button><button onClick={abrirNovaConta} className="rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white">＋ Nova conta</button></div>
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
                            setMovTipo("entrada");
                            setMovCategoria("Aluguel");
                            setMovDescricao("");
                          }
                          setMostrarMovimentoModal(true);
                        }}
                        className="rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white"
                      >
                        ＋ {abaFinanceira === "aluguéis" ? "Novo aluguel" : "Nova movimentação"}
                      </button>
                      {abaFinanceira === "fluxo" && (
                        <button onClick={() => setMostrarTransferenciaModal(true)} className="rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-bold text-[#005a3c]">
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
                        onClick={() => { setFluxoInicio(""); setFluxoFim(""); setFluxoConta(""); setFluxoTipo("todos"); }}
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
                          <th className="px-4 py-3">Data</th>
                          <th className="px-4 py-3">Conta</th>
                          <th className="px-4 py-3">Descrição</th>
                          <th className="px-4 py-3">Tipo</th>
                          <th className="px-4 py-3">Valor</th>
                          <th className="px-4 py-3">Conciliação</th>
                          <th className="px-4 py-3">Comprovante</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {movimentosFluxo.map((m) => (
                          <tr key={m.id} className="hover:bg-[#fafcfb]">
                            <td className="px-4 py-3 text-sm">{formatarData(m.data_movimentacao)}</td>
                            <td className="px-4 py-3 font-semibold">{contasBancarias.find((c) => c.id === m.conta_bancaria_id)?.nome || "—"}</td>
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
                          </tr>
                        ))}
                        {movimentosFluxo.length === 0 && (
                          <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">Nenhuma movimentação encontrada com esses filtros.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {abaFinanceira === "mensalidades" && (
            <>
          <div className="mb-5 rounded-2xl border border-[#cfe3d8] bg-[#eef7f2] p-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-bold text-[#003d2b]">
                  Competência {formatarCompetencia(competencia)}
                </p>
                <p className="mt-1 text-sm text-[#587066]">
                  {pessoas.length} pessoa(s) com mensalidade configurada.
                  Gere a competência para criar os lançamentos.
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#005a3c] ring-1 ring-[#cfe3d8]">
                {mensalidadesCompetencia.length} lançamento(s)
              </span>
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-[#dfe9e3] bg-white p-4 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <div>
                <label className="mb-2 block text-sm font-bold text-[#173d2e]">🏦 Banco / conta do débito</label>
                <select value={filtroBancoId} onChange={(e)=>setFiltroBancoId(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3">
                  <option value="todos">Selecione um banco para baixa em lote</option>
                  {contasBancarias.map((c)=><option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</option>)}
                </select>
              </div>
              <div className="rounded-xl bg-[#f7faf8] px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Pendentes neste banco</p>
                <p className="mt-1 text-xl font-extrabold text-[#005a3c]">{mensalidadesLote.length} <span className="text-sm font-semibold text-gray-500">· {formatarMoeda(mensalidadesLote.reduce((a,m)=>a+Number(m.valor||0),0))}</span></p>
              </div>
              <button disabled={processandoLote || !mensalidadesLote.length || !selecionadosLote.length} onClick={()=>void confirmarPagamentoLote()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">{processandoLote ? "Baixando..." : `💳 Baixar ${selecionadosLote.length || "selecionadas"} em lote`}</button>
            </div>
            {filtroBancoId !== "todos" && mensalidadesLote.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e8efeb] pt-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-[#173d2e]">
                  <input type="checkbox" checked={todosLoteSelecionados} onChange={(e)=>setSelecionadosLote(e.target.checked ? mensalidadesLote.map(m=>m.id) : [])} className="h-5 w-5 accent-[#005a3c]" />
                  Selecionar todos os pendentes deste banco
                </label>
                <span className="text-sm font-bold text-[#005a3c]">Selecionados: {selecionadosLote.length} · Total: {formatarMoeda(totalLote)}</span>
              </div>
            )}
            {filtroBancoId === "todos" && <p className="mt-3 text-xs text-gray-500">Escolha a conta bancária para listar somente os associados vinculados a ela. A baixa em lote usa automaticamente a competência selecionada acima.</p>}
          </div>

          <div className="mb-6 overflow-hidden rounded-2xl border border-[#e2ebe6] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px]">
                <thead className="bg-[#e8f3ee]">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-5 py-4">{filtroBancoId !== "todos" ? "✓" : ""}</th>
                    <th className="px-5 py-4">Associado</th>
                    <th className="px-5 py-4">Competência</th>
                    <th className="px-5 py-4">Vencimento</th>
                    <th className="px-5 py-4">Valor</th>
                    <th className="px-5 py-4">Situação</th>
                    <th className="px-5 py-4">Pagamento</th>
                    <th className="px-5 py-4 text-right">Ações</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {carregando && (
                    <tr>
                      <td colSpan={8} className="px-5 py-14 text-center text-gray-500">
                        Carregando financeiro...
                      </td>
                    </tr>
                  )}

                  {!carregando && mensalidadesCompetencia.length > 0 && filtradas.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-14 text-center">
                        <div className="text-4xl">🔎</div>
                        <p className="mt-3 font-bold text-gray-700">
                          Nenhum lançamento corresponde aos filtros
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Limpe a busca/filtro para visualizar os lançamentos.
                        </p>
                      </td>
                    </tr>
                  )}

                  {!carregando && mensalidadesCompetencia.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-14 text-center">
                        <div className="text-4xl">💰</div>
                        <p className="mt-3 font-bold text-gray-700">
                          Nenhum lançamento nesta competência
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          Clique em “Gerar mensalidades” para criar as cobranças.
                        </p>
                      </td>
                    </tr>
                  )}

                  {!carregando &&
                    filtradas.map((item) => {
                      const pessoa = pessoaDoLancamento(item);
                      const meses = pessoa
                        ? historicoPorPessoa.get(pessoa.chave) || 0
                        : 0;
                      const nivel = nivelAtraso(meses);

                      return (
                        <tr
                          key={item.id}
                          className="transition hover:bg-[#fafcfb]"
                        >
                          <td className="px-5 py-4">
                            {filtroBancoId !== "todos" && mensalidadesLote.some((m)=>m.id===item.id) ? (
                              <input type="checkbox" checked={selecionadosLote.includes(item.id)} onChange={()=>setSelecionadosLote((atual)=>atual.includes(item.id)?atual.filter(id=>id!==item.id):[...atual,item.id])} className="h-5 w-5 accent-[#005a3c]" />
                            ) : null}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              {pessoa?.foto_url ? (
                                <img
                                  src={pessoa.foto_url}
                                  alt={pessoa.nome}
                                  className="h-11 w-11 rounded-full object-cover"
                                />
                              ) : (
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f3ee]">
                                  👤
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-[#173d2e]">
                                  {pessoa?.nome || "Cadastro não localizado"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Matrícula {pessoa?.matricula || "—"}
                                  {pessoa?.dependente_id ? " · Dependente" : ""}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4 font-medium">
                            {formatarCompetencia(item.competencia)}
                          </td>

                          <td className="px-5 py-4">
                            {formatarData(item.data_vencimento)}
                          </td>

                          <td className="px-5 py-4 font-bold text-[#005a3c]">
                            {formatarMoeda(item.valor)}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex flex-col items-start gap-1.5">
                              <span
                                className={`rounded-full px-3 py-1.5 text-xs font-bold ${situacaoClasse(
                                  item.situacao
                                )}`}
                              >
                                {situacaoRotulo(item.situacao)}
                              </span>

                              {item.situacao !== "pago" &&
                                item.situacao !== "isento" && (
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${nivel.classe}`}
                                  >
                                    {nivel.texto}
                                  </span>
                                )}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-sm text-gray-600">
                            {item.data_pagamento
                              ? `${formatarData(item.data_pagamento)} · ${
                                  FORMAS.find(
                                    ([v]) => v === item.tipo_pagamento
                                  )?.[1] || item.tipo_pagamento || "—"
                                }`
                              : "—"}

                            {item.comprovante_url && (
                              <button
                                onClick={() =>
                                  void abrirComprovante(item.comprovante_url)
                                }
                                className="ml-2 font-bold text-[#005a3c] underline"
                              >
                                Comprovante
                              </button>
                            )}
                          </td>

                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              {item.situacao !== "pago" &&
                                item.situacao !== "isento" && (
                                  <button
                                    onClick={() => abrirPagamento(item)}
                                    className="rounded-lg bg-[#005a3c] px-3 py-2 text-xs font-bold text-white"
                                  >
                                    💳 Pagar
                                  </button>
                                )}

                              {item.situacao === "pago" && (
                                <>
                                  <button
                                    onClick={() => void abrirRecibo(item)}
                                    className="rounded-lg bg-[#eef5ff] px-3 py-2 text-xs font-bold text-[#064b9b]"
                                  >
                                    🧾 Recibo
                                  </button>
                                  <button
                                    onClick={() => void estornarPagamento(item)}
                                    disabled={processandoEstorno}
                                    className="rounded-lg bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-700 disabled:opacity-50"
                                  >
                                    ↩️ Estornar
                                  </button>
                                </>
                              )}

                              <button
                                onClick={() => abrirEdicao(item)}
                                className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-sm font-bold text-[#005a3c]"
                              >
                                ✏️
                              </button>

                              <button
                                onClick={() => void excluir(item)}
                                className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-600"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
            <h3 className="font-bold text-[#003d2b]">Como funciona</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Info
                titulo="1. Configure"
                texto="No cadastro do sócio ou dependente, informe se possui mensalidade, valor e vencimento."
              />
              <Info
                titulo="2. Gere"
                texto="Gere a competência. O sistema não duplica uma cobrança já existente."
              />
              <Info
                titulo="3. Receba"
                texto="Registre o pagamento e, se necessário, anexe o comprovante."
              />
            </div>
          </div>
            </>
          )}
        </section>

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
            <div className="flex justify-end gap-3 md:col-span-2"><button onClick={()=>setMostrarContaModal(false)} className="rounded-xl border px-5 py-3 font-semibold">Cancelar</button><button onClick={()=>void salvarContaBancaria()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white">Salvar conta</button></div>
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
            <div className="flex justify-end gap-3 md:col-span-2"><button onClick={()=>setMostrarMovimentoModal(false)} className="rounded-xl border px-5 py-3 font-semibold">Cancelar</button><button onClick={()=>void salvarMovimentoFinanceiro()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white">Registrar movimentação</button></div>
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
            <div className="flex justify-end gap-3 md:col-span-2"><button onClick={()=>setMostrarTransferenciaModal(false)} className="rounded-xl border px-5 py-3 font-semibold">Cancelar</button><button onClick={()=>void salvarTransferencia()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white">Transferir</button></div>
          </div>
        </Modal>
      )}

      {pagamento && (
        <Modal titulo="Registrar pagamento" fechar={() => setPagamento(null)}>
          <div className="space-y-5">
            <div className="rounded-2xl bg-[#e8f3ee] p-4">
              <p className="text-xs text-gray-500">Associado</p>
              <p className="font-bold text-[#003d2b]">
                {pessoaDoLancamento(pagamento)?.nome || "Associado"}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Marque os meses que estão sendo pagos neste mesmo pagamento.
              </p>
            </div>

            <div className="rounded-2xl border border-[#d5e0da] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-[#003d2b]">Competências do pagamento</p>
                  <p className="text-xs text-gray-500">
                    Você pode marcar 2, 3 ou vários meses juntos.
                  </p>
                </div>
                <span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs font-bold text-[#005a3c]">
                  {mesesSelecionados.length} mês(es)
                </span>
              </div>

              {carregandoMesesPagamento ? (
                <div className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
                  Carregando meses...
                </div>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {mesesPagamento.map((mes) => {
                    const selecionado = mesesSelecionados.includes(mes.id);
                    const vencido =
                      mes.data_vencimento &&
                      new Date(`${mes.data_vencimento}T23:59:59`).getTime() < Date.now();

                    return (
                      <label
                        key={mes.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                          selecionado
                            ? "border-[#005a3c] bg-[#f0f8f4]"
                            : "border-gray-200"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selecionado}
                          onChange={() => alternarMesPagamento(mes.id)}
                          className="h-5 w-5 accent-[#005a3c]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#003d2b]">
                              {formatarCompetencia(mes.competencia)}
                            </span>
                            {vencido && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                Em atraso
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">
                            Vencimento: {formatarData(mes.data_vencimento)}
                          </p>
                        </div>
                        <span className="font-bold text-[#005a3c]">
                          {formatarMoeda(mes.valor)}
                        </span>
                      </label>
                    );
                  })}
                  {mesesPagamento.length === 0 && (
                    <p className="rounded-xl bg-gray-50 p-4 text-center text-sm text-gray-500">
                      Nenhuma mensalidade pendente encontrada.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t pt-3">
                <span className="text-sm font-semibold text-gray-600">Total</span>
                <span className="text-xl font-extrabold text-[#005a3c]">
                  {formatarMoeda(
                    mesesPagamento
                      .filter((m) => mesesSelecionados.includes(m.id))
                      .reduce((soma, m) => soma + Number(m.valor || 0), 0)
                  )}
                </span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Campo label="Valor pago" type="number" value={valorPagamento} onChange={setValorPagamento} />
              <Campo label="Data do pagamento" type="date" value={dataPagamento} onChange={setDataPagamento} />

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">Forma de pagamento</label>
                <select
                  value={tipoPagamento}
                  onChange={(e) => setTipoPagamento(e.target.value)}
                  className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 outline-none"
                >
                  {FORMAS.map(([valor, label]) => (
                    <option key={valor} value={valor}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">Comprovante</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                  className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-gray-700">Conta bancária da entrada</label>
                <select value={contaPagamentoId} onChange={(e) => setContaPagamentoId(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 outline-none">
                  <option value="">Não registrar saldo bancário</option>
                  {contasBancarias.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-500">Selecione a conta para que o recebimento seja somado automaticamente ao saldo.</p>
              </div>

              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-gray-700">Observações</label>
                <textarea
                  rows={3}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                  placeholder="Ex.: Pagamento conjunto de agosto e setembro."
                  className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none"
                />
              </div>
            </div>

            <div className="rounded-xl bg-yellow-50 p-3 text-xs text-yellow-800">
              <strong>Atenção:</strong> todas as competências marcadas serão quitadas
              com a mesma data, forma de pagamento e comprovante.
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setPagamento(null)} className="rounded-xl border px-5 py-3 font-semibold">
                Cancelar
              </button>
              <button
                onClick={() => void confirmarPagamento()}
                disabled={salvandoPagamento || carregandoMesesPagamento || mesesSelecionados.length === 0}
                className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-60"
              >
                {salvandoPagamento ? "Salvando..." : "Confirmar pagamento"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {reciboItens.length > 0 && (
        <Modal titulo="Recibo de pagamento" fechar={() => setReciboItens([])}>
          <div id="recibo-impressao" className="space-y-5">
            <div className="border-b pb-4 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-[#003d2b] p-2">
                <img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-full w-full object-contain" />
              </div>
              <h3 className="text-xl font-extrabold text-[#003d2b]">SOCIEDADE GUARANI</h3>
              <p className="text-sm text-gray-500">Recibo de pagamento de mensalidade</p>
            </div>

            <div className="rounded-2xl bg-[#f7faf8] p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">Recibo</p>
                  <p className="font-bold text-[#003d2b]">{reciboItens[0].numero_recibo || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Associado</p>
                  <p className="font-bold">{pessoaDoLancamento(reciboItens[0])?.nome || "Associado"}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t pt-4">
                <p className="text-sm font-bold text-[#003d2b]">Competências pagas</p>
                {reciboItens.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span>{formatarCompetencia(item.competencia)}</span>
                    <strong>{formatarMoeda(item.valor)}</strong>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t pt-3 text-lg font-extrabold text-[#005a3c]">
                  <span>Total pago</span>
                  <span>
                    {formatarMoeda(
                      reciboItens.reduce((soma, item) => soma + Number(item.valor || 0), 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-gray-500">Data</p>
                  <p className="font-bold">{formatarData(reciboItens[0].data_pagamento)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Forma</p>
                  <p className="font-bold">
                    {FORMAS.find(([valor]) => valor === reciboItens[0].tipo_pagamento)?.[1] ||
                      reciboItens[0].tipo_pagamento || "—"}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-center text-sm text-gray-500">
              Pagamento registrado no sistema da Sociedade Recreativa Guarani.
            </p>

            <div className="flex justify-end gap-3">
              <button onClick={() => setReciboItens([])} className="rounded-xl border px-5 py-3 font-semibold">
                Fechar
              </button>
              <button onClick={() => window.print()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white">
                🖨️ Imprimir / Salvar PDF
              </button>
            </div>
          </div>
        </Modal>
      )}

      {edicao && (
        <Modal
          titulo="Editar mensalidade"
          fechar={() => setEdicao(null)}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Campo
              label="Valor"
              type="number"
              value={edicaoValor}
              onChange={setEdicaoValor}
            />
            <Campo
              label="Vencimento"
              type="date"
              value={edicaoVencimento}
              onChange={setEdicaoVencimento}
            />

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Situação
              </label>
              <select
                value={edicaoSituacao}
                onChange={(e) => setEdicaoSituacao(e.target.value)}
                className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3"
              >
                <option value="em_aberto">Em aberto</option>
                <option value="em_atraso">Em atraso</option>
                <option value="pago">Pago</option>
                <option value="isento">Isento</option>
              </select>
            </div>

            <div className="flex items-end justify-end gap-3 md:col-span-2">
              <button
                onClick={() => setEdicao(null)}
                className="rounded-xl border px-5 py-3 font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={() => void salvarEdicao()}
                className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white"
              >
                Salvar alterações
              </button>
            </div>
          </div>
        </Modal>
      )}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          #recibo-impressao,
          #recibo-impressao * {
            visibility: visible !important;
          }

          #recibo-impressao {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 30px !important;
            background: white !important;
          }
        }
      `}</style>
    </main>
  );
}

function Resumo({
  titulo,
  valor,
  subtitulo,
  destaque = false,
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
  destaque?: boolean;
}) {
  if (destaque) {
    return (
      <div className="rounded-2xl border border-[#0a6b47] bg-gradient-to-br from-[#005a3c] to-[#00432c] p-5 shadow-md">
        <p className="text-sm font-medium text-[#bfe3d2]">{titulo}</p>
        <p className="mt-1 text-2xl font-extrabold text-white">{valor}</p>
        {subtitulo && <p className="mt-1 text-xs text-[#9fd4bd]">{subtitulo}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-[#005a3c]">{valor}</p>
      {subtitulo && <p className="mt-1 text-xs text-gray-500">{subtitulo}</p>}
    </div>
  );
}

function Info({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl bg-[#f7faf8] p-4">
      <p className="font-bold text-[#005a3c]">{titulo}</p>
      <p className="mt-1 text-sm text-gray-500">{texto}</p>
    </div>
  );
}

function Campo({
  label,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (valor: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-700">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none focus:border-[#005a3c]"
      />
    </div>
  );
}

function Modal({
  titulo,
  fechar,
  children,
}: {
  titulo: string;
  fechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#001f16]/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-5">
          <h2 className="text-2xl font-bold text-[#005a3c]">{titulo}</h2>
          <button
            onClick={fechar}
            className="rounded-full bg-gray-100 px-3 py-2"
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
