"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  rg: string | null;
  data_nascimento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  data_associacao: string | null;
  categoria: string | null;
  situacao: string | null;
  observacoes: string | null;
  foto_url: string | null;

  tipo_socio: string | null;
  responsavel_id: string | null;
  parentesco: string | null;
  possui_mensalidade: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
  conta_bancaria_id: string | null;
  modalidade_temporada: string | null;
  inicio_temporada: string | null;
  fim_temporada: string | null;
  situacao_financeira: string | null;
  data_ultimo_pagamento: string | null;
};

type Mensalidade = {
  id: string;
  socio_id: string;
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
  updated_at?: string;
};

const menus = [
  { nome: "Início", icone: "🏠" },
  { nome: "Sócios", icone: "👥" },
  { nome: "Dependentes", icone: "👨‍👩‍👧‍👦" },
  { nome: "Reservas", icone: "📅" },
  { nome: "Eventos", icone: "🎉" },
  { nome: "Financeiro", icone: "💰" },
  { nome: "Espaços", icone: "🏛️" },
  { nome: "Relatórios", icone: "📊" },
];

const socioInicial: Partial<Socio> = {
  nome: "",
  cpf: "",
  rg: "",
  data_nascimento: "",
  telefone: "",
  whatsapp: "",
  email: "",
  endereco: "",
  numero: "",
  bairro: "",
  cidade: "",
  estado: "RS",
  cep: "",
  data_associacao: "",
  categoria: "Titular",
  situacao: "ativo",
  observacoes: "",
  foto_url: "",

  tipo_socio: "patrimonial_individual",
  responsavel_id: null,
  parentesco: "",
  possui_mensalidade: false,
  valor_mensalidade: 0,
  dia_vencimento: 10,
  tipo_pagamento: "pix",
  conta_bancaria_id: null,
  modalidade_temporada: null,
  inicio_temporada: "",
  fim_temporada: "",
  situacao_financeira: "isento",
  data_ultimo_pagamento: "",
};

const TIPOS_SOCIO = [
  { value: "patrimonial_individual", label: "Sócio Patrimonial Individual" },
  { value: "patrimonial_familiar", label: "Sócio Patrimonial Familiar" },
  {
    value: "dependente_patrimonial_familiar_mensalidade",
    label: "Dependente Sócio Patrimonial Familiar com Mensalidade",
  },
  {
    value: "dependente_patrimonial_individual_mensalidade",
    label: "Dependente Sócio Patrimonial Individual com Mensalidade",
  },
  { value: "contribuinte_individual", label: "Sócio Contribuinte Individual" },
  { value: "contribuinte_familiar", label: "Sócio Contribuinte Familiar" },
  {
    value: "dependente_contribuinte_familiar_mensalidade",
    label: "Dependente Sócio Contribuinte Familiar com Mensalidade",
  },
  {
    value: "dependente_contribuinte_individual_mensalidade",
    label: "Dependente Sócio Contribuinte Individual com Mensalidade",
  },
  { value: "remido", label: "Sócio Remido" },
  { value: "temporada_individual", label: "Temporada Individual" },
  { value: "temporada_familiar", label: "Temporada Familiar" },
  { value: "transitorio", label: "Transitório" },
  { value: "dependente_transitorio", label: "Dependente Transitório" },
  { value: "convite_semanal", label: "Convite Semanal" },
  { value: "convite_diario", label: "Convite Diário" },
  { value: "convite_mes", label: "Convite Mês" },
];

const PARENTESCOS = [
  "Esposa",
  "Esposo",
  "Companheiro(a)",
  "Filho(a)",
  "Enteado(a)",
  "Pai",
  "Mãe",
  "Irmão(ã)",
  "Outro",
];

const FORMAS_PAGAMENTO = [
  "pix",
  "debito_em_conta",
  "boleto",
  "dinheiro",
];

type ContaBancaria = {
  id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  ativo: boolean;
};

function podeTerDependentes(tipo?: string | null) {
  return [
    "patrimonial_familiar",
    "contribuinte_familiar",
    "temporada_familiar",
    "transitorio",
    "dependente_patrimonial_familiar_mensalidade",
    "dependente_contribuinte_familiar_mensalidade",
  ].includes(tipo || "");
}

function tipoDependenteParaResponsavel(tipo?: string | null) {
  switch (tipo) {
    case "patrimonial_familiar":
    case "dependente_patrimonial_familiar_mensalidade":
      return "dependente_patrimonial_familiar_mensalidade";
    case "contribuinte_familiar":
    case "dependente_contribuinte_familiar_mensalidade":
      return "dependente_contribuinte_familiar_mensalidade";
    case "temporada_familiar":
      return "dependente_patrimonial_familiar_mensalidade";
    case "transitorio":
      return "dependente_transitorio";
    default:
      return "dependente_patrimonial_familiar_mensalidade";
  }
}

function tipoSocioLabel(tipo?: string | null) {
  return TIPOS_SOCIO.find((x) => x.value === tipo)?.label || tipo || "Não informado";
}

function tipoSocioClasse(tipo?: string | null) {
  switch (tipo) {
    case "patrimonial_individual":
      return "bg-[#dceee6] text-[#003d2b] ring-1 ring-[#9fcdb9]";
    case "patrimonial_familiar":
      return "bg-[#cfe7dc] text-[#003d2b] ring-1 ring-[#9fcdb9]";
    case "dependente_patrimonial_familiar_mensalidade":
      return "bg-[#e8f3ee] text-[#2d8061] ring-1 ring-[#b9ddcc]";
    case "dependente_patrimonial_individual_mensalidade":
      return "bg-[#e8f3ee] text-[#2d8061] ring-1 ring-[#b9ddcc]";
    case "contribuinte_individual":
      return "bg-[#dce8f7] text-[#064b9b] ring-1 ring-[#aac4e4]";
    case "contribuinte_familiar":
      return "bg-[#cddff4] text-[#064b9b] ring-1 ring-[#aac4e4]";
    case "dependente_contribuinte_familiar_mensalidade":
      return "bg-[#e8f0fb] text-[#376aa6] ring-1 ring-[#bdd0ea]";
    case "dependente_contribuinte_individual_mensalidade":
      return "bg-[#e8f0fb] text-[#376aa6] ring-1 ring-[#bdd0ea]";
    case "remido":
      return "bg-[#f0e9f8] text-[#6d4b91] ring-1 ring-[#d5c5e6]";
    case "temporada_individual":
    case "temporada_familiar":
      return "bg-[#ffead9] text-[#b65308] ring-1 ring-[#f2bb91]";
    case "transitorio":
    case "dependente_transitorio":
      return "bg-[#fff4cc] text-[#8a6700] ring-1 ring-[#f1d879]";
    case "convite_semanal":
    case "convite_diario":
    case "convite_mes":
      return "bg-[#eef3ef] text-[#50625a] ring-1 ring-[#d7e1dc]";
    default:
      return "bg-[#eef3ef] text-[#50625a] ring-1 ring-[#d7e1dc]";
  }
}

export default function Home() {
  const [menu, setMenu] = useState("Início");
  const [verificandoLogin, setVerificandoLogin] = useState(true);
  const [usuarioEmail, setUsuarioEmail] = useState("");

  const [socios, setSocios] = useState<Socio[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [busca, setBusca] = useState("");
  const [abrirCadastro, setAbrirCadastro] = useState(false);
  const [socioEditando, setSocioEditando] = useState<Socio | null>(null);

  const [form, setForm] = useState<Partial<Socio>>(socioInicial);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);
  const [mostrarSomenteDependentes, setMostrarSomenteDependentes] = useState(false);

  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [competenciaFinanceiro, setCompetenciaFinanceiro] = useState(
    new Date().toISOString().slice(0, 7)
  );
  const [buscaFinanceiro, setBuscaFinanceiro] = useState("");
  const [carregandoFinanceiro, setCarregandoFinanceiro] = useState(false);
  const [gerandoMensalidades, setGerandoMensalidades] = useState(false);
  const [mensalidadeEditando, setMensalidadeEditando] = useState<Mensalidade | null>(null);
  const [abrirPagamento, setAbrirPagamento] = useState(false);
  const [mensalidadePagamento, setMensalidadePagamento] = useState<Mensalidade | null>(null);
  const [reciboMensalidade, setReciboMensalidade] = useState<Mensalidade | null>(null);
  const [arquivoComprovante, setArquivoComprovante] = useState<File | null>(null);
  const [pagamentoForm, setPagamentoForm] = useState({
    valor: "",
    data_pagamento: new Date().toISOString().slice(0, 10),
    tipo_pagamento: "pix",
    observacoes: "",
  });

  const [relatorioCompetencia, setRelatorioCompetencia] = useState(new Date().toISOString().slice(0, 7));
  const [relatorioMensalidades, setRelatorioMensalidades] = useState<Mensalidade[]>([]);
  const [relatorioFormaPagamento, setRelatorioFormaPagamento] = useState("todas");
  const [relatorioSituacao, setRelatorioSituacao] = useState("todas");
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);

  useEffect(() => {
    let montado = true;

    async function verificarSessao() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        window.location.replace("/login");
        return;
      }

      if (montado) {
        setUsuarioEmail(session.user.email || "");
        setVerificandoLogin(false);
      }
    }

    void verificarSessao();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        window.location.replace("/login");
      } else if (montado) {
        setUsuarioEmail(session.user.email || "");
      }
    });

    return () => {
      montado = false;
      subscription.unsubscribe();
    };
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    window.location.replace("/login");
  }

  async function carregarMensalidades(referencia = competenciaFinanceiro) {
    setCarregandoFinanceiro(true);

    const inicio = primeiroDiaDoMes(referencia);
    const { data, error } = await supabase
      .from("mensalidades")
      .select("*")
      .eq("competencia", inicio)
      .order("data_vencimento", { ascending: true });

    if (error) {
      console.error(error);
      setMensagem("Erro ao carregar as mensalidades.");
      setMensalidades([]);
    } else {
      const itens = (data || []) as Mensalidade[];
      const hoje = new Date().toISOString().slice(0, 10);

      const idsParaAtraso = itens
        .filter(
          (item) =>
            item.situacao === "em_aberto" &&
            item.data_vencimento &&
            item.data_vencimento < hoje
        )
        .map((item) => item.id);

      if (idsParaAtraso.length > 0) {
        await supabase
          .from("mensalidades")
          .update({ situacao: "em_atraso" })
          .in("id", idsParaAtraso);

        itens.forEach((item) => {
          if (idsParaAtraso.includes(item.id)) item.situacao = "em_atraso";
        });
      }

      setMensalidades(itens);
    }

    setCarregandoFinanceiro(false);
  }

  async function gerarMensalidadesCompetencia(referencia = competenciaFinanceiro) {
    setGerandoMensalidades(true);
    setMensagem("");

    try {
      const pessoasComMensalidade = socios.filter(
        (s) =>
          s.possui_mensalidade === true &&
          Number(s.valor_mensalidade || 0) >= 0 &&
          s.situacao?.toLowerCase() !== "inativo"
      );

      if (pessoasComMensalidade.length === 0) {
        setMensalidades([]);
        setMensagem("Nenhum associado/dependente possui mensalidade ativa.");
        return;
      }

      const competencia = primeiroDiaDoMes(referencia);

      const { data: existentes, error: erroBusca } = await supabase
        .from("mensalidades")
        .select("socio_id")
        .eq("competencia", competencia);

      if (erroBusca) throw erroBusca;

      const idsExistentes = new Set(
        (existentes || []).map((item: { socio_id: string }) => item.socio_id)
      );

      const novos = pessoasComMensalidade
        .filter((socio) => !idsExistentes.has(socio.id))
        .map((socio) => ({
          socio_id: socio.id,
          competencia,
          valor: Number(socio.valor_mensalidade || 0),
          data_vencimento: calcularVencimento(
            referencia,
            socio.dia_vencimento
          ),
          situacao:
            Number(socio.valor_mensalidade || 0) === 0
              ? "isento"
              : "em_aberto",
          data_pagamento: null,
          tipo_pagamento: socio.tipo_pagamento || null,
          comprovante_url: null,
          observacoes: null,
        }));

      if (novos.length > 0) {
        const { error: erroInsercao } = await supabase
          .from("mensalidades")
          .insert(novos);

        if (erroInsercao) throw erroInsercao;
      }

      await carregarMensalidades(referencia);
      setMensagem(
        novos.length > 0
          ? `${novos.length} mensalidade(s) gerada(s) para ${formatarCompetencia(referencia)}.`
          : `As mensalidades de ${formatarCompetencia(referencia)} já estavam geradas.`
      );
    } catch (error) {
      console.error(error);
      setMensagem("Não foi possível gerar as mensalidades.");
    } finally {
      setGerandoMensalidades(false);
    }
  }

  async function abrirFinanceiro() {
    setMenu("Financeiro");
    await carregarMensalidades(competenciaFinanceiro);
  }

  function alterarCompetenciaFinanceiro(valor: string) {
    setCompetenciaFinanceiro(valor);
    void carregarMensalidades(valor);
  }

  function editarMensalidade(item: Mensalidade) {
    setMensalidadeEditando(item);
  }

  async function salvarEdicaoMensalidade(
    item: Mensalidade,
    valor: number,
    vencimento: string,
    situacao: string,
    tipoPagamento: string,
    observacoes: string
  ) {
    const { error } = await supabase
      .from("mensalidades")
      .update({
        valor,
        data_vencimento: vencimento || null,
        situacao,
        tipo_pagamento: tipoPagamento || null,
        observacoes: observacoes || null,
      })
      .eq("id", item.id);

    if (error) {
      console.error(error);
      setMensagem("Não foi possível atualizar a mensalidade.");
      return;
    }

    setMensagem("Mensalidade atualizada com sucesso.");
    setMensalidadeEditando(null);
    await carregarMensalidades();
  }

  async function excluirMensalidade(item: Mensalidade) {
    if (!window.confirm("Deseja realmente excluir esta mensalidade?")) return;

    const { error } = await supabase
      .from("mensalidades")
      .delete()
      .eq("id", item.id);

    if (error) {
      console.error(error);
      setMensagem("Não foi possível excluir a mensalidade.");
      return;
    }

    setMensagem("Mensalidade excluída.");
    await carregarMensalidades();
  }

  function abrirRegistroPagamento(item: Mensalidade) {
    setMensalidadePagamento(item);
    setArquivoComprovante(null);
    setPagamentoForm({
      valor: String(Number(item.valor || 0)),
      data_pagamento: new Date().toISOString().slice(0, 10),
      tipo_pagamento: item.tipo_pagamento || "pix",
      observacoes: "",
    });
    setAbrirPagamento(true);
  }

  async function confirmarPagamento() {
    if (!mensalidadePagamento) return;

    setSalvando(true);
    setMensagem("");

    try {
      let comprovantePath = mensalidadePagamento.comprovante_url || null;

      if (arquivoComprovante) {
        const extensao =
          arquivoComprovante.name.split(".").pop()?.toLowerCase() || "jpg";
        const caminho = `mensalidades/${mensalidadePagamento.id}.${extensao}`;

        const upload = await supabase.storage
          .from("comprovantes-financeiro")
          .upload(caminho, arquivoComprovante, {
            upsert: true,
            contentType: arquivoComprovante.type || "application/octet-stream",
          });

        if (upload.error) throw upload.error;
        comprovantePath = caminho;
      }

      const competenciaRecibo = mensalidadePagamento.competencia.slice(0, 7);

      const { data: recibosExistentes, error: erroRecibos } = await supabase
        .from("mensalidades")
        .select("numero_recibo")
        .eq("competencia", mensalidadePagamento.competencia)
        .not("numero_recibo", "is", null);

      if (erroRecibos) throw erroRecibos;

      const numerosExistentes = (recibosExistentes || [])
        .map((item: { numero_recibo?: string | null }) => {
          const numero = String(item.numero_recibo || "");
          const parte = numero.split("-").pop() || "";
          return Number(parte);
        })
        .filter((numero: number) => Number.isFinite(numero) && numero > 0);

      const proximoNumero =
        numerosExistentes.length > 0 ? Math.max(...numerosExistentes) + 1 : 1;
      const numeroRecibo = `REC-${competenciaRecibo.replace("-", "")}-${String(
        proximoNumero
      ).padStart(3, "0")}`;

      const { error } = await supabase
        .from("mensalidades")
        .update({
          valor: Number(pagamentoForm.valor || 0),
          situacao: "pago",
          data_pagamento: pagamentoForm.data_pagamento || null,
          tipo_pagamento: pagamentoForm.tipo_pagamento || null,
          comprovante_url: comprovantePath,
          observacoes: pagamentoForm.observacoes || null,
          numero_recibo: numeroRecibo,
        })
        .eq("id", mensalidadePagamento.id);

      if (error) throw error;

      await supabase
        .from("socios")
        .update({
          situacao_financeira: "em_dia",
          data_ultimo_pagamento: pagamentoForm.data_pagamento || null,
        })
        .eq("id", mensalidadePagamento.socio_id);

      setAbrirPagamento(false);
      setMensalidadePagamento(null);
      setArquivoComprovante(null);
      setMensagem("Pagamento registrado com sucesso.");
      await carregarMensalidades();
      await carregarSocios();
    } catch (error) {
      console.error(error);
      setMensagem("Não foi possível registrar o pagamento.");
    } finally {
      setSalvando(false);
    }
  }

  async function abrirComprovante(path: string | null) {
    if (!path) return;

    const { data, error } = await supabase.storage
      .from("comprovantes-financeiro")
      .createSignedUrl(path, 60 * 10);

    if (error || !data?.signedUrl) {
      console.error(error);
      setMensagem("Não foi possível abrir o comprovante.");
      return;
    }

    window.open(data.signedUrl, "_blank");
  }

  function selecionarFoto(file: File | null) {
    setFotoArquivo(file);
    if (file) {
      setForm((atual) => ({
        ...atual,
        foto_url: URL.createObjectURL(file),
      }));
    }
  }

  function removerFoto() {
    setFotoArquivo(null);
    setForm((atual) => ({
      ...atual,
      foto_url: "",
    }));
  }

  async function carregarRelatorioFinanceiro(referencia = relatorioCompetencia) {
    setCarregandoRelatorio(true);
    const competencia = primeiroDiaDoMes(referencia);
    const { data, error } = await supabase
      .from("mensalidades")
      .select("*")
      .eq("competencia", competencia)
      .order("data_vencimento", { ascending: true });

    if (error) {
      console.error(error);
      setRelatorioMensalidades([]);
      setMensagem("Erro ao carregar o relatório financeiro.");
    } else {
      setRelatorioMensalidades((data || []) as Mensalidade[]);
    }
    setCarregandoRelatorio(false);
  }

  function abrirRelatorios() {
    setMenu("Relatórios");
    void carregarRelatorioFinanceiro(relatorioCompetencia);
  }

  async function carregarContasBancarias() {
    const { data, error } = await supabase
      .from("contas_bancarias")
      .select("id,nome,banco,agencia,conta,ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (error) {
      console.error(error);
      setContasBancarias([]);
      return;
    }

    setContasBancarias((data || []) as ContaBancaria[]);
  }

  async function carregarSocios() {
    setCarregando(true);

    const { data, error } = await supabase
      .from("socios")
      .select("*")
      .order("matricula", { ascending: true });

    if (error) {
      console.error(error);
      setMensagem("Erro ao carregar os sócios.");
    } else {
      setSocios(data || []);
    }

    setCarregando(false);
  }

  useEffect(() => {
    carregarSocios();
    void carregarContasBancarias();
    void carregarMensalidades(competenciaFinanceiro);
  }, []);

  function novoSocio() {
    setSocioEditando(null);
    setForm({
      ...socioInicial,
      data_associacao: new Date().toISOString().split("T")[0],
    });
    setFotoArquivo(null);
    setAbrirCadastro(true);
    setMensagem("");
  }

  function novoDependente(responsavel: Socio) {
    if (!podeTerDependentes(responsavel.tipo_socio)) {
      setMensagem("Este tipo de sócio não possui dependentes.");
      return;
    }

    setSocioEditando(null);
    setForm({
      ...socioInicial,
      tipo_socio: tipoDependenteParaResponsavel(responsavel.tipo_socio),
      responsavel_id: responsavel.id,
      parentesco: "Filho(a)",
      possui_mensalidade: true,
      valor_mensalidade: 0,
      data_associacao: new Date().toISOString().split("T")[0],
    });
    setFotoArquivo(null);
    setAbrirCadastro(true);
    setMensagem("");
  }

  function editarSocio(socio: Socio) {
    setSocioEditando(socio);
    setForm({ ...socio, situacao: socio.situacao?.toLowerCase() || "ativo" });
    setFotoArquivo(null);
    setAbrirCadastro(true);
    setMensagem("");
  }

  function fecharCadastro() {
    if (!salvando) {
      setAbrirCadastro(false);
      setSocioEditando(null);
    }
  }

  function alterarCampo(campo: keyof Socio, valor: string) {
    setForm((atual) => {
      const proximo = {
        ...atual,
        [campo]:
          campo === "possui_mensalidade"
            ? valor === "true"
            : valor,
      };

      if (campo === "tipo_socio") {
        const tipo = valor;
        const mensalidadeObrigatoria = [
          "dependente_patrimonial_familiar_mensalidade",
          "dependente_patrimonial_individual_mensalidade",
          "dependente_contribuinte_familiar_mensalidade",
          "dependente_contribuinte_individual_mensalidade",
        ].includes(tipo);

        if (tipo === "remido") {
          proximo.possui_mensalidade = false;
          proximo.valor_mensalidade = 0;
        } else if (mensalidadeObrigatoria) {
          proximo.possui_mensalidade = true;
        }

        if (!tipo.startsWith("dependente_")) {
          proximo.responsavel_id = null;
          proximo.parentesco = "";
        }
      }

      return proximo;
    });
  }

  async function salvarSocio() {
    if (!form.nome?.trim()) {
      setMensagem("Informe o nome completo do sócio.");
      return;
    }

    setSalvando(true);
    setMensagem("");

    const dadosBase = {
      nome: form.nome?.trim(),
      cpf: form.cpf || null,
      rg: form.rg || null,
      data_nascimento: form.data_nascimento || null,
      telefone: form.telefone || null,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      endereco: form.endereco || null,
      numero: form.numero || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null,
      cep: form.cep || null,
      data_associacao: form.data_associacao || null,
      categoria: form.categoria || "Titular",
      situacao: form.situacao || "ativo",
      observacoes: form.observacoes || null,

      tipo_socio: form.tipo_socio || "patrimonial_individual",
      responsavel_id: form.responsavel_id || null,
      parentesco: form.parentesco || null,
      possui_mensalidade: Boolean(form.possui_mensalidade),
      valor_mensalidade: Number(form.valor_mensalidade || 0),
      dia_vencimento: Number(form.dia_vencimento || 10),
      tipo_pagamento: form.tipo_pagamento || "pix",
      conta_bancaria_id:
        form.tipo_pagamento === "debito_em_conta"
          ? form.conta_bancaria_id || null
          : null,
      modalidade_temporada: form.modalidade_temporada || null,
      inicio_temporada: form.inicio_temporada || null,
      fim_temporada: form.fim_temporada || null,
      situacao_financeira: form.situacao_financeira || "isento",
      data_ultimo_pagamento: form.data_ultimo_pagamento || null,
    };

    try {
      let socioId = socioEditando?.id || "";

      if (socioEditando) {
        const resultado = await supabase
          .from("socios")
          .update({
            ...dadosBase,
            foto_url: form.foto_url || null,
          })
          .eq("id", socioEditando.id);

        if (resultado.error) throw resultado.error;
      } else {
        const resultado = await supabase
          .from("socios")
          .insert(dadosBase)
          .select("id")
          .single();

        if (resultado.error) throw resultado.error;
        socioId = resultado.data.id;
      }

      if (fotoArquivo && socioId) {
        const extensao =
          fotoArquivo.name.split(".").pop()?.toLowerCase() || "jpg";
        const caminho = `socios/${socioId}.${extensao}`;

        const upload = await supabase.storage
          .from("fotos-associados")
          .upload(caminho, fotoArquivo, {
            upsert: true,
            contentType: fotoArquivo.type || "image/jpeg",
          });

        if (upload.error) throw upload.error;

        const { data: urlData } = supabase.storage
          .from("fotos-associados")
          .getPublicUrl(caminho);

        const atualizacaoFoto = await supabase
          .from("socios")
          .update({ foto_url: urlData.publicUrl })
          .eq("id", socioId);

        if (atualizacaoFoto.error) throw atualizacaoFoto.error;
      }

      setMensagem(
        socioEditando
          ? "Sócio atualizado com sucesso!"
          : "Sócio cadastrado com sucesso!"
      );

      setFotoArquivo(null);
      await carregarSocios();

      setTimeout(() => {
        setAbrirCadastro(false);
        setSocioEditando(null);
        setMensagem("");
      }, 900);
    } catch (error) {
      console.error(error);
      setMensagem(
        "Não foi possível salvar. Verifique o Supabase e o bucket fotos-associados."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirSocio(socio: Socio) {
    const confirmar = window.confirm(
      `Deseja realmente excluir o sócio "${socio.nome}"?`
    );

    if (!confirmar) return;

    const { error } = await supabase
      .from("socios")
      .delete()
      .eq("id", socio.id);

    if (error) {
      console.error(error);
      setMensagem("Não foi possível excluir o sócio.");
      return;
    }

    setMensagem("Sócio excluído.");
    await carregarSocios();

    setTimeout(() => setMensagem(""), 1500);
  }

  const sociosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    return socios.filter((socio) => {
      const correspondeBusca =
        !termo ||
        socio.nome?.toLowerCase().includes(termo) ||
        socio.cpf?.toLowerCase().includes(termo) ||
        String(socio.matricula || "").includes(termo);

      const correspondeTipo =
        !mostrarSomenteDependentes ||
        Boolean(socio.responsavel_id) ||
        (socio.tipo_socio || "").startsWith("dependente_");

      return correspondeBusca && correspondeTipo;
    });
  }, [socios, busca, mostrarSomenteDependentes]);

  if (verificandoLogin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8faf9]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#dfe9e3] border-t-[#005a3c]" />
          <p className="font-semibold text-[#005a3c]">
            Verificando acesso...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">

      {/* CABEÇALHO */}
      <header className="sticky top-0 z-30 border-b border-[#dfe9e3] bg-white/95 text-[#123c2b] shadow-sm backdrop-blur">
        <div className="flex h-20 items-center justify-between px-5 sm:px-7">

          <div className="flex items-center gap-4">

            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-[#003d2b] p-1.5 shadow-sm">
              <img
                src="/logo-guarani.png"
                alt="Sociedade Guarani"
                className="h-full w-full object-contain"
              />
            </div>

            <div>
              <h1 className="text-base font-extrabold tracking-tight sm:text-lg">
                SOCIEDADE GUARANI
              </h1>

              <p className="text-xs font-medium text-[#6b7d74]">
                Sociedade Recreativa Guarani — S.R.G.
              </p>
            </div>

          </div>

          <div className="hidden items-center gap-4 sm:flex">
            <div className="text-right">
              <p className="text-xs text-gray-500">
                {usuarioEmail || "Usuário autenticado"}
              </p>

              <p className="font-bold text-[#005a3c]">
                Área Administrativa
              </p>
            </div>

            <button
              type="button"
              onClick={sair}
              className="rounded-lg border border-[#c9d9d1] bg-white px-3 py-2 text-sm font-bold text-[#005a3c] shadow-sm transition hover:bg-[#f0f7f3]"
            >
              Sair
            </button>
          </div>

        </div>
      </header>

      <div className="flex min-h-[calc(100vh-80px)]">

        {/* MENU LATERAL */}
        <aside className="hidden w-64 shrink-0 border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-5 md:block">

          <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">
            Menu principal
          </p>

          <nav className="space-y-2">

            {menus.map((item) => (
              <button
                key={item.nome}
                onClick={() => {
                    if (item.nome === "Financeiro") {
                      void abrirFinanceiro();
                    } else if (item.nome === "Relatórios") {
                      abrirRelatorios();
                    } else {
                      setMenu(item.nome);
                    }
                  }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
                  menu === item.nome
                    ? "bg-[#005a3c] text-white shadow-sm"
                    : "text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"
                }`}
              >
                <span className="text-xl">
                  {item.icone}
                </span>

                {item.nome}
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

        {/* CONTEÚDO */}
        <section className="min-w-0 flex-1 bg-[#f8faf9] p-5 sm:p-7 lg:p-8">

          {/* MENU MOBILE */}
          <div className="mb-6 grid grid-cols-3 gap-2 md:hidden">

            {menus.map((item) => (
              <button
                key={item.nome}
                onClick={() => {
                    if (item.nome === "Financeiro") {
                      void abrirFinanceiro();
                    } else if (item.nome === "Relatórios") {
                      abrirRelatorios();
                    } else {
                      setMenu(item.nome);
                    }
                  }}
                className={`rounded-xl p-3 text-xs font-semibold ${
                  menu === item.nome
                    ? "bg-[#005a3c] text-white"
                    : "bg-white text-gray-700 shadow-sm"
                }`}
              >
                <div className="mb-1 text-xl">
                  {item.icone}
                </div>

                {item.nome}
              </button>
            ))}

          </div>

          {/* INÍCIO */}
          {menu === "Início" && (
            <Inicio
              socios={socios}
              quantidadeSocios={socios.length}
              abrirCadastro={novoSocio}
            />
          )}

          {/* SÓCIOS */}
          {menu === "Sócios" && (
            <Socios
              socios={sociosFiltrados}
              quantidadeTotal={socios.length}
              busca={busca}
              setBusca={setBusca}
              novoSocio={novoSocio}
              novoDependente={novoDependente}
              editarSocio={editarSocio}
              excluirSocio={excluirSocio}
              carregando={carregando}
              mostrarSomenteDependentes={mostrarSomenteDependentes}
              setMostrarSomenteDependentes={setMostrarSomenteDependentes}
            />
          )}

          {/* DEPENDENTES / FAMÍLIAS */}
          {menu === "Dependentes" && (
            <Dependentes
              socios={socios}
              novoDependente={novoDependente}
              editarSocio={editarSocio}
            />
          )}

          {/* FINANCEIRO */}
          {menu === "Financeiro" && (
            <Financeiro
              socios={socios}
              mensalidades={mensalidades}
              competencia={competenciaFinanceiro}
              busca={buscaFinanceiro}
              setBusca={setBuscaFinanceiro}
              carregando={carregandoFinanceiro}
              gerando={gerandoMensalidades}
              gerarMensalidades={() => void gerarMensalidadesCompetencia()}
              alterarCompetencia={alterarCompetenciaFinanceiro}
              editarMensalidade={editarMensalidade}
              excluirMensalidade={excluirMensalidade}
              registrarPagamento={abrirRegistroPagamento}
              abrirComprovante={abrirComprovante}
              emitirRecibo={(item) => setReciboMensalidade(item)}
            />
          )}

          {/* RELATÓRIOS FINANCEIROS */}
          {menu === "Relatórios" && (
            <RelatoriosFinanceiros
              socios={socios}
              mensalidades={relatorioMensalidades}
              competencia={relatorioCompetencia}
              setCompetencia={(valor) => {
                setRelatorioCompetencia(valor);
                void carregarRelatorioFinanceiro(valor);
              }}
              formaPagamento={relatorioFormaPagamento}
              setFormaPagamento={setRelatorioFormaPagamento}
              situacao={relatorioSituacao}
              setSituacao={setRelatorioSituacao}
              carregando={carregandoRelatorio}
            />
          )}

          {/* OUTROS MÓDULOS */}
          {menu !== "Início" &&
            menu !== "Sócios" &&
            menu !== "Dependentes" &&
            menu !== "Financeiro" &&
             menu !== "Relatórios" && (
              <ModuloEmConstrucao
                nome={menu}
                icone={
                  menus.find((x) => x.nome === menu)?.icone || "📋"
                }
              />
            )}

        </section>
      </div>

      {mensalidadeEditando && (
        <ModalEdicaoMensalidade
          item={mensalidadeEditando}
          fechar={() => setMensalidadeEditando(null)}
          salvar={salvarEdicaoMensalidade}
        />
      )}

      {abrirPagamento && mensalidadePagamento && (
        <ModalPagamentoGuarani
          socio={socios.find((s) => s.id === mensalidadePagamento.socio_id) || null}
          mensalidade={mensalidadePagamento}
          form={pagamentoForm}
          setForm={setPagamentoForm}
          arquivo={arquivoComprovante}
          setArquivo={setArquivoComprovante}
          fechar={() => {
            setAbrirPagamento(false);
            setMensalidadePagamento(null);
            setArquivoComprovante(null);
          }}
          salvar={() => void confirmarPagamento()}
          salvando={salvando}
        />
      )}

      {reciboMensalidade && (
        <ReciboPagamentoGuarani
          socio={socios.find((s) => s.id === reciboMensalidade.socio_id) || null}
          mensalidade={reciboMensalidade}
          fechar={() => setReciboMensalidade(null)}
        />
      )}

      {/* MODAL CADASTRO */}
      {abrirCadastro && (
        <ModalSocio
          socios={socios}
          contasBancarias={contasBancarias}
          form={form}
          socioEditando={socioEditando}
          salvando={salvando}
          mensagem={mensagem}
          fechar={fecharCadastro}
          alterarCampo={alterarCampo}
          salvar={salvarSocio}
          selecionarFoto={selecionarFoto}
          removerFoto={removerFoto}
        />
      )}

    </main>
  );
}


/* =========================
   INÍCIO
========================= */

function Inicio({
  socios,
  quantidadeSocios,
  abrirCadastro,
}: {
  socios: Socio[];
  quantidadeSocios: number;
  abrirCadastro: () => void;
}) {
  return (
    <>
      <div className="mb-8">

        <p className="text-sm font-medium text-gray-500">
          Bem-vindo ao sistema
        </p>

        <h2 className="mt-1 text-3xl font-bold text-[#005a3c]">
          Painel da Sociedade Guarani
        </h2>

        <p className="mt-2 text-gray-600">
          Gerencie sócios, reservas, eventos, espaços e financeiro
          em um único lugar.
        </p>

      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">

        <DashboardCard
          titulo="Sócios"
          valor={String(quantidadeSocios)}
          descricao="Sócios cadastrados"
          icone="👥"
        />

        <DashboardCard
          titulo="Dependentes"
          valor={String(socios.filter((s) => Boolean(s.responsavel_id)).length)}
          descricao="Vinculados a responsáveis"
          icone="👨‍👩‍👧‍👦"
        />

        <DashboardCard
          titulo="Reservas"
          valor="0"
          descricao="Reservas este mês"
          icone="📅"
        />

        <DashboardCard
          titulo="Eventos"
          valor="0"
          descricao="Eventos cadastrados"
          icone="🎉"
        />

        <DashboardCard
          titulo="Espaços"
          valor="4"
          descricao="Espaços disponíveis"
          icone="🏛️"
        />

      </div>

      <div className="mt-8 rounded-2xl bg-[#063b28] p-6 text-white shadow-lg">

        <h3 className="text-xl font-bold">
          Acesso rápido
        </h3>

        <p className="mt-1 text-sm text-gray-200">
          Comece uma nova operação no sistema.
        </p>

        <button
          onClick={abrirCadastro}
          className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#005a3c] transition hover:bg-[#f5d76e]"
        >
          👤 Cadastrar novo sócio
        </button>

      </div>
    </>
  );
}


/* =========================
   CORES DAS CATEGORIAS
========================= */

function categoriaClasse(categoria?: string | null) {
  const valor = (categoria || "").toLowerCase();

  if (valor.includes("patrimonial") && valor.includes("depend")) {
    return "bg-[#e8f3ee] text-[#2d8061] ring-1 ring-[#b9ddcc]";
  }
  if (valor.includes("patrimonial")) {
    return "bg-[#dceee6] text-[#003d2b] ring-1 ring-[#9fcdb9]";
  }
  if (valor.includes("contribuinte") && valor.includes("depend")) {
    return "bg-[#e8f0fb] text-[#376aa6] ring-1 ring-[#bdd0ea]";
  }
  if (valor.includes("contribuinte")) {
    return "bg-[#dce8f7] text-[#064b9b] ring-1 ring-[#aac4e4]";
  }
  if (valor.includes("temporário") || valor.includes("temporario") ||
      valor.includes("transitório") || valor.includes("transitorio")) {
    return "bg-[#fff4cc] text-[#8a6700] ring-1 ring-[#f1d879]";
  }
  if (valor.includes("temporada")) {
    return "bg-[#ffead9] text-[#b65308] ring-1 ring-[#f2bb91]";
  }
  if (valor.includes("benemérito") || valor.includes("benemerito")) {
    return "bg-[#f0e9f8] text-[#6d4b91] ring-1 ring-[#d5c5e6]";
  }
  return "bg-[#eef3ef] text-[#50625a] ring-1 ring-[#d7e1dc]";
}

/* =========================
   SÓCIOS
========================= */

function Socios({
  socios,
  quantidadeTotal,
  busca,
  setBusca,
  novoSocio,
  novoDependente,
  editarSocio,
  excluirSocio,
  carregando,
  mostrarSomenteDependentes,
  setMostrarSomenteDependentes,
}: {
  socios: Socio[];
  quantidadeTotal: number;
  busca: string;
  setBusca: (valor: string) => void;
  novoSocio: () => void;
  novoDependente: (responsavel: Socio) => void;
  editarSocio: (socio: Socio) => void;
  excluirSocio: (socio: Socio) => void;
  carregando: boolean;
  mostrarSomenteDependentes: boolean;
  setMostrarSomenteDependentes: (valor: boolean) => void;
}) {
  return (
    <div>

      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

        <div>
          <p className="text-sm font-medium text-gray-500">
            Administração
          </p>

          <h2 className="mt-1 text-3xl font-bold text-[#005a3c]">
            Sócios
          </h2>

          <p className="mt-1 text-gray-500">
            Cadastro e gerenciamento dos associados.
          </p>
        </div>

        <button
          onClick={novoSocio}
          className="rounded-xl bg-[#063b28] px-5 py-3 font-bold text-white shadow transition hover:bg-[#003d2b]"
        >
          + Novo Sócio
        </button>

      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Total de sócios
          </p>

          <p className="mt-1 text-3xl font-bold text-[#005a3c]">
            {quantidadeTotal}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Sócios ativos
          </p>

          <p className="mt-1 text-3xl font-bold text-[#005a3c]">
            {socios.filter((s) => s.situacao?.toLowerCase() === "ativo").length}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">
            Exibindo
          </p>

          <p className="mt-1 text-3xl font-bold text-[#005a3c]">
            {socios.length}
          </p>
        </div>

      </div>

      <div className="mb-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">

        <div className="flex items-center gap-3">

          <span className="text-xl">
            🔎
          </span>

          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF ou matrícula..."
            className="w-full bg-transparent py-2 outline-none"
          />

        </div>

      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e2ebe6] bg-white shadow-sm">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[900px]">

            <thead className="bg-[#e8f3ee]">

              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">

                <th className="px-5 py-4">
                  Foto
                </th>

                <th className="px-5 py-4">
                  Matrícula
                </th>

                <th className="px-5 py-4">
                  Nome
                </th>

                <th className="px-5 py-4">
                  CPF
                </th>

                <th className="px-5 py-4">
                  WhatsApp
                </th>

                <th className="px-5 py-4">
                  Tipo
                </th>

                <th className="px-5 py-4">
                  Responsável
                </th>

                <th className="px-5 py-4">
                  Mensalidade
                </th>

                <th className="px-5 py-4">
                  Situação
                </th>

                <th className="px-5 py-4 text-right">
                  Ações
                </th>

              </tr>

            </thead>

            <tbody className="divide-y">

              {carregando && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-12 text-center text-gray-500"
                  >
                    Carregando sócios...
                  </td>
                </tr>
              )}

              {!carregando && socios.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-5 py-12 text-center"
                  >
                    <div className="text-4xl">
                      👥
                    </div>

                    <p className="mt-3 font-semibold text-gray-700">
                      Nenhum sócio encontrado
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Cadastre o primeiro sócio da Sociedade Guarani.
                    </p>

                    <button
                      onClick={novoSocio}
                      className="mt-4 rounded-lg bg-[#063b28] px-4 py-2 text-sm font-bold text-white"
                    >
                      + Cadastrar sócio
                    </button>
                  </td>
                </tr>
              )}

              {!carregando &&
                socios.map((socio) => (
                  <tr
                    key={socio.id}
                    className="transition hover:bg-[#fafcfb]"
                  >

                    <td className="px-5 py-4">
                      {socio.foto_url ? (
                        <img
                          src={socio.foto_url}
                          alt={`Foto de ${socio.nome}`}
                          className="h-11 w-11 rounded-full object-cover ring-2 ring-[#eef3ef]"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f3ee] text-lg">
                          👤
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4 font-semibold text-[#005a3c]">
                      {socio.matricula || "-"}
                    </td>

                    <td className="px-5 py-4">

                      <div className="font-semibold">
                        {socio.nome}
                      </div>

                      <div className="text-xs text-gray-400">
                        {socio.email || "Sem e-mail"}
                      </div>

                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600">
                      {socio.cpf || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600">
                      {socio.whatsapp || socio.telefone || "-"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      <span className={`inline-flex max-w-[190px] rounded-full px-3 py-1 text-xs font-extrabold ${tipoSocioClasse(socio.tipo_socio)}`}>
                        {tipoSocioLabel(socio.tipo_socio)}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600">
                      {socio.responsavel_id
                        ? socios.find((p) => p.id === socio.responsavel_id)?.nome || "Responsável"
                        : "—"}
                    </td>

                    <td className="px-5 py-4 text-sm">
                      {socio.possui_mensalidade
                        ? `R$ ${Number(socio.valor_mensalidade || 0).toFixed(2).replace(".", ",")}`
                        : "Sem mensalidade"}
                    </td>

                    <td className="px-5 py-4">

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          socio.situacao?.toLowerCase() === "ativo"
                            ? "bg-green-100 text-green-700"
                            : socio.situacao?.toLowerCase() === "suspenso"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {socio.situacao?.toLowerCase() === "ativo"
                          ? "Ativo"
                          : socio.situacao?.toLowerCase() === "inativo"
                            ? "Inativo"
                            : socio.situacao?.toLowerCase() === "suspenso"
                              ? "Suspenso"
                              : "Ativo"}
                      </span>

                    </td>

                    <td className="px-5 py-4">

                      <div className="flex justify-end gap-2">

                        {podeTerDependentes(socio.tipo_socio) && (
                          <button
                            onClick={() => novoDependente(socio)}
                            className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-sm font-semibold text-[#005a3c] hover:bg-[#dce8df]"
                            title="Adicionar dependente"
                          >
                            👨‍👩‍👧 + Dependente
                          </button>
                        )}

                        <button
                          onClick={() => editarSocio(socio)}
                          className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-sm font-semibold text-[#005a3c] hover:bg-[#dce8df]"
                        >
                          ✏️ Editar
                        </button>

                        <button
                          onClick={() => excluirSocio(socio)}
                          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                        >
                          🗑️
                        </button>

                      </div>

                    </td>

                  </tr>
                ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}



/* =========================
   FINANCEIRO
========================= */

function primeiroDiaDoMes(referencia: string) {
    return `${referencia}-01`;
  }

function calcularVencimento(referencia: string, dia: number | null | undefined) {
    const [ano, mes] = referencia.split("-").map(Number);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const diaSeguro = Math.min(Math.max(Number(dia || 10), 1), ultimoDia);
    return `${referencia}-${String(diaSeguro).padStart(2, "0")}`;
  }

function rotuloSituacaoFinanceira(situacao: string | null | undefined) {
    switch (situacao) {
      case "pago":
        return "Pago";
      case "em_atraso":
        return "Em atraso";
      case "isento":
        return "Isento";
      default:
        return "Em aberto";
    }
  }

function classeSituacaoFinanceira(situacao: string | null | undefined) {
    switch (situacao) {
      case "pago":
        return "bg-green-100 text-green-700";
      case "em_atraso":
        return "bg-red-100 text-red-700";
      case "isento":
        return "bg-gray-100 text-gray-600";
      default:
        return "bg-yellow-100 text-yellow-700";
    }
  }

function formatarMoeda(valor: number | null | undefined) {
  return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`;
}

function formatarCompetencia(referencia: string) {
  const [ano, mes] = referencia.split("-");
  if (!ano || !mes) return referencia;
  return `${mes}/${ano}`;
}

function formatarDataFinanceiro(data: string | null | undefined) {
  if (!data) return "—";
  const partes = data.slice(0, 10).split("-");
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function Financeiro({
  socios,
  mensalidades,
  competencia,
  busca,
  setBusca,
  carregando,
  gerando,
  gerarMensalidades,
  alterarCompetencia,
  editarMensalidade,
  excluirMensalidade,
  registrarPagamento,
  abrirComprovante,
  emitirRecibo,
}: {
  socios: Socio[];
  mensalidades: Mensalidade[];
  competencia: string;
  busca: string;
  setBusca: (valor: string) => void;
  carregando: boolean;
  gerando: boolean;
  gerarMensalidades: () => void;
  alterarCompetencia: (valor: string) => void;
  editarMensalidade: (item: Mensalidade) => void;
  excluirMensalidade: (item: Mensalidade) => void;
  registrarPagamento: (item: Mensalidade) => void;
  abrirComprovante: (path: string | null) => void;
  emitirRecibo: (item: Mensalidade) => void;
}) {
  const termo = busca.toLowerCase().trim();

  const filtradas = mensalidades.filter((item) => {
    const socio = socios.find((s) => s.id === item.socio_id);
    return (
      !termo ||
      socio?.nome?.toLowerCase().includes(termo) ||
      String(socio?.matricula || "").includes(termo)
    );
  });

  const total = filtradas.reduce((s, m) => s + Number(m.valor || 0), 0);
  const recebido = filtradas
    .filter((m) => m.situacao === "pago")
    .reduce((s, m) => s + Number(m.valor || 0), 0);
  const aberto = filtradas
    .filter((m) => m.situacao === "em_aberto" || m.situacao === "em_atraso")
    .reduce((s, m) => s + Number(m.valor || 0), 0);
  const atrasado = filtradas
    .filter((m) => m.situacao === "em_atraso")
    .reduce((s, m) => s + Number(m.valor || 0), 0);

  const pessoasComMensalidade = socios.filter(
    (s) => s.possui_mensalidade === true && s.situacao?.toLowerCase() !== "inativo"
  ).length;

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-gray-500">Administração</p>
          <h2 className="mt-1 text-3xl font-bold text-[#005a3c]">Financeiro</h2>
          <p className="mt-1 text-gray-500">
            Controle mensal de cobranças, vencimentos e pagamentos.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="rounded-xl border border-[#d5e0da] bg-white px-3 py-2">
            <label className="mr-2 text-xs font-bold text-gray-500">Competência</label>
            <input
              type="month"
              value={competencia}
              onChange={(e) => alterarCompetencia(e.target.value)}
              className="font-semibold text-[#005a3c] outline-none"
            />
          </div>

          <button
            onClick={gerarMensalidades}
            disabled={gerando}
            className="rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-60"
          >
            {gerando ? "Gerando..." : "⚡ Gerar mensalidades"}
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <ResumoFinanceiroGuarani titulo="Total lançado" valor={total} />
        <ResumoFinanceiroGuarani titulo="Recebido" valor={recebido} />
        <ResumoFinanceiroGuarani titulo="Em aberto" valor={aberto} />
        <ResumoFinanceiroGuarani titulo="Em atraso" valor={atrasado} />
        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Com mensalidade</p>
          <p className="mt-1 text-3xl font-bold text-[#005a3c]">{pessoasComMensalidade}</p>
          <p className="mt-1 text-xs text-gray-500">Associados e dependentes</p>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-[#e2ebe6] bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔎</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou matrícula..."
            className="w-full bg-transparent py-2 outline-none"
          />
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-[#cfe3d8] bg-[#eef7f2] p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="font-bold text-[#003d2b]">
              Competência {formatarCompetencia(competencia)}
            </p>
            <p className="mt-1 text-sm text-[#587066]">
              O sistema cria automaticamente uma cobrança para cada pessoa com mensalidade,
              sem duplicar registros existentes.
            </p>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#005a3c] ring-1 ring-[#cfe3d8]">
            {mensalidades.length} lançamento(s)
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e2ebe6] bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
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
                  <td colSpan={7} className="px-5 py-12 text-center text-gray-500">
                    Carregando financeiro...
                  </td>
                </tr>
              )}

              {!carregando && filtradas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="text-4xl">💰</div>
                    <p className="mt-3 font-semibold text-gray-700">
                      Nenhuma mensalidade nesta competência
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      Clique em “Gerar mensalidades” para criar os lançamentos das pessoas com mensalidade.
                    </p>
                  </td>
                </tr>
              )}

              {!carregando &&
                filtradas.map((item) => {
                  const socio = socios.find((s) => s.id === item.socio_id);

                  return (
                    <tr key={item.id} className="transition hover:bg-[#fafcfb]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {socio?.foto_url ? (
                            <img
                              src={socio.foto_url}
                              alt={`Foto de ${socio.nome}`}
                              className="h-11 w-11 rounded-full object-cover ring-2 ring-[#e8f3ee]"
                            />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f3ee]">
                              👤
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-[#173d2e]">
                              {socio?.nome || "Associado não encontrado"}
                            </div>
                            <div className="text-xs text-gray-500">
                              Matrícula {socio?.matricula || "—"}
                              {socio?.responsavel_id ? " · Dependente" : ""}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 font-medium">
                        {formatarCompetencia(competencia)}
                      </td>

                      <td className="px-5 py-4">
                        {formatarDataFinanceiro(item.data_vencimento)}
                      </td>

                      <td className="px-5 py-4 font-bold text-[#005a3c]">
                        {formatarMoeda(item.valor)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1.5 text-xs font-bold ${classeSituacaoFinanceira(
                            item.situacao
                          )}`}
                        >
                          {rotuloSituacaoFinanceira(item.situacao)}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm text-gray-600">
                        {item.data_pagamento
                          ? `${formatarDataFinanceiro(item.data_pagamento)} · ${
                              item.tipo_pagamento || "—"
                            }`
                          : "—"}
                        {item.comprovante_url && (
                          <button
                            onClick={() => abrirComprovante(item.comprovante_url)}
                            className="ml-2 text-xs font-bold text-[#005a3c] underline"
                          >
                            Comprovante
                          </button>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          {item.situacao !== "pago" && item.situacao !== "isento" && (
                            <button
                              onClick={() => registrarPagamento(item)}
                              className="rounded-lg bg-[#005a3c] px-3 py-2 text-sm font-bold text-white"
                            >
                              💳 Pagar
                            </button>
                          )}

                          {item.situacao === "pago" && (
                            <button
                              onClick={() => emitirRecibo(item)}
                              className="rounded-lg bg-[#fff4cc] px-3 py-2 text-sm font-bold text-[#705c00]"
                              title="Emitir recibo"
                            >
                              🧾 Recibo
                            </button>
                          )}

                          <button
                            onClick={() => editarMensalidade(item)}
                            className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-sm font-bold text-[#005a3c]"
                          >
                            ✏️
                          </button>

                          <button
                            onClick={() => excluirMensalidade(item)}
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

      <div className="mt-6 rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
        <h3 className="font-bold text-[#003d2b]">Como funciona</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-[#f7faf8] p-4">
            <p className="font-bold text-[#005a3c]">1. Cadastre a mensalidade</p>
            <p className="mt-1 text-sm text-gray-500">
              Defina no cadastro de cada pessoa se possui mensalidade, valor e dia de vencimento.
            </p>
          </div>
          <div className="rounded-xl bg-[#f7faf8] p-4">
            <p className="font-bold text-[#005a3c]">2. Gere a competência</p>
            <p className="mt-1 text-sm text-gray-500">
              O sistema cria os lançamentos somente para quem ainda não possui cobrança naquele mês.
            </p>
          </div>
          <div className="rounded-xl bg-[#f7faf8] p-4">
            <p className="font-bold text-[#005a3c]">3. Registre o pagamento</p>
            <p className="mt-1 text-sm text-gray-500">
              Informe a forma, data e, se quiser, anexe o comprovante.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumoFinanceiroGuarani({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string | number;
}) {
  return (
    <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-[#005a3c]">
        {typeof valor === "number" ? formatarMoeda(valor) : valor}
      </p>
    </div>
  );
}

function ModalEdicaoMensalidade({
  item,
  fechar,
  salvar,
}: {
  item: Mensalidade;
  fechar: () => void;
  salvar: (
    item: Mensalidade,
    valor: number,
    vencimento: string,
    situacao: string,
    tipoPagamento: string,
    observacoes: string
  ) => void;
}) {
  const [valor, setValor] = useState(String(item.valor ?? 0));
  const [vencimento, setVencimento] = useState(item.data_vencimento || "");
  const [situacao, setSituacao] = useState(item.situacao || "em_aberto");
  const [tipoPagamento, setTipoPagamento] = useState(item.tipo_pagamento || "");
  const [observacoes, setObservacoes] = useState(item.observacoes || "");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#001f16]/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-5">
          <div>
            <p className="text-sm text-gray-500">Financeiro</p>
            <h2 className="text-2xl font-bold text-[#005a3c]">Editar mensalidade</h2>
          </div>
          <button onClick={fechar} className="rounded-full bg-gray-100 px-3 py-2 text-lg">
            ✕
          </button>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2">
          <Campo label="Valor" type="number" value={valor} onChange={setValor} />
          <Campo label="Vencimento" type="date" value={vencimento} onChange={setVencimento} />

          <SelectCampo
            label="Situação"
            value={situacao}
            onChange={setSituacao}
            opcoes={["em_aberto", "em_atraso", "pago", "isento"]}
            labels={{
              em_aberto: "Em aberto",
              em_atraso: "Em atraso",
              pago: "Pago",
              isento: "Isento",
            }}
          />

          <SelectCampo
            label="Forma de pagamento"
            value={tipoPagamento}
            onChange={setTipoPagamento}
            opcoes={["", "pix", "debito_em_conta", "boleto", "dinheiro", "transferencia", "outro"]}
            labels={{
              "": "Não informado",
              pix: "PIX",
              debito_em_conta: "Débito em conta",
              boleto: "Boleto",
              dinheiro: "Dinheiro",
              transferencia: "Transferência",
              outro: "Outro",
            }}
          />

          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-gray-700">Observações</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none focus:border-[#005a3c]"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t bg-[#fafcfb] px-6 py-4">
          <button
            onClick={fechar}
            className="rounded-xl border border-gray-200 bg-white px-5 py-3 font-semibold text-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              salvar(
                item,
                Number(valor || 0),
                vencimento,
                situacao,
                tipoPagamento,
                observacoes
              )
            }
            className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white"
          >
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  );
}

function ReciboPagamentoGuarani({
  socio,
  mensalidade,
  fechar,
}: {
  socio: Socio | null;
  mensalidade: Mensalidade;
  fechar: () => void;
}) {
  const numeroRecibo =
    mensalidade.numero_recibo ||
    `REC-${mensalidade.competencia.slice(0, 7).replace("-", "")}-${
      socio?.matricula || mensalidade.id.slice(0, 8).toUpperCase()
    }`;

  const formaPagamento: Record<string, string> = {
    pix: "PIX",
    debito_em_conta: "Débito em conta",
    boleto: "Boleto",
    dinheiro: "Dinheiro",
    transferencia: "Transferência",
    outro: "Outro",
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }

          html,
          body {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .recibo-overlay {
            position: static !important;
            display: block !important;
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }

          .recibo-impressao,
          .recibo-impressao * {
            visibility: visible !important;
          }

          .recibo-impressao {
            position: relative !important;
            left: auto !important;
            top: auto !important;
            width: 210mm !important;
            min-height: 297mm !important;
            max-height: none !important;
            margin: 0 !important;
            padding: 18mm !important;
            overflow: visible !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            border: 0 !important;
          }

          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div className="recibo-overlay fixed inset-0 z-[80] flex items-center justify-center bg-[#001f16]/70 p-4 backdrop-blur-sm">
        <div className="recibo-impressao max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
          <div className="print-hide flex items-center justify-between border-b px-6 py-5">
            <div>
              <p className="text-sm text-gray-500">Financeiro</p>
              <h2 className="text-2xl font-bold text-[#005a3c]">Recibo de pagamento</h2>
            </div>
            <button onClick={fechar} className="rounded-full bg-gray-100 px-3 py-2 text-lg">
              ✕
            </button>
          </div>

          <div className="p-8 sm:p-10">
            <div className="flex items-start justify-between gap-6 border-b-2 border-[#005a3c] pb-6">
              <div className="flex items-center gap-4">
                <img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-20 w-20 object-contain" />
                <div>
                  <h1 className="text-xl font-extrabold uppercase text-[#005a3c]">Sociedade Guarani</h1>
                  <p className="text-sm text-gray-600">Sociedade Recreativa Guarani — S.R.G.</p>
                  <p className="mt-1 text-xs text-gray-500">Recibo de pagamento de mensalidade</p>
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p className="font-bold text-[#003d2b]">Nº do recibo</p>
                <p className="mt-1 font-mono text-sm">{numeroRecibo}</p>
              </div>
            </div>

            <div className="mt-8 space-y-5">
              <div className="rounded-2xl bg-[#e8f3ee] p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Associado</p>
                <p className="mt-1 text-xl font-bold uppercase text-[#003d2b]">
                  {socio?.nome || "Associado não encontrado"}
                </p>
                <div className="mt-3 grid gap-2 text-sm text-gray-600 sm:grid-cols-3">
                  <p><strong>Matrícula:</strong> {socio?.matricula || "—"}</p>
                  <p><strong>CPF:</strong> {socio?.cpf || "—"}</p>
                  <p><strong>Tipo:</strong> {tipoSocioLabel(socio?.tipo_socio)}</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[#dfe9e3] p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">Competência</p>
                  <p className="mt-1 font-bold text-[#003d2b]">{formatarCompetencia(mensalidade.competencia.slice(0, 7))}</p>
                </div>
                <div className="rounded-xl border border-[#dfe9e3] p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">Data do pagamento</p>
                  <p className="mt-1 font-bold text-[#003d2b]">{formatarDataFinanceiro(mensalidade.data_pagamento)}</p>
                </div>
                <div className="rounded-xl border border-[#dfe9e3] p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">Forma de pagamento</p>
                  <p className="mt-1 font-bold text-[#003d2b]">
                    {formaPagamento[mensalidade.tipo_pagamento || ""] || mensalidade.tipo_pagamento || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#dfe9e3] p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">Valor pago</p>
                  <p className="mt-1 text-xl font-extrabold text-[#005a3c]">{formatarMoeda(mensalidade.valor)}</p>
                </div>
              </div>

              {mensalidade.observacoes && (
                <div className="rounded-xl border border-[#dfe9e3] p-4 text-sm">
                  <p className="font-bold text-[#003d2b]">Observações</p>
                  <p className="mt-1 text-gray-600">{mensalidade.observacoes}</p>
                </div>
              )}

              <p className="pt-4 text-center text-sm leading-6 text-gray-600">
                Recebemos do associado acima identificado o valor referente à mensalidade indicada neste recibo.
              </p>

              <div className="pt-14 text-center">
                <div className="mx-auto w-64 border-t border-gray-400 pt-2 text-sm text-gray-600">
                  Sociedade Recreativa Guarani
                </div>
              </div>
            </div>
          </div>

          <div className="print-hide flex justify-end gap-3 border-t bg-[#fafcfb] px-6 py-4">
            <button onClick={fechar} className="rounded-xl border border-gray-200 bg-white px-5 py-3 font-semibold text-gray-700">
              Fechar
            </button>
            <button onClick={() => window.print()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white">
              🖨️ Imprimir / Salvar PDF
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ModalPagamentoGuarani({
  socio,
  mensalidade,
  form,
  setForm,
  arquivo,
  setArquivo,
  fechar,
  salvar,
  salvando,
}: {
  socio: Socio | null;
  mensalidade: Mensalidade;
  form: {
    valor: string;
    data_pagamento: string;
    tipo_pagamento: string;
    observacoes: string;
  };
  setForm: React.Dispatch<
    React.SetStateAction<{
      valor: string;
      data_pagamento: string;
      tipo_pagamento: string;
      observacoes: string;
    }>
  >;
  arquivo: File | null;
  setArquivo: (file: File | null) => void;
  fechar: () => void;
  salvar: () => void;
  salvando: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#001f16]/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-5">
          <div>
            <p className="text-sm text-gray-500">Financeiro</p>
            <h2 className="text-2xl font-bold text-[#005a3c]">Registrar pagamento</h2>
          </div>
          <button onClick={fechar} className="rounded-full bg-gray-100 px-3 py-2 text-lg">
            ✕
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded-2xl bg-[#e8f3ee] p-4">
            <p className="text-xs text-gray-500">Associado</p>
            <p className="font-bold text-[#003d2b]">{socio?.nome || "Associado"}</p>
            <p className="mt-1 text-sm text-gray-600">
              Competência: {formatarCompetencia(mensalidade.competencia.slice(0, 7))} ·{" "}
              {formatarMoeda(mensalidade.valor)}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Campo
              label="Valor pago"
              type="number"
              value={form.valor}
              onChange={(v) => setForm((x) => ({ ...x, valor: v }))}
            />

            <Campo
              label="Data do pagamento"
              type="date"
              value={form.data_pagamento}
              onChange={(v) => setForm((x) => ({ ...x, data_pagamento: v }))}
            />

            <SelectCampo
              label="Forma de pagamento"
              value={form.tipo_pagamento}
              onChange={(v) => setForm((x) => ({ ...x, tipo_pagamento: v }))}
              opcoes={["pix", "debito_em_conta", "boleto", "dinheiro", "transferencia", "outro"]}
              labels={{
                pix: "PIX",
                debito_em_conta: "Débito em conta",
                boleto: "Boleto",
                dinheiro: "Dinheiro",
                transferencia: "Transferência",
                outro: "Outro",
              }}
            />

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Comprovante
              </label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 text-sm"
              />
              {arquivo && (
                <p className="mt-2 text-xs text-gray-500">
                  Arquivo: {arquivo.name}
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Observações
              </label>
              <textarea
                value={form.observacoes}
                onChange={(e) => setForm((x) => ({ ...x, observacoes: e.target.value }))}
                rows={3}
                className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none focus:border-[#005a3c]"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t bg-[#fafcfb] px-6 py-4">
          <button
            onClick={fechar}
            className="rounded-xl border border-gray-200 bg-white px-5 py-3 font-semibold text-gray-700"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Confirmar pagamento"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   DEPENDENTES / FAMÍLIAS
========================= */

function Dependentes({
  socios,
  novoDependente,
  editarSocio,
}: {
  socios: Socio[];
  novoDependente: (responsavel: Socio) => void;
  editarSocio: (socio: Socio) => void;
}) {
  const dependentes = socios.filter((s) => Boolean(s.responsavel_id));
  const responsaveis = socios.filter((s) =>
    socios.some((filho) => filho.responsavel_id === s.id)
  );

  function filhosDe(id: string) {
    return socios.filter((s) => s.responsavel_id === id);
  }

  function arvore(pessoa: Socio, nivel = 0): ReactNode {
    const filhos = filhosDe(pessoa.id);

    return (
      <div key={pessoa.id}>
        <div
          className="flex flex-col gap-4 rounded-2xl border border-[#dfe9e3] bg-white p-4 shadow-sm sm:flex-row sm:items-center"
          style={{ marginLeft: nivel * 24 }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {pessoa.foto_url ? (
              <img
                src={pessoa.foto_url}
                alt={`Foto de ${pessoa.nome}`}
                className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-[#e8f3ee]"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#e8f3ee] text-2xl">
                👤
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-[#173d2e]">
                  {pessoa.nome}
                </p>

                {nivel === 0 && (
                  <span className="rounded-full bg-[#005a3c] px-2.5 py-1 text-[10px] font-bold text-white">
                    TITULAR / RESPONSÁVEL
                  </span>
                )}
              </div>

              <p className="mt-1 text-xs text-gray-500">
                Matrícula {pessoa.matricula || "—"} ·{" "}
                {tipoSocioLabel(pessoa.tipo_socio)}
              </p>

              {pessoa.responsavel_id && (
                <p className="mt-1 text-xs text-gray-500">
                  Parentesco: {pessoa.parentesco || "Não informado"}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pessoa.possui_mensalidade ? (
              <div className="text-right">
                <span className="inline-flex rounded-full bg-[#fff4cc] px-3 py-1.5 text-xs font-bold text-[#8a6700]">
                  Mensalidade · R$ {Number(pessoa.valor_mensalidade || 0).toFixed(2).replace(".", ",")}
                </span>
                {pessoa.dia_vencimento && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    Vencimento dia {pessoa.dia_vencimento}
                  </p>
                )}
              </div>
            ) : (
              <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-500">
                Sem mensalidade
              </span>
            )}

            <button
              onClick={() => editarSocio(pessoa)}
              className="rounded-xl bg-[#e8f3ee] px-3 py-2 text-sm font-bold text-[#005a3c] hover:bg-[#dce8df]"
            >
              ✏️ Editar
            </button>

            {podeTerDependentes(pessoa.tipo_socio) && (
              <button
                onClick={() => novoDependente(pessoa)}
                className="rounded-xl bg-[#005a3c] px-3 py-2 text-sm font-bold text-white hover:bg-[#003d2b]"
              >
                👨‍👩‍👧 + Dependente
              </button>
            )}
          </div>
        </div>

        {filhos.length > 0 && (
          <div className="mt-3 space-y-3 border-l-2 border-[#cfe3d8] pl-3">
            {filhos.map((filho) => arvore(filho, nivel + 1))}
          </div>
        )}
      </div>
    );
  }

  const raizes = socios.filter(
    (s) =>
      !s.responsavel_id &&
      (podeTerDependentes(s.tipo_socio) || filhosDe(s.id).length > 0)
  );

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-medium text-gray-500">
            Administração
          </p>
          <h2 className="mt-1 text-3xl font-bold text-[#005a3c]">
            Famílias e Dependentes
          </h2>
          <p className="mt-1 text-gray-500">
            Visualize a estrutura familiar e quem está vinculado a cada responsável.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Pessoas cadastradas</p>
          <p className="mt-1 text-3xl font-bold text-[#005a3c]">{socios.length}</p>
        </div>

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Dependentes</p>
          <p className="mt-1 text-3xl font-bold text-[#005a3c]">{dependentes.length}</p>
        </div>

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Responsáveis familiares</p>
          <p className="mt-1 text-3xl font-bold text-[#005a3c]">{responsaveis.length}</p>
        </div>
      </div>

      {socios.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[#cfe3d8] bg-white p-12 text-center shadow-sm">
          <div className="text-5xl">👨‍👩‍👧‍👦</div>
          <h3 className="mt-4 text-lg font-bold text-[#173d2e]">
            Nenhuma família cadastrada
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Cadastre um Sócio Patrimonial Familiar ou Sócio Contribuinte Familiar para começar.
          </p>
        </div>
      ) : raizes.length === 0 ? (
        <div className="rounded-3xl border border-[#e2ebe6] bg-white p-8 text-center shadow-sm">
          <p className="font-semibold text-gray-700">
            Ainda não há uma família com dependentes.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Os sócios individuais também aparecem no módulo Sócios.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {raizes.map((raiz) => (
            <div
              key={raiz.id}
              className="rounded-3xl border border-[#dfe9e3] bg-[#f7faf8] p-4 shadow-sm sm:p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-[#91a099]">
                    Grupo familiar
                  </p>
                  <p className="font-bold text-[#005a3c]">
                    {raiz.nome}
                  </p>
                </div>

                {podeTerDependentes(raiz.tipo_socio) && (
                  <button
                    onClick={() => novoDependente(raiz)}
                    className="rounded-xl bg-[#005a3c] px-4 py-2 text-sm font-bold text-white hover:bg-[#003d2b]"
                  >
                    + Adicionar dependente
                  </button>
                )}
              </div>

              <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#587066]">
                <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[#dfe9e3]">
                  {filhosDe(raiz.id).length} dependente{filhosDe(raiz.id).length === 1 ? "" : "s"} direto{filhosDe(raiz.id).length === 1 ? "" : "s"}
                </span>
              </div>

              {arvore(raiz)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* =========================
   MODAL DO SÓCIO
========================= */

function ModalSocio({
  socios,
  contasBancarias,
  form,
  socioEditando,
  salvando,
  mensagem,
  fechar,
  alterarCampo,
  salvar,
  selecionarFoto,
  removerFoto,
}: {
  socios: Socio[];
  contasBancarias: ContaBancaria[];
  form: Partial<Socio>;
  socioEditando: Socio | null;
  salvando: boolean;
  mensagem: string;
  fechar: () => void;
  alterarCampo: (campo: keyof Socio, valor: string) => void;
  salvar: () => void;
  selecionarFoto: (file: File | null) => void;
  removerFoto: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#001f16]/55 backdrop-blur-sm p-4">

      <div className="max-h-[95vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">

        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-5">

          <div>

            <p className="text-sm text-gray-500">
              Sociedade Recreativa Guarani
            </p>

            <h2 className="text-2xl font-bold text-[#005a3c]">
              {socioEditando
                ? "Editar Sócio"
                : "Novo Sócio"}
            </h2>

          </div>

          <button
            onClick={fechar}
            className="rounded-full bg-gray-100 px-3 py-2 text-lg hover:bg-gray-200"
          >
            ✕
          </button>

        </div>

        <div className="space-y-8 p-6">

          {/* DADOS PESSOAIS */}
          <FormularioSecao titulo="👤 Dados pessoais">

            <Campo
              label="Nome completo"
              obrigatorio
              value={form.nome}
              onChange={(v) => alterarCampo("nome", v)}
              className="md:col-span-2"
            />

            <Campo
              label="CPF"
              value={form.cpf}
              onChange={(v) => alterarCampo("cpf", v)}
              placeholder="000.000.000-00"
            />

            <Campo
              label="RG"
              value={form.rg}
              onChange={(v) => alterarCampo("rg", v)}
            />

            <Campo
              label="Data de nascimento"
              type="date"
              value={form.data_nascimento}
              onChange={(v) => alterarCampo("data_nascimento", v)}
            />

          </FormularioSecao>

          {/* FOTO */}
          <FormularioSecao titulo="📷 Foto do associado">
            <div className="md:col-span-4">
              <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-gray-300 bg-[#fafcfb] p-6 sm:flex-row">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-white shadow-sm">
                  {form.foto_url ? (
                    <img
                      src={form.foto_url}
                      alt={`Foto de ${form.nome || "associado"}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-5xl">👤</span>
                  )}
                </div>

                <div className="flex-1 text-center sm:text-left">
                  <p className="font-semibold text-gray-800">
                    Foto do associado
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Escolha uma foto para aparecer no cadastro e na lista de sócios.
                  </p>

                  <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                    <label className="cursor-pointer rounded-xl bg-[#063b28] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#003d2b]">
                      📷 Escolher foto
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) =>
                          selecionarFoto(e.target.files?.[0] || null)
                        }
                      />
                    </label>

                    {form.foto_url && (
                      <button
                        type="button"
                        onClick={removerFoto}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100"
                      >
                        🗑️ Remover foto
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </FormularioSecao>

          {/* CONTATO */}
          <FormularioSecao titulo="📞 Contato">

            <Campo
              label="Telefone"
              value={form.telefone}
              onChange={(v) => alterarCampo("telefone", v)}
            />

            <Campo
              label="WhatsApp"
              value={form.whatsapp}
              onChange={(v) => alterarCampo("whatsapp", v)}
            />

            <Campo
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(v) => alterarCampo("email", v)}
              className="md:col-span-2"
            />

          </FormularioSecao>

          {/* ENDEREÇO */}
          <FormularioSecao titulo="🏠 Endereço">

            <Campo
              label="CEP"
              value={form.cep}
              onChange={(v) => alterarCampo("cep", v)}
            />

            <Campo
              label="Número"
              value={form.numero}
              onChange={(v) => alterarCampo("numero", v)}
            />

            <Campo
              label="Endereço"
              value={form.endereco}
              onChange={(v) => alterarCampo("endereco", v)}
              className="md:col-span-2"
            />

            <Campo
              label="Bairro"
              value={form.bairro}
              onChange={(v) => alterarCampo("bairro", v)}
            />

            <Campo
              label="Cidade"
              value={form.cidade}
              onChange={(v) => alterarCampo("cidade", v)}
            />

            <Campo
              label="Estado"
              value={form.estado}
              onChange={(v) => alterarCampo("estado", v)}
            />

          </FormularioSecao>

          {/* ASSOCIAÇÃO */}
          <FormularioSecao titulo="🏛️ Dados da associação">

            <Campo
              label="Data de associação"
              type="date"
              value={form.data_associacao}
              onChange={(v) => alterarCampo("data_associacao", v)}
            />

            <SelectCampo
              label="Tipo de associado"
              value={form.tipo_socio || "patrimonial_individual"}
              onChange={(v) => alterarCampo("tipo_socio", v)}
              opcoes={TIPOS_SOCIO.map((item) => item.value)}
              labels={Object.fromEntries(TIPOS_SOCIO.map((item) => [item.value, item.label]))}
            />

            <SelectCampo
              label="Situação"

              value={form.situacao || "ativo"}
              onChange={(v) => alterarCampo("situacao", v)}
              opcoes={[
                "ativo",
                "inativo",
                "suspenso",
              ]}
            />

            {Boolean(form.responsavel_id) ||
              String(form.tipo_socio || "").startsWith("dependente_") ? (
              <>
                <SelectCampo
                  label="Parentesco"
                  value={form.parentesco || "Filho(a)"}
                  onChange={(v) => alterarCampo("parentesco", v)}
                  opcoes={PARENTESCOS}
                />

                <SelectCampo
                  label="Responsável"
                  value={form.responsavel_id || ""}
                  onChange={(v) => alterarCampo("responsavel_id", v)}
                  opcoes={[
                    "",
                    ...socios
                      .filter((p) => p.id !== socioEditando?.id)
                      .map((p) => p.id),
                  ]}
                  labels={{
                    "": "Selecione o responsável",
                    ...Object.fromEntries(
                      socios
                        .filter((p) => p.id !== socioEditando?.id)
                        .map((p) => [p.id, p.nome])
                    ),
                  }}
                />
              </>
            ) : null}

            <div className="md:col-span-4 rounded-2xl border border-[#dfe9e3] bg-[#f7faf8] p-4">
              <div className="mb-4">
                <p className="text-sm font-extrabold text-[#003d2b]">
                  💰 Mensalidade
                </p>
                <p className="mt-1 text-xs text-[#718079]">
                  Cada associado ou dependente pode ter sua própria mensalidade.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <SelectCampo
                  label="Possui mensalidade?"
                  value={form.possui_mensalidade ? "sim" : "nao"}
                  onChange={(v) => alterarCampo("possui_mensalidade", v === "sim" ? "true" : "false")}
                  opcoes={["sim", "nao"]}
                  labels={{ sim: "Sim", nao: "Não" }}
                />

                {form.possui_mensalidade ? (
                  <>
                    <Campo
                      label="Valor mensal"
                      type="number"
                      value={form.valor_mensalidade}
                      onChange={(v) => alterarCampo("valor_mensalidade", v)}
                      placeholder="0,00"
                    />

                    <Campo
                      label="Dia do vencimento"
                      type="number"
                      value={form.dia_vencimento}
                      onChange={(v) => alterarCampo("dia_vencimento", v)}
                      placeholder="10"
                    />

                    <SelectCampo
                      label="Tipo de pagamento"
                      value={form.tipo_pagamento || "pix"}
                      onChange={(v) => alterarCampo("tipo_pagamento", v)}
                      opcoes={FORMAS_PAGAMENTO}
                      labels={{
                        pix: "PIX",
                        debito_em_conta: "Débito em conta",
                        boleto: "Boleto",
                        dinheiro: "Dinheiro",
                      }}
                    />

                    {form.tipo_pagamento === "debito_em_conta" && (
                      <div className="md:col-span-4 rounded-xl border border-[#f1d879] bg-[#fffbea] p-4">
                        <div className="mb-3">
                          <p className="text-sm font-extrabold text-[#705c00]">
                            🏦 Conta bancária do débito
                          </p>
                          <p className="mt-1 text-xs text-[#806f32]">
                            Selecione em qual conta bancária a mensalidade deste associado será debitada.
                          </p>
                        </div>

                        {contasBancarias.length > 0 ? (
                          <SelectCampo
                            label="Banco / conta"
                            value={form.conta_bancaria_id || ""}
                            onChange={(v) => alterarCampo("conta_bancaria_id", v)}
                            opcoes={["", ...contasBancarias.map((conta) => conta.id)]}
                            labels={{
                              "": "Selecione o banco / conta",
                              ...Object.fromEntries(
                                contasBancarias.map((conta) => [
                                  conta.id,
                                  `${conta.nome}${conta.banco ? ` · ${conta.banco}` : ""}${conta.conta ? ` · Conta ${conta.conta}` : ""}`,
                                ])
                              ),
                            }}
                          />
                        ) : (
                          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            Nenhuma conta bancária ativa cadastrada. Cadastre uma conta em Financeiro → Contas bancárias.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>

            {(form.tipo_socio === "temporada_individual" ||
              form.tipo_socio === "temporada_familiar" ||
              form.tipo_socio === "dependente_temporada_familiar") ? (
              <div className="md:col-span-4 rounded-2xl border border-[#f2bb91] bg-[#fff8f2] p-4">
                <p className="mb-4 text-sm font-extrabold text-[#b65308]">
                  🗓️ Período da temporada
                </p>

                <div className="grid gap-4 md:grid-cols-3">
                  <SelectCampo
                    label="Modalidade"
                    value={form.modalidade_temporada || "individual"}
                    onChange={(v) => alterarCampo("modalidade_temporada", v)}
                    opcoes={["individual", "familiar"]}
                    labels={{ individual: "Individual", familiar: "Familiar" }}
                  />

                  <Campo
                    label="Início"
                    type="date"
                    value={form.inicio_temporada}
                    onChange={(v) => alterarCampo("inicio_temporada", v)}
                  />

                  <Campo
                    label="Fim"
                    type="date"
                    value={form.fim_temporada}
                    onChange={(v) => alterarCampo("fim_temporada", v)}
                  />
                </div>
              </div>
            ) : null}

            <div className="md:col-span-3">

              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Observações
              </label>

              <textarea
                value={form.observacoes || ""}
                onChange={(e) =>
                  alterarCampo("observacoes", e.target.value)
                }
                rows={4}
                className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
                placeholder="Observações sobre o associado..."
              />

            </div>

          </FormularioSecao>

          {mensagem && (
            <div className="rounded-xl bg-[#e8f3ee] px-4 py-3 text-sm font-semibold text-[#005a3c]">
              {mensagem}
            </div>
          )}

        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-5">

          <button
            onClick={fechar}
            disabled={salvando}
            className="rounded-xl border border-[#d5e0da] px-5 py-3 font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>

          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded-xl bg-[#063b28] px-6 py-3 font-bold text-white shadow hover:bg-[#003d2b] disabled:opacity-50"
          >
            {salvando
              ? "Salvando..."
              : socioEditando
                ? "💾 Salvar alterações"
                : "💾 Cadastrar Sócio"}
          </button>

        </div>

      </div>

    </div>
  );
}


/* =========================
   COMPONENTES
========================= */

function FormularioSecao({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div>

      <h3 className="mb-4 border-b pb-3 text-lg font-bold text-[#005a3c]">
        {titulo}
      </h3>

      <div className="grid gap-4 md:grid-cols-4">
        {children}
      </div>

    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  obrigatorio = false,
  className = "",
}: {
  label: string;
  value?: string | number | null;
  onChange: (valor: string) => void;
  type?: string;
  placeholder?: string;
  obrigatorio?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>

      <label className="mb-2 block text-sm font-semibold text-gray-700">
        {label}

        {obrigatorio && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>

      <input
        type={type}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none transition focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
      />

    </div>
  );
}

function SelectCampo({
  label,
  value,
  onChange,
  opcoes,
  labels = {},
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  opcoes: string[];
  labels?: Record<string, string>;
}) {
  return (
    <div>

      <label className="mb-2 block text-sm font-semibold text-gray-700">
        {label}
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
      >

        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao}>
            {labels[opcao] || opcao}
          </option>
        ))}

      </select>

    </div>
  );
}

function DashboardCard({
  titulo,
  valor,
  descricao,
  icone,
}: {
  titulo: string;
  valor: string;
  descricao: string;
  icone: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">

      <div className="flex items-center justify-between">

        <span className="text-3xl">
          {icone}
        </span>

        <span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs font-semibold text-[#005a3c]">
          Ativo
        </span>

      </div>

      <p className="mt-5 text-sm font-medium text-gray-500">
        {titulo}
      </p>

      <p className="mt-1 text-3xl font-bold text-[#005a3c]">
        {valor}
      </p>

      <p className="mt-1 text-xs text-gray-500">
        {descricao}
      </p>

    </div>
  );
}

function RelatoriosFinanceiros({
  socios, mensalidades, competencia, setCompetencia, formaPagamento, setFormaPagamento, situacao, setSituacao, carregando,
}: {
  socios: Socio[]; mensalidades: Mensalidade[]; competencia: string; setCompetencia: (valor: string) => void;
  formaPagamento: string; setFormaPagamento: (valor: string) => void; situacao: string; setSituacao: (valor: string) => void; carregando: boolean;
}) {
  const formas: Record<string, string> = { pix: "PIX", debito_em_conta: "Débito em conta", boleto: "Boleto", dinheiro: "Dinheiro", transferencia: "Transferência", outro: "Outro" };
  const situacoes: Record<string, string> = { pago: "Pago", em_aberto: "Em aberto", em_atraso: "Em atraso", isento: "Isento" };
  const filtradas = mensalidades.filter((m) =>
    (formaPagamento === "todas" || (m.tipo_pagamento || "") === formaPagamento) &&
    (situacao === "todas" || (m.situacao || "") === situacao)
  );
  const soma = (lista: Mensalidade[]) => lista.reduce((s, m) => s + Number(m.valor || 0), 0);
  const total = soma(filtradas);
  const recebido = soma(filtradas.filter((m) => m.situacao === "pago"));
  const aberto = soma(filtradas.filter((m) => m.situacao === "em_aberto"));
  const atrasado = soma(filtradas.filter((m) => m.situacao === "em_atraso"));
  const isento = soma(filtradas.filter((m) => m.situacao === "isento"));
  const pagos = filtradas.filter((m) => m.situacao === "pago").length;
  const abertos = filtradas.filter((m) => m.situacao === "em_aberto").length;
  const atrasados = filtradas.filter((m) => m.situacao === "em_atraso").length;
  const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const dataBR = (v?: string | null) => v ? `${v.slice(8,10)}/${v.slice(5,7)}/${v.slice(0,4)}` : "—";
  const compBR = `${competencia.slice(5,7)}/${competencia.slice(0,4)}`;
  const porForma = Object.entries(formas).map(([codigo, label]) => {
    const itens = filtradas.filter((m) => m.tipo_pagamento === codigo);
    return { codigo, label, qtd: itens.length, valor: soma(itens) };
  }).filter((x) => x.qtd > 0);
  const inadimplentes = filtradas.filter((m) => m.situacao === "em_atraso").map((m) => ({ m, socio: socios.find((s) => s.id === m.socio_id) }));

  return (
    <div className="relatorio-area">
      <style jsx global>{`@media print { @page { size: A4 portrait; margin: 12mm; } body * { visibility: hidden !important; } .relatorio-area, .relatorio-area * { visibility: visible !important; } .relatorio-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: white !important; } .relatorio-controles, .relatorio-acoes { display: none !important; } .relatorio-area .shadow-sm { box-shadow: none !important; } }`}</style>
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-sm font-medium text-gray-500">Administração</p><h2 className="mt-1 text-3xl font-bold text-[#005a3c]">Relatórios Financeiros</h2><p className="mt-1 text-gray-500">Visão consolidada de cobranças e recebimentos.</p></div>
        <div className="relatorio-acoes"><button onClick={() => window.print()} className="rounded-xl border border-[#d5e0da] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] shadow-sm">🖨️ Imprimir / Salvar PDF</button></div>
      </div>
      <div className="relatorio-controles mb-6 grid gap-3 rounded-2xl border border-[#e2ebe6] bg-white p-4 shadow-sm md:grid-cols-3">
        <div><label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">Competência</label><input type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 font-semibold text-[#005a3c] outline-none" /></div>
        <div><label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">Forma de pagamento</label><select value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3"><option value="todas">Todas</option>{Object.entries(formas).map(([c,l]) => <option key={c} value={c}>{l}</option>)}</select></div>
        <div><label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">Situação</label><select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3"><option value="todas">Todas</option>{Object.entries(situacoes).map(([c,l]) => <option key={c} value={c}>{l}</option>)}</select></div>
      </div>
      {carregando ? <div className="rounded-2xl border border-[#e2ebe6] bg-white p-12 text-center text-gray-500 shadow-sm">Carregando relatório...</div> : <>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <ResumoFinanceiroGuarani titulo="Total lançado" valor={moeda(total)} /><ResumoFinanceiroGuarani titulo="Recebido" valor={moeda(recebido)} /><ResumoFinanceiroGuarani titulo="Em aberto" valor={moeda(aberto)} /><ResumoFinanceiroGuarani titulo="Em atraso" valor={moeda(atrasado)} /><ResumoFinanceiroGuarani titulo="Isento" valor={moeda(isento)} />
        </div>
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Mensalidades pagas</p><p className="mt-1 text-3xl font-bold text-[#005a3c]">{pagos}</p></div>
          <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Em aberto</p><p className="mt-1 text-3xl font-bold text-[#8a6700]">{abertos}</p></div>
          <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Inadimplentes</p><p className="mt-1 text-3xl font-bold text-red-600">{atrasados}</p></div>
        </div>
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm"><h3 className="font-bold text-[#003d2b]">Recebimentos por forma de pagamento</h3><div className="mt-4 space-y-3">{porForma.length === 0 ? <p className="text-sm text-gray-500">Nenhum pagamento encontrado.</p> : porForma.map((x) => <div key={x.codigo} className="flex items-center justify-between rounded-xl bg-[#f7faf8] px-4 py-3"><div><p className="font-semibold">{x.label}</p><p className="text-xs text-gray-500">{x.qtd} lançamento(s)</p></div><p className="font-bold text-[#005a3c]">{moeda(x.valor)}</p></div>)}</div></div>
          <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm"><h3 className="font-bold text-[#003d2b]">Resumo da competência {compBR}</h3><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between border-b pb-3"><span className="text-gray-500">Lançamentos</span><strong>{filtradas.length}</strong></div><div className="flex justify-between border-b pb-3"><span className="text-gray-500">Valor médio</span><strong>{moeda(filtradas.length ? total / filtradas.length : 0)}</strong></div><div className="flex justify-between border-b pb-3"><span className="text-gray-500">Taxa de recebimento</span><strong>{total ? `${((recebido / total) * 100).toFixed(1).replace(".", ",")}%` : "0,0%"}</strong></div><div className="flex justify-between"><span className="text-gray-500">Pessoas com mensalidade</span><strong>{socios.filter((s) => s.possui_mensalidade && s.situacao?.toLowerCase() !== "inativo").length}</strong></div></div></div>
        </div>
        <div className="mb-6 rounded-2xl border border-[#e2ebe6] bg-white shadow-sm"><div className="border-b px-5 py-4"><h3 className="font-bold text-[#003d2b]">Inadimplentes da competência</h3><p className="mt-1 text-sm text-gray-500">Mensalidades vencidas e ainda não pagas.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[720px]"><thead className="bg-[#e8f3ee]"><tr className="text-left text-xs uppercase tracking-wide text-gray-500"><th className="px-5 py-3">Associado</th><th className="px-5 py-3">Matrícula</th><th className="px-5 py-3">Vencimento</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3 text-right">Valor</th></tr></thead><tbody className="divide-y">{inadimplentes.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">Nenhum inadimplente encontrado.</td></tr> : inadimplentes.map(({m,socio}) => <tr key={m.id}><td className="px-5 py-3 font-semibold">{socio?.nome || "Associado não encontrado"}</td><td className="px-5 py-3">{socio?.matricula || "—"}</td><td className="px-5 py-3">{dataBR(m.data_vencimento)}</td><td className="px-5 py-3"><span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">Em atraso</span></td><td className="px-5 py-3 text-right font-bold text-red-600">{moeda(Number(m.valor || 0))}</td></tr>)}</tbody></table></div></div>
        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm"><h3 className="font-bold text-[#003d2b]">Detalhamento financeiro</h3><p className="mt-1 text-sm text-gray-500">Competência {compBR} · {filtradas.length} lançamento(s)</p><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px]"><thead className="bg-[#e8f3ee]"><tr className="text-left text-xs uppercase tracking-wide text-gray-500"><th className="px-5 py-3">Associado</th><th className="px-5 py-3">Vencimento</th><th className="px-5 py-3">Valor</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3">Pagamento</th></tr></thead><tbody className="divide-y">{filtradas.map((m) => { const socio = socios.find((s) => s.id === m.socio_id); return <tr key={m.id}><td className="px-5 py-3 font-semibold">{socio?.nome || "Associado não encontrado"}</td><td className="px-5 py-3">{dataBR(m.data_vencimento)}</td><td className="px-5 py-3 font-bold text-[#005a3c]">{moeda(Number(m.valor || 0))}</td><td className="px-5 py-3">{situacoes[m.situacao || ""] || "Não informado"}</td><td className="px-5 py-3 text-sm text-gray-600">{m.data_pagamento ? `${dataBR(m.data_pagamento)} · ${formas[m.tipo_pagamento || ""] || m.tipo_pagamento || "—"}` : "—"}</td></tr>; })}</tbody></table></div></div>
      </>}
    </div>
  );
}

function ModuloEmConstrucao({
  nome,
  icone,
}: {
  nome: string;
  icone: string;
}) {
  return (
    <div className="flex min-h-[500px] items-center justify-center">

      <div className="rounded-2xl bg-white p-10 text-center shadow-sm">

        <div className="text-5xl">
          {icone}
        </div>

        <h2 className="mt-4 text-2xl font-bold text-[#005a3c]">
          {nome}
        </h2>

        <p className="mt-2 text-gray-500">
          Este módulo será configurado na próxima etapa.
        </p>

      </div>

    </div>
  );
}
