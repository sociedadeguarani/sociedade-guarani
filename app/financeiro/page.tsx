"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

  const pessoas = useMemo<PessoaFinanceira[]>(() => {
    const responsaveis = new Map(socios.map((s) => [s.id, s.nome]));
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
      });
    }

    return resultado;
  }, [socios, dependentes]);

  const mapaPessoa = useMemo(() => {
    const map = new Map<string, PessoaFinanceira>();
    pessoas.forEach((p) => map.set(p.chave, p));
    return map;
  }, [pessoas]);

  const pessoaDoLancamento = (item: Mensalidade) => {
    if (item.dependente_id) {
      return mapaPessoa.get(`dependente:${item.dependente_id}`) || null;
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

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return mensalidadesCompetencia.filter((item) => {
      const pessoa = pessoaDoLancamento(item);
      if (!pessoa) return false;

      const correspondeBusca =
        !termo ||
        pessoa.nome.toLowerCase().includes(termo) ||
        String(pessoa.matricula || "").includes(termo) ||
        String(pessoa.cpf || "").toLowerCase().includes(termo);

      if (!correspondeBusca) return false;

      if (filtroAtraso === "todos") return true;

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
    historicoPorPessoa,
    pessoas,
  ]);

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

    const [sociosResult, dependentesResult, mensalidadesResult] =
      await Promise.all([
        supabase
          .from("socios")
          .select(
            "id,matricula,nome,cpf,whatsapp,telefone,foto_url,situacao,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento"
          )
          .order("matricula", { ascending: true }),
        supabase
          .from("dependentes")
          .select(
            "id,socio_id,nome,cpf,telefone,ativo,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento"
          )
          .order("nome", { ascending: true }),
        supabase
          .from("mensalidades")
          .select("*")
          .order("competencia", { ascending: false })
          .order("data_vencimento", { ascending: true }),
      ]);

    const erros = [
      sociosResult.error,
      dependentesResult.error,
      mensalidadesResult.error,
    ].filter(Boolean);

    if (sociosResult.error) console.error(sociosResult.error);
    if (dependentesResult.error) console.error(dependentesResult.error);
    if (mensalidadesResult.error) console.error(mensalidadesResult.error);

    if (sociosResult.data) setSocios(sociosResult.data as Socio[]);
    if (dependentesResult.data)
      setDependentes(dependentesResult.data as Dependente[]);
    if (mensalidadesResult.data)
      setMensalidades(mensalidadesResult.data as Mensalidade[]);

    if (erros.length > 0) {
      setMensagem(
        "Não foi possível carregar uma parte do financeiro. Verifique as permissões do Supabase."
      );
    }

    setCarregando(false);
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

  async function abrirPagamento(item: Mensalidade) {
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

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">
      <header className="sticky top-0 z-40 border-b border-[#dfe9e3] bg-white/95 shadow-sm backdrop-blur">
        <div className="flex h-20 items-center justify-between px-5 sm:px-7">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#003d2b] p-1.5">
              <img
                src="/logo-guarani.png"
                alt="Sociedade Guarani"
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#123c2b]">
                SOCIEDADE GUARANI
              </h1>
              <p className="text-xs font-medium text-[#6b7d74]">
                Sociedade Recreativa Guarani — S.R.G.
              </p>
            </div>
          </div>
          <div className="hidden sm:block">
            <span className="text-sm text-gray-400">Área Administrativa</span>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-80px)]">
        <aside className="hidden w-64 shrink-0 border-r border-[#dfe9e3] bg-[#f7faf8] p-3 md:block">
          <p className="mb-3 px-3 pt-2 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">
            Menu principal
          </p>

          <nav className="space-y-2">
            {MENU.map(([nome, icone, rota]) => (
              <button
                key={nome}
                onClick={() => {
                  if (rota !== "/financeiro") window.location.href = rota;
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
                  nome === "Financeiro"
                    ? "bg-[#005a3c] text-white shadow-sm"
                    : "text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"
                }`}
              >
                <span className="text-xl">{icone}</span>
                {nome}
              </button>
            ))}
          </nav>

          <div className="mt-10 rounded-2xl bg-[#f7edbd] p-4">
            <p className="text-xs font-bold text-[#705c00]">
              SOCIEDADE GUARANI
            </p>
            <p className="mt-1 text-sm text-[#574900]">
              Sistema integrado de gestão
            </p>
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
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

          <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Resumo titulo="Total lançado" valor={formatarMoeda(totalLancado)} />
            <Resumo titulo="Recebido" valor={formatarMoeda(totalRecebido)} />
            <Resumo titulo="Em aberto" valor={formatarMoeda(totalAberto)} />
            <Resumo titulo="Em atraso" valor={formatarMoeda(totalAtrasado)} />
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

          <div className="mb-6 overflow-hidden rounded-2xl border border-[#e2ebe6] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px]">
                <thead className="bg-[#e8f3ee]">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
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
                      <td colSpan={7} className="px-5 py-14 text-center text-gray-500">
                        Carregando financeiro...
                      </td>
                    </tr>
                  )}

                  {!carregando && filtradas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-14 text-center">
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
                                  {pessoa?.nome || "Associado"}
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
        </section>
      </div>

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
}: {
  titulo: string;
  valor: string;
  subtitulo?: string;
}) {
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
