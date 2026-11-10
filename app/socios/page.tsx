"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import { dependenteTemMensalidade, tipoDependenteComMensalidade, tipoDependenteSemMensalidade } from "@/lib/regrasMensalidade";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Socio = {
  id: string;
  matricula: string | number | null;
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
  exame_medico_validade: string | null;
  categoria: string | null;
  situacao: string | null;
  observacoes: string | null;
  foto_url: string | null;

  tipo_socio: string | null;
  responsavel_id: string | null;
  parentesco: string | null;
  possui_mensalidade: boolean | null;
  /** Indicador não financeiro usado para filtrar a lista sem expor a cobrança. */
  exibir_na_lista_socios?: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
  conta_bancaria_id: string | null;
  modalidade_temporada: string | null;
  inicio_temporada: string | null;
  fim_temporada: string | null;
  situacao_financeira: string | null;
  data_ultimo_pagamento: string | null;
  financeiro_status?: string | null;
  meses_atraso?: number | null;
  /** Condição de remissão por tempo de associação; não é um tipo de sócio. */
  remido?: boolean | null;
};

/** Normaliza os valores legados de tipo/categoria para que filtros não dependam
 *  de maiúsculas, acentos, espaços extras ou variações como "Sócio Remido". */
function normalizarTipoParaFiltro(valor?: string | null): string {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Normaliza consultas de busca para aceitar texto com ou sem acentos. */
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

function socioEhRemido(socio: Pick<Socio, "tipo_socio" | "categoria" | "remido">): boolean {
  return (
    socio.remido === true ||
    normalizarTipoParaFiltro(socio.tipo_socio).includes("remido") ||
    normalizarTipoParaFiltro(socio.categoria).includes("remido")
  );
}

function socioDeveAparecerNaLista(socio: Pick<Socio, "matricula" | "exibir_na_lista_socios" | "possui_mensalidade" | "responsavel_id" | "tipo_socio" | "categoria" | "remido">): boolean {
  const matricula = String(socio.matricula ?? "").trim().toUpperCase();
  // A matrícula A sempre pertence à lista Sócios, mesmo quando o tipo legado
  // contém a palavra dependente. A matrícula B permanece na lista Dependentes.
  if (/A$/.test(matricula)) return true;
  if (/B$/.test(matricula)) return false;

  const tipo = normalizarTipoParaFiltro(socio.tipo_socio);
  const categoria = normalizarTipoParaFiltro(socio.categoria);
  const ehDependente = Boolean(socio.responsavel_id) || tipo.startsWith("dependente_") || categoria.includes("dependente");

  // A lista Sócios deve continuar mostrando os titulares, inclusive remidos
  // e cadastros sem cobrança própria. A elegibilidade de mensalidade não pode
  // esconder o cadastro principal. Somente dependentes sem cobrança própria
  // ficam na área específica de Dependentes/Famílias.
  if (!ehDependente) return true;

  // Para dependentes, o tipo explícito *_mensalidade é a fonte de verdade.
  // Não usamos o possui_mensalidade legado, que pode estar desatualizado.
  return dependenteTemMensalidade(socio);
}

const socioInicial: Partial<Socio> = {
  matricula: "",
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
  exame_medico_validade: "",
  categoria: "Titular",
  situacao: "ativo",
  observacoes: "",
  foto_url: "",

  tipo_socio: "patrimonial_individual",
  remido: false,
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
  { value: "patrimonial", label: "Sócio Patrimonial (tipo individual/familiar a confirmar)" },
  { value: "dependente_patrimonial_familiar", label: "Dependente Patrimonial Familiar (sem mensalidade)" },
  { value: "dependente_patrimonial_individual", label: "Dependente Patrimonial Individual (sem mensalidade)" },
  { value: "dependente_contribuinte_familiar", label: "Dependente Contribuinte Familiar (sem mensalidade)" },
  { value: "dependente_contribuinte_individual", label: "Dependente Contribuinte Individual (sem mensalidade)" },
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
  { value: "patrimonial", label: "Sócio Patrimonial" },
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
    "patrimonial",
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
    case "dependente_patrimonial_familiar":
    case "dependente_patrimonial_familiar_mensalidade":
      return "dependente_patrimonial_familiar";
    case "patrimonial_individual":
    case "dependente_patrimonial_individual":
    case "dependente_patrimonial_individual_mensalidade":
      return "dependente_patrimonial_individual";
    case "contribuinte_familiar":
    case "dependente_contribuinte_familiar":
    case "dependente_contribuinte_familiar_mensalidade":
      return "dependente_contribuinte_familiar";
    case "contribuinte_individual":
    case "dependente_contribuinte_individual":
    case "dependente_contribuinte_individual_mensalidade":
      return "dependente_contribuinte_individual";
    case "temporada_familiar":
      return "dependente_patrimonial_familiar";
    case "transitorio":
      return "dependente_transitorio";
    default:
      return "dependente_patrimonial_familiar";
  }
}

function tipoSocioLabel(tipo?: string | null) {
  // Compatibilidade com a base antiga: "remido" era usado como tipo,
  // mas o tipo correto é patrimonial e a remissão é uma condição separada.
  const tipoExibido = normalizarTipoParaFiltro(tipo) === "remido" ? "patrimonial" : tipo;
  return TIPOS_SOCIO.find((x) => x.value === tipoExibido)?.label || tipoExibido || "Não informado";
}

function tipoSocioClasse(tipo?: string | null) {
  switch (normalizarTipoParaFiltro(tipo)) {
    case "patrimonial":
    case "remido":
      return "bg-[#dceee6] text-[#003d2b] ring-1 ring-[#9fcdb9]";
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
  const [verificandoLogin, setVerificandoLogin] = useState(true);
  const [usuarioEmail, setUsuarioEmail] = useState("");

  const [socios, setSocios] = useState<Socio[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroTipoSocio, setFiltroTipoSocio] = useState<string[]>([]);
  const [filtroRemissao, setFiltroRemissao] = useState("todas");
  const [filtroSituacaoSocio, setFiltroSituacaoSocio] = useState("todas");
  const [buscaResponsavel, setBuscaResponsavel] = useState("");
  const [abrirCadastro, setAbrirCadastro] = useState(false);
  const [socioEditando, setSocioEditando] = useState<Socio | null>(null);

  const [form, setForm] = useState<Partial<Socio>>(socioInicial);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);
  const [mostrarSomenteDependentes, setMostrarSomenteDependentes] = useState(false);
  const [perfilUsuario, setPerfilUsuario] = useState("");
  const [camposVisiveis, setCamposVisiveis] = useState({ financeiro: true, exameMedico: true });
  const somenteConsulta = perfilUsuario === "funcionario" || !camposVisiveis.financeiro;

  useEffect(() => {
    const agendamento = window.setTimeout(() => {
      try {
        const perfil = (window.localStorage.getItem("guarani_usuario_perfil") || "").trim().toLowerCase();
        setPerfilUsuario(
          perfil === "funcionario" ? "funcionario" :
          perfil === "master" ? "administrador_master" :
          perfil === "admin" || perfil === "administrador" ? "administrador_normal" :
          perfil
        );
      } catch {}
    }, 0);
    return () => window.clearTimeout(agendamento);
  }, []);

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

  const carregarContasBancarias = useCallback(async () => {
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
  }, []);

  const carregarSocios = useCallback(async () => {
    setCarregando(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        window.location.replace("/login");
        return;
      }

      const response = await fetch("/api/socios", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Erro ao carregar os sócios.");
      const sociosRecebidos = (payload?.socios || []) as Socio[];
      setCamposVisiveis({
        financeiro: payload?.camposVisiveis?.financeiro !== false,
        exameMedico: payload?.camposVisiveis?.exameMedico !== false,
      });
      setSocios(sociosRecebidos.map((socio) => {
        const remido = socioEhRemido(socio);
        const tipoLegadoRemido = normalizarTipoParaFiltro(socio.tipo_socio) === "remido";
        const matricula = String(socio.matricula ?? "").trim().toUpperCase();
        const terminaA = /A$/.test(matricula);
        const terminaB = /B$/.test(matricula);
        const ehDependente = Boolean(socio.responsavel_id);
        // A matrícula A é um associado pagador próprio, mesmo que mantenha
        // vínculo familiar com outro responsável. B nunca recebe cobrança própria.
        const dependentePaga = terminaA || (!terminaB && ehDependente && dependenteTemMensalidade(socio));
        const tipoDependente = ehDependente
          ? (dependentePaga
              ? tipoDependenteComMensalidade(socio.tipo_socio || "dependente_patrimonial_familiar")
              : tipoDependenteSemMensalidade(socio.tipo_socio || "dependente_patrimonial_familiar"))
          : socio.tipo_socio;
        return {
          ...socio,
          remido,
          ...(ehDependente ? {
            categoria: dependentePaga ? "Dependente com Mensalidade" : "Dependente",
            possui_mensalidade: dependentePaga,
            // Preserva valor configurado em A; B fica sem valor de cobrança própria.
            valor_mensalidade: terminaB ? 0 : (dependentePaga ? Number(socio.valor_mensalidade || 0) : 0),
          } : (terminaA ? { possui_mensalidade: true } : {})),
          ...(terminaB ? { possui_mensalidade: false, valor_mensalidade: 0 } : {}),
          // Quando o tipo legado era apenas "remido", mostramos Patrimonial genérico
          // até que o cadastro familiar/individual seja confirmado.
          tipo_socio: tipoLegadoRemido
            ? (ehDependente ? tipoDependente : "patrimonial")
            : (ehDependente ? tipoDependente : socio.tipo_socio),
        };
      }));
    } catch (error) {
      console.error(error);
      setMensagem(error instanceof Error ? error.message : "Erro ao carregar os sócios.");
    }

    setCarregando(false);
  }, []);

  useEffect(() => {
    const agendamento = window.setTimeout(() => {
      void carregarSocios();
      void carregarContasBancarias();
    }, 0);
    return () => window.clearTimeout(agendamento);
  }, [carregarSocios, carregarContasBancarias]);

  function novoSocio() {
    if (somenteConsulta) return;
    setSocioEditando(null);
    setBuscaResponsavel("");
    setForm({
      ...socioInicial,
      data_associacao: new Date().toISOString().split("T")[0],
    });
    setFotoArquivo(null);
    setAbrirCadastro(true);
    setMensagem("");
  }

  function novoDependente(responsavel: Socio) {
    if (somenteConsulta) return;
    if (!podeTerDependentes(responsavel.tipo_socio)) {
      setMensagem("Este tipo de sócio não possui dependentes.");
      return;
    }

    setSocioEditando(null);
    setBuscaResponsavel(responsavel.nome);
    setForm({
      ...socioInicial,
      tipo_socio: tipoDependenteParaResponsavel(responsavel.tipo_socio),
      categoria: "Dependente",
      responsavel_id: responsavel.id,
      parentesco: "Filho(a)",
      // Novo dependente começa sem mensalidade. Se passar a pagar,
      // o cadastro pode ser alterado para mensalidade = SIM e então
      // ele aparecerá automaticamente na guia Sócios.
      possui_mensalidade: false,
      valor_mensalidade: 0,
      data_associacao: new Date().toISOString().split("T")[0],
    });
    setFotoArquivo(null);
    setAbrirCadastro(true);
    setMensagem("");
  }

  function editarSocio(socio: Socio) {
    if (somenteConsulta) return;
    setSocioEditando(socio);
    setBuscaResponsavel(socio.responsavel_id ? (socios.find((p) => p.id === socio.responsavel_id)?.nome || "") : "");
    setForm({ ...socio, situacao: socio.situacao?.toLowerCase() || "ativo" });
    setFotoArquivo(null);
    setAbrirCadastro(true);
    setMensagem("");
  }

  function fecharCadastro() {
    if (!salvando) {
      setAbrirCadastro(false);
      setSocioEditando(null);
      setBuscaResponsavel("");
    }
  }

  function alterarCampo(campo: keyof Socio, valor: string) {
    setForm((atual) => {
      const proximo = {
        ...atual,
        [campo]: campo === "possui_mensalidade" || campo === "remido" ? valor === "true" : valor,
      };

      if (campo === "remido") {
        if (proximo.remido) {
          proximo.possui_mensalidade = false;
          proximo.valor_mensalidade = 0;
          proximo.situacao_financeira = "isento";
          proximo.categoria = proximo.categoria || "Titular";
        }
      }

      if (campo === "responsavel_id" && valor.trim()) {
        proximo.categoria = proximo.possui_mensalidade
          ? "Dependente com Mensalidade"
          : "Dependente";
        proximo.tipo_socio = proximo.possui_mensalidade
          ? tipoDependenteComMensalidade(String(proximo.tipo_socio || "dependente_patrimonial_familiar"))
          : tipoDependenteSemMensalidade(String(proximo.tipo_socio || "dependente_patrimonial_familiar"));
      }

      if (campo === "possui_mensalidade" && proximo.responsavel_id) {
        if (proximo.possui_mensalidade) {
          proximo.tipo_socio = tipoDependenteComMensalidade(String(proximo.tipo_socio || "dependente_patrimonial_familiar"));
          proximo.categoria = "Dependente com Mensalidade";
          if (proximo.situacao_financeira === "isento") proximo.situacao_financeira = "em_dia";
        } else {
          proximo.tipo_socio = tipoDependenteSemMensalidade(String(proximo.tipo_socio || "dependente_patrimonial_familiar"));
          proximo.categoria = "Dependente";
          proximo.valor_mensalidade = 0;
          proximo.situacao_financeira = "isento";
        }
      }

      if (campo === "tipo_socio") {
        const tipo = valor;
        const tipoEhDependente = tipo.startsWith("dependente_");
        const mensalidadeObrigatoria = tipoEhDependente && tipo.endsWith("_mensalidade");

        if (tipoEhDependente) {
          proximo.possui_mensalidade = mensalidadeObrigatoria;
          proximo.categoria = mensalidadeObrigatoria
            ? "Dependente com Mensalidade"
            : "Dependente";
          if (!mensalidadeObrigatoria) {
            proximo.valor_mensalidade = 0;
            proximo.situacao_financeira = "isento";
          } else if (proximo.situacao_financeira === "isento") {
            proximo.situacao_financeira = "em_dia";
          }
        } else if (tipo === "remido") {
          proximo.possui_mensalidade = false;
          proximo.valor_mensalidade = 0;
          proximo.situacao_financeira = "isento";
        }

        if (!tipoEhDependente) {
          proximo.responsavel_id = null;
          proximo.parentesco = "";
          if (String(proximo.categoria || "").toLowerCase().includes("dependente")) {
            proximo.categoria = "Titular";
          }
        }
      }

      return proximo;
    });
  }

  async function salvarSocio(dependenteIds: string[] = [], quantidadeDependentes = dependenteIds.length) {
    if (!form.nome?.trim()) {
      setMensagem("Informe o nome completo do sócio.");
      return;
    }

    const matriculaDigitada = String(form.matricula ?? "").trim().toUpperCase();
    const tipoEhDependente = Boolean(form.responsavel_id);
    if (!matriculaDigitada && !tipoEhDependente) {
      setMensagem("Informe a matrícula do associado. Exemplo: SC0001A.");
      return;
    }

    setSalvando(true);
    setMensagem("");

    const dadosBase = {
      ...(matriculaDigitada ? { matricula: matriculaDigitada } : {}),
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
      exame_medico_validade: form.exame_medico_validade || null,
      categoria: form.categoria || "Titular",
      situacao: form.situacao || "ativo",
      observacoes: form.observacoes || null,

      tipo_socio: form.tipo_socio || "patrimonial_individual",
      remido: Boolean(form.remido),
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

    let cadastroPrincipalSalvo = false;
    try {
      if (matriculaDigitada) {
        let consultaMatricula = supabase
          .from("socios")
          .select("id")
          .ilike("matricula", matriculaDigitada)
          .limit(1);
        if (socioEditando?.id) {
          consultaMatricula = consultaMatricula.neq("id", socioEditando.id);
        }
        const { data: matriculaExistente, error: erroConsultaMatricula } = await consultaMatricula.maybeSingle();

        if (erroConsultaMatricula) throw erroConsultaMatricula;
        if (matriculaExistente) {
          setMensagem("Esta matrícula já está cadastrada. Informe uma matrícula diferente.");
          return;
        }
      }

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
        cadastroPrincipalSalvo = true;

        // Sincroniza os lançamentos ainda não pagos somente quando os dados
        // financeiros realmente mudaram. Alterar exame, telefone ou endereço
        // não deve disparar centenas de atualizações de mensalidades.
        const dadosFinanceirosAlterados =
          Number(form.valor_mensalidade || 0) !== Number(socioEditando.valor_mensalidade || 0) ||
          Boolean(form.possui_mensalidade) !== Boolean(socioEditando.possui_mensalidade) ||
          Number(form.dia_vencimento || 10) !== Number(socioEditando.dia_vencimento || 10) ||
          (form.tipo_pagamento || "pix") !== (socioEditando.tipo_pagamento || "pix") ||
          (form.conta_bancaria_id || null) !== (socioEditando.conta_bancaria_id || null) ||
          (form.situacao_financeira || "isento") !== (socioEditando.situacao_financeira || "isento") ||
          (form.tipo_socio || "") !== (socioEditando.tipo_socio || "") ||
          Boolean(form.remido) !== Boolean(socioEditando.remido) ||
          (form.responsavel_id || null) !== (socioEditando.responsavel_id || null);

        // Mantém a regra financeira existente, mas não recalcula títulos em
        // uma edição que alterou somente o exame médico.

        // Atualiza a base e recalcula o total mantendo tarifas, multa, juros e desconto
        // já registrados. Mensalidades pagas e canceladas ficam intactas.
        if (form.possui_mensalidade && dadosFinanceirosAlterados) {
          const valorAtualizado = Number(form.valor_mensalidade || 0);
          const { data: lancamentosAbertos, error: erroConsultaMensalidades } = await supabase
            .from("mensalidades")
            .select("id, tarifa_pagamento, multa, juros, desconto")
            .eq("socio_id", socioEditando.id)
            .in("situacao", ["em_aberto", "em_atraso"]);

          if (erroConsultaMensalidades) throw erroConsultaMensalidades;

          for (const lancamento of lancamentosAbertos || []) {
            const tarifa = Number(lancamento.tarifa_pagamento || 0);
            const multa = Number(lancamento.multa || 0);
            const juros = Number(lancamento.juros || 0);
            const desconto = Number(lancamento.desconto || 0);
            const totalAtualizado = Math.max(0, valorAtualizado + tarifa + multa + juros - desconto);
            const { error: erroAtualizacaoMensalidade } = await supabase
              .from("mensalidades")
              .update({
                valor: valorAtualizado,
                valor_base: valorAtualizado,
                total_cobrado: totalAtualizado,
              })
              .eq("id", lancamento.id)
              .in("situacao", ["em_aberto", "em_atraso"]);

            if (erroAtualizacaoMensalidade) throw erroAtualizacaoMensalidade;
          }
        }
      } else {
        const resultado = await supabase
          .from("socios")
          .insert(dadosBase)
          .select("id")
          .single();

        if (resultado.error) throw resultado.error;
        socioId = resultado.data.id;
        cadastroPrincipalSalvo = true;
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

      // A atualização dos dependentes é feita dentro do mesmo fluxo do botão
      // principal, depois de salvar o titular. Assim, a seleção não depende de
      // um segundo clique nem fica concorrendo com o salvamento do cadastro.
      let dependentesAtualizados = 0;
      if (socioEditando && dependenteIds.length > 0) {
        const { data: sessao, error: erroSessao } = await supabase.auth.getSession();
        if (erroSessao) throw erroSessao;
        const token = sessao.session?.access_token;
        const respostaExames = await fetch("/api/socios/exame-familia", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            titular_id: socioEditando.id,
            validade: form.exame_medico_validade || null,
            dependente_ids: dependenteIds,
            quantidade_pessoas: quantidadeDependentes,
          }),
        });
        const resultadoExames = await respostaExames.json().catch(() => ({}));
        if (!respostaExames.ok) {
          throw new Error(`Cadastro salvo, mas os exames dos dependentes não foram atualizados: ${resultadoExames.error || "falha na API"}`);
        }
        const registrosAtualizados = Number(resultadoExames.registros_atualizados ?? resultadoExames.dependentes_atualizados ?? 0);
        if (registrosAtualizados !== dependenteIds.length) {
          throw new Error(`Cadastro salvo, mas somente ${registrosAtualizados} de ${dependenteIds.length} registro(s) de dependentes tiveram a atualização confirmada.`);
        }
        dependentesAtualizados = Number(resultadoExames.pessoas_atualizadas ?? quantidadeDependentes);
      }

      setMensagem(
        socioEditando
          ? dependentesAtualizados > 0
            ? `Sócio e exame médico de ${dependentesAtualizados} dependente(s) atualizados com sucesso!`
            : "Sócio atualizado com sucesso!"
          : "Sócio cadastrado com sucesso!"
      );

      setFotoArquivo(null);
      // Não prende o salvamento aguardando recarregar a lista completa de sócios.
      // A atualização da listagem ocorre em segundo plano após a gravação.
      void carregarSocios();

      setTimeout(() => {
        setAbrirCadastro(false);
        setSocioEditando(null);
        setMensagem("");
      }, 900);
    } catch (error) {
      console.error(error);
      const detalhe = error instanceof Error ? error.message : "Erro desconhecido.";
      setMensagem(
        cadastroPrincipalSalvo
          ? detalhe
          : `Não foi possível salvar. ${detalhe}`
      );
      if (cadastroPrincipalSalvo) void carregarSocios();
    } finally {
      setSalvando(false);
    }
  }

  async function excluirSocio(socio: Socio) {
    if (somenteConsulta) return;
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
    const termo = normalizarBusca(busca);
    const termoCompacto = compactarBusca(busca);
    const tiposSelecionados = filtroTipoSocio.map(normalizarTipoParaFiltro);

    return socios.filter((socio) => {
      const remido = socioEhRemido(socio);
      // A tela Sócios inclui quem possui mensalidade e os titulares patrimoniais remidos.
      // Dependentes sem mensalidade permanecem na tela Dependentes/Famílias.
      if (!socioDeveAparecerNaLista(socio)) return false;

      const termoNome = normalizarBusca(socio.nome);
      const termoCpf = normalizarBusca(socio.cpf);
      const termoMatricula = normalizarBusca(socio.matricula);
      const cpfCompacto = compactarBusca(socio.cpf);
      const matriculaCompacta = compactarBusca(socio.matricula);
      const correspondeBusca =
        !termo ||
        termoNome.includes(termo) ||
        termoCpf.includes(termo) ||
        termoMatricula.includes(termo) ||
        (termoCompacto.length > 0 &&
          (cpfCompacto.includes(termoCompacto) || matriculaCompacta.includes(termoCompacto)));

      let tipoSocioNormalizado = normalizarTipoParaFiltro(socio.tipo_socio);
      if (tipoSocioNormalizado === "remido") tipoSocioNormalizado = socio.responsavel_id
        ? "dependente_patrimonial_familiar_mensalidade"
        : "patrimonial";
      const correspondeTipoDependente =
        !mostrarSomenteDependentes || Boolean(socio.responsavel_id) || tipoSocioNormalizado.startsWith("dependente_");
      const correspondeTipoSocio = tiposSelecionados.length === 0 || tiposSelecionados.some((tipoSelecionado) => {
        // Este filtro identifica somente o tipo patrimonial genérico legado,
        // quando a origem não permite afirmar se é individual ou familiar.
        return tipoSelecionado === tipoSocioNormalizado;
      });
      const correspondeRemissao =
        filtroRemissao === "todas" ||
        (filtroRemissao === "remidos" && remido) ||
        (filtroRemissao === "nao_remidos" && !remido);
      const situacao = normalizarTipoParaFiltro(socio.situacao || "ativo");
      const correspondeSituacao =
        filtroSituacaoSocio === "todas" || situacao === normalizarTipoParaFiltro(filtroSituacaoSocio);

      return correspondeBusca && correspondeTipoDependente && correspondeTipoSocio && correspondeRemissao && correspondeSituacao;
    });
  }, [socios, busca, mostrarSomenteDependentes, filtroTipoSocio, filtroRemissao, filtroSituacaoSocio]);

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
              <Image
                src="/logo-guarani.png"
                alt="Sociedade Guarani"
                width={48}
                height={48}
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

        {/* MENU LATERAL PADRÃO DO SISTEMA */}
        <MenuLateralPadrao />

        {/* CONTEÚDO */}
        <section className="ml-0 min-w-0 flex-1 bg-[#f8faf9] p-5 sm:p-7 lg:ml-[220px] lg:p-8">

          {/* SÓCIOS */}
          <Socios
              socios={sociosFiltrados}
              sociosCompletos={socios}
              quantidadeTotal={socios.filter(socioDeveAparecerNaLista).length}
              busca={busca}
              setBusca={setBusca}
              filtroTipoSocio={filtroTipoSocio}
              setFiltroTipoSocio={setFiltroTipoSocio}
              filtroRemissao={filtroRemissao}
              setFiltroRemissao={setFiltroRemissao}
              filtroSituacaoSocio={filtroSituacaoSocio}
              setFiltroSituacaoSocio={setFiltroSituacaoSocio}
              novoSocio={novoSocio}
              novoDependente={novoDependente}
              editarSocio={editarSocio}
              excluirSocio={excluirSocio}
              carregando={carregando}
              mostrarSomenteDependentes={mostrarSomenteDependentes}
              somenteConsulta={somenteConsulta}
              camposVisiveis={camposVisiveis}
              setMostrarSomenteDependentes={setMostrarSomenteDependentes}
          />

        </section>
      </div>

      {/* MODAL CADASTRO */}
      {abrirCadastro && (
        <ModalSocio
          socios={socios}
          contasBancarias={contasBancarias}
          form={form}
          socioEditando={socioEditando}
          buscaResponsavel={buscaResponsavel}
          setBuscaResponsavel={setBuscaResponsavel}
          salvando={salvando}
          mensagem={mensagem}
          setMensagem={setMensagem}
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


function Socios({
  socios,
  sociosCompletos,
  quantidadeTotal,
  busca,
  setBusca,
  filtroTipoSocio,
  setFiltroTipoSocio,
  filtroRemissao,
  setFiltroRemissao,
  filtroSituacaoSocio,
  setFiltroSituacaoSocio,
  novoSocio,
  novoDependente,
  editarSocio,
  excluirSocio,
  carregando,
  mostrarSomenteDependentes,
  somenteConsulta,
  camposVisiveis,
}: {
  socios: Socio[];
  sociosCompletos: Socio[];
  quantidadeTotal: number;
  busca: string;
  setBusca: (valor: string) => void;
  filtroTipoSocio: string[];
  setFiltroTipoSocio: Dispatch<SetStateAction<string[]>>;
  filtroRemissao: string;
  setFiltroRemissao: (valor: string) => void;
  filtroSituacaoSocio: string;
  setFiltroSituacaoSocio: (valor: string) => void;
  novoSocio: () => void;
  novoDependente: (responsavel: Socio) => void;
  editarSocio: (socio: Socio) => void;
  excluirSocio: (socio: Socio) => void;
  carregando: boolean;
  mostrarSomenteDependentes: boolean;
  setMostrarSomenteDependentes: (valor: boolean) => void;
  somenteConsulta: boolean;
  camposVisiveis: { financeiro: boolean; exameMedico: boolean };
}) {
  const tamanhoPaginaSocios = 50;
  const [paginaSocios, setPaginaSocios] = useState(1);
  const totalPaginasSocios = Math.max(1, Math.ceil(socios.length / tamanhoPaginaSocios));
  const sociosPagina = useMemo(() => {
    const inicio = (paginaSocios - 1) * tamanhoPaginaSocios;
    return socios.slice(inicio, inicio + tamanhoPaginaSocios);
  }, [socios, paginaSocios]);

  const filtrosRelatorio = [
    busca.trim() ? `Busca: ${busca.trim()}` : null,
    filtroTipoSocio.length
      ? `Tipos: ${filtroTipoSocio.map((tipo) => TIPOS_SOCIO.find((item) => item.value === tipo)?.label || tipo).join(", ")}`
      : null,
    filtroRemissao === "remidos" ? "Remissão: somente remidos" : filtroRemissao === "nao_remidos" ? "Remissão: não remidos" : null,
    filtroSituacaoSocio !== "todas" ? `Situação: ${filtroSituacaoSocio}` : null,
    mostrarSomenteDependentes ? "Visualização: dependentes" : null,
  ].filter(Boolean).join(" · ") || "Todos os registros que atendem aos critérios padrão da lista.";

  const totalAtivosRelatorio = socios.filter((s) => (s.situacao || "ativo").toLowerCase() === "ativo").length;
  const dataEmissaoRelatorio = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return (
    <div>
      <style jsx global>{`
        .relatorio-socios-print { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 9mm; }
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .relatorio-socios-print, .relatorio-socios-print * { visibility: visible !important; }
          .relatorio-socios-print {
            display: block !important; position: absolute !important; left: 0 !important; top: 0 !important;
            width: 100% !important; margin: 0 !important; padding: 0 !important;
            color: #17211d !important; background: #fff !important;
            font-family: Arial, Helvetica, sans-serif !important; font-size: 8.3pt !important; line-height: 1.22 !important;
          }
          .relatorio-socios-print .print-socios-titulo { color: #064b36 !important; font-size: 18pt !important; font-weight: 800 !important; margin: 0 0 2mm !important; }
          .relatorio-socios-print .print-socios-subtitulo { color: #4b5b54 !important; font-size: 9pt !important; margin: 0 0 1mm !important; }
          .relatorio-socios-print .print-socios-resumo { display: flex !important; justify-content: space-between !important; gap: 5mm !important; border: 1px solid #cbd8d1 !important; border-radius: 2mm !important; padding: 2.5mm !important; margin: 3mm 0 !important; }
          .relatorio-socios-print table { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; }
          .relatorio-socios-print thead { display: table-header-group !important; }
          .relatorio-socios-print tr { break-inside: avoid !important; page-break-inside: avoid !important; }
          .relatorio-socios-print th { color: #103d2c !important; background: #e8f3ee !important; font-size: 7.2pt !important; font-weight: 700 !important; text-align: left !important; }
          .relatorio-socios-print th, .relatorio-socios-print td { border: 1px solid #cbd8d1 !important; padding: 1.25mm 1.3mm !important; vertical-align: top !important; overflow-wrap: anywhere !important; word-break: normal !important; }
          .relatorio-socios-print .print-socios-rodape { border-top: 1px solid #cbd8d1 !important; margin-top: 3mm !important; padding-top: 2mm !important; color: #5c6a63 !important; font-size: 8pt !important; }
          .relatorio-socios-print .print-socios-status { font-weight: 700 !important; white-space: nowrap !important; }
        }
      `}</style>

      <section className="relatorio-socios-print" aria-label="Relatório de sócios para impressão">
        <header style={{ borderBottom: "2px solid #07563d", paddingBottom: "3mm" }}>
          <p style={{ margin: 0, fontSize: "9pt", fontWeight: 700, letterSpacing: ".06em", color: "#07563d" }}>SOCIEDADE RECREATIVA GUARANI — S.R.G.</p>
          <h1 className="print-socios-titulo">Relatório de Sócios</h1>
          <p className="print-socios-subtitulo">Lista de associados · Emitido em {dataEmissaoRelatorio}</p>
          <p className="print-socios-subtitulo">Filtros aplicados: {filtrosRelatorio}</p>
        </header>

        <div className="print-socios-resumo">
          <span><strong>Registros listados:</strong> {socios.length}</span>
          <span><strong>Ativos:</strong> {totalAtivosRelatorio}</span>
          <span><strong>Inativos/suspensos:</strong> {socios.length - totalAtivosRelatorio}</span>
        </div>

        <table>
          <colgroup>
            <col style={{ width: "5%" }} /><col style={{ width: "9%" }} /><col style={{ width: "21%" }} /><col style={{ width: "13%" }} />
            <col style={{ width: "14%" }} /><col style={{ width: "19%" }} /><col style={{ width: "12%" }} /><col style={{ width: "7%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Nº</th><th>Matrícula</th><th>Nome</th><th>CPF</th><th>Telefone / WhatsApp</th><th>Tipo de associado</th><th>Responsável</th><th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {socios.map((socio, index) => (
              <tr key={socio.id}>
                <td>{index + 1}</td><td>{socio.matricula || "—"}</td>
                <td><strong>{socio.nome || "Não informado"}</strong>{socioEhRemido(socio) ? " · Remido" : ""}</td>
                <td>{socio.cpf || "—"}</td>
                <td>{socio.whatsapp || socio.telefone || "—"}</td>
                <td>{tipoSocioLabel(socio.tipo_socio)}</td>
                <td>{socio.responsavel_id ? sociosCompletos.find((p) => p.id === socio.responsavel_id)?.nome || "Responsável não localizado" : "—"}</td>
                <td className="print-socios-status">{(socio.situacao || "ativo").toLowerCase() === "ativo" ? "Ativo" : (socio.situacao || "Inativo").toLowerCase() === "suspenso" ? "Suspenso" : "Inativo"}</td>
              </tr>
            ))}
            {socios.length === 0 && <tr><td colSpan={8}>Nenhum sócio corresponde aos filtros selecionados.</td></tr>}
          </tbody>
        </table>

        <footer className="print-socios-rodape">Relatório interno da Sociedade Recreativa Guarani · Documento gerado a partir dos filtros exibidos na lista de sócios.</footer>
      </section>

      <div className="mb-5 flex flex-col justify-between gap-3 sm:mb-6 sm:flex-row sm:items-center">

        <div>
          <p className="text-sm font-medium text-gray-500">
            Administração
          </p>

          <h2 className="mt-1 text-2xl font-bold text-[#005a3c] sm:text-3xl">
            Sócios
          </h2>

          <p className="mt-1 text-gray-500">
            Cadastro e gerenciamento dos associados.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => window.print()}
            className="w-full rounded-xl border border-[#c9d9d1] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] shadow-sm transition hover:bg-[#f0f7f3] sm:w-auto"
          >
            🖨️ Imprimir relatório
          </button>
          {!somenteConsulta && (
            <button
              onClick={novoSocio}
              className="w-full rounded-xl bg-[#063b28] px-4 py-3 text-sm font-bold text-white shadow transition hover:bg-[#003d2b] sm:w-auto sm:px-5"
            >
              + Novo Sócio
            </button>
          )}
        </div>

      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:mb-6 sm:grid-cols-3 sm:gap-4">

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-4 shadow-sm sm:p-5">
          <p className="text-sm text-gray-500">
            Total de sócios
          </p>

          <p className="mt-1 text-2xl font-bold text-[#005a3c] sm:text-3xl">
            {quantidadeTotal}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-4 shadow-sm sm:p-5">
          <p className="text-sm text-gray-500">
            Sócios ativos
          </p>

          <p className="mt-1 text-2xl font-bold text-[#005a3c] sm:text-3xl">
            {socios.filter((s) => String(s.situacao ?? "").trim().toLowerCase() === "ativo").length}
          </p>
        </div>

        <div className="rounded-2xl border border-[#e2ebe6] bg-white p-4 shadow-sm sm:p-5">
          <p className="text-sm text-gray-500">
            Exibindo
          </p>

          <p className="mt-1 text-2xl font-bold text-[#005a3c] sm:text-3xl">
            {socios.length}
          </p>
        </div>

      </div>

      <div className="mb-5 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5 sm:p-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔎</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, CPF ou matrícula..."
            className="w-full min-w-0 bg-transparent py-2 text-sm outline-none sm:text-base"
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[#edf2ef] pt-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
              Tipo de sócio
            </span>
            <details className="group rounded-xl border border-[#d5e0da] bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm text-[#173d2e] outline-none focus:border-[#005a3c]">
                <span>
                  {filtroTipoSocio.length === 0
                    ? "Todos os tipos"
                    : `${filtroTipoSocio.length} tipo(s) selecionado(s)`}
                </span>
                <span aria-hidden="true" className="text-xs text-gray-500 transition group-open:rotate-180">▾</span>
              </summary>
              <div className="max-h-64 overflow-y-auto border-t border-[#edf2ef] p-3">
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setFiltroTipoSocio([])}
                    className="rounded-lg px-2 py-1 text-xs font-bold text-[#005a3c] hover:bg-[#eef7f2]"
                  >
                    Mostrar todos os tipos
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {TIPOS_SOCIO.map((tipo) => (
                    <label key={tipo.value} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[#f4f8f6]">
                      <input
                        type="checkbox"
                        checked={filtroTipoSocio.includes(tipo.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            if (!filtroTipoSocio.includes(tipo.value)) {
                              setFiltroTipoSocio([...filtroTipoSocio, tipo.value]);
                            }
                          } else {
                            setFiltroTipoSocio(filtroTipoSocio.filter((valor) => valor !== tipo.value));
                          }
                        }}
                        className="mt-0.5 accent-[#005a3c]"
                      />
                      <span>{tipo.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </details>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
              Condição de remissão
            </span>
            <select
              value={filtroRemissao}
              onChange={(e) => setFiltroRemissao(e.target.value)}
              className="w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-2.5 text-sm text-[#173d2e] outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
            >
              <option value="todas">Todas as condições</option>
              <option value="remidos">Somente remidos</option>
              <option value="nao_remidos">Não remidos</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
              Situação do sócio
            </span>
            <select
              value={filtroSituacaoSocio}
              onChange={(e) => setFiltroSituacaoSocio(e.target.value)}
              className="w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-2.5 text-sm text-[#173d2e] outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/10"
            >
              <option value="todas">Todas as situações</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
              <option value="suspenso">Suspenso</option>
            </select>
          </label>
        </div>

        {(busca || filtroTipoSocio.length > 0 || filtroRemissao !== "todas" || filtroSituacaoSocio !== "todas") && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setBusca("");
                setFiltroTipoSocio([]);
                setFiltroRemissao("todas");
                setFiltroSituacaoSocio("todas");
              }}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#005a3c] hover:bg-[#eef7f2]"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e2ebe6] bg-white shadow-sm">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[760px] text-sm">

            <thead className="bg-[#e8f3ee]">

              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">

                <th className="px-3 py-3 sm:px-5 sm:py-4">
                  Foto
                </th>

                <th className="px-3 py-3 sm:px-5 sm:py-4">
                  Matrícula
                </th>

                <th className="px-3 py-3 sm:px-5 sm:py-4">
                  Nome
                </th>

                <th className="px-3 py-3 sm:px-5 sm:py-4">
                  CPF
                </th>

                <th className="px-3 py-3 sm:px-5 sm:py-4">
                  WhatsApp
                </th>

                <th className="px-3 py-3 sm:px-5 sm:py-4">
                  Tipo
                </th>

                <th className="px-3 py-3 sm:px-5 sm:py-4">
                  Responsável
                </th>

                {camposVisiveis.financeiro && <th className="px-3 py-3 sm:px-5 sm:py-4">Mensalidade</th>}

                {camposVisiveis.financeiro && <th className="px-3 py-3 sm:px-5 sm:py-4">Financeiro</th>}

                <th className="px-3 py-3 sm:px-5 sm:py-4">
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
                    colSpan={camposVisiveis.financeiro ? 11 : 9}
                    className="px-3 py-10 text-center text-gray-500 sm:px-5 sm:py-12"
                  >
                    Carregando sócios...
                  </td>
                </tr>
              )}

              {!carregando && socios.length === 0 && (
                <tr>
                  <td
                    colSpan={camposVisiveis.financeiro ? 11 : 9}
                    className="px-3 py-10 text-center sm:px-5 sm:py-12"
                  >
                    <div className="text-4xl">
                      👥
                    </div>

                    <p className="mt-3 font-semibold text-gray-700">
                      Nenhum sócio corresponde à busca ou aos filtros.
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Altere os filtros ou limpe a busca para ver outros associados.
                    </p>

                    {(busca || filtroTipoSocio.length > 0 || filtroRemissao !== "todas" || filtroSituacaoSocio !== "todas") && (
                      <button
                        type="button"
                        onClick={() => {
                          setBusca("");
                          setFiltroTipoSocio([]);
                          setFiltroRemissao("todas");
                          setFiltroSituacaoSocio("todas");
                        }}
                        className="mt-4 rounded-lg bg-[#063b28] px-4 py-2 text-sm font-bold text-white"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </td>
                </tr>
              )}

              {!carregando &&
                sociosPagina.map((socio) => (
                  <tr
                    key={socio.id}
                    className="transition hover:bg-[#fafcfb]"
                  >

                    <td className="px-3 py-3 sm:px-5 sm:py-4">
                      {socio.foto_url ? (
                        <Image
                          src={socio.foto_url}
                          alt={`Foto de ${socio.nome}`}
                          width={44}
                          height={44}
                          unoptimized
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

                    <td className="px-3 py-3 sm:px-5 sm:py-4">

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
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex max-w-[190px] rounded-full px-3 py-1 text-xs font-extrabold ${tipoSocioClasse(socio.tipo_socio)}`}>
                          {tipoSocioLabel(socio.tipo_socio)}
                        </span>
                        {socioEhRemido(socio) && (
                          <span className="inline-flex rounded-full bg-[#f0e9f8] px-2.5 py-1 text-[11px] font-extrabold text-[#6d4b91] ring-1 ring-[#d5c5e6]">
                            Remido
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-sm text-gray-600">
                      {socio.responsavel_id
                        ? sociosCompletos.find((p) => p.id === socio.responsavel_id)?.nome || "Responsável"
                        : "—"}
                    </td>

                    {camposVisiveis.financeiro && <td className="px-5 py-4 text-sm">
                      {socio.possui_mensalidade
                        ? `R$ ${Number(socio.valor_mensalidade || 0).toFixed(2).replace(".", ",")}`
                        : "Sem mensalidade"}
                    </td>}

                    {camposVisiveis.financeiro && <td className="px-3 py-3 sm:px-5 sm:py-4">
                      {(() => {
                        const status = socio.financeiro_status || "restrito";
                        const meses = Number(socio.meses_atraso || 0);
                        const label = status === "muito_atrasado" ? `🔴 ${meses || "Vários"} meses — bloqueio` : status === "atrasado" ? `🟡 ${meses} meses — atenção` : status === "em_dia" ? "🟢 0 meses — em dia" : status === "sem_lancamentos" ? "⚪ Sem mensalidades lançadas" : "⚪ Conferir financeiro";
                        const classe = status === "muito_atrasado" ? "bg-red-100 text-red-700" : status === "atrasado" ? "bg-amber-100 text-amber-700" : status === "em_dia" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600";
                        return <span title={meses ? `${meses} competências vencidas` : undefined} className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${classe}`}>{label}</span>;
                      })()}
                    </td>}

                    <td className="px-3 py-3 sm:px-5 sm:py-4">

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

                    <td className="px-3 py-3 sm:px-5 sm:py-4">
                      {!somenteConsulta && (
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
                      )}
                    </td>

                  </tr>
                ))}

            </tbody>

          </table>

        </div>

        {!carregando && socios.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-[#e2ebe6] bg-[#fbfdfc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Exibindo {(paginaSocios - 1) * tamanhoPaginaSocios + 1}–{Math.min(paginaSocios * tamanhoPaginaSocios, socios.length)} de {socios.length} sócios filtrados (total disponível: {socios.length}).
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setPaginaSocios((pagina) => Math.max(1, pagina - 1))} disabled={paginaSocios <= 1} className="rounded-lg border border-[#d5e0da] bg-white px-3 py-2 text-xs font-bold text-[#005a3c] disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
              <span className="min-w-[90px] text-center text-xs font-semibold text-gray-600">Página {paginaSocios} de {totalPaginasSocios}</span>
              <button type="button" onClick={() => setPaginaSocios((pagina) => Math.min(totalPaginasSocios, pagina + 1))} disabled={paginaSocios >= totalPaginasSocios} className="rounded-lg border border-[#d5e0da] bg-white px-3 py-2 text-xs font-bold text-[#005a3c] disabled:cursor-not-allowed disabled:opacity-40">Próxima</button>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}



/* =========================
   FINANCEIRO
========================= */

function ModalSocio({
  socios,
  contasBancarias,
  form,
  socioEditando,
  buscaResponsavel,
  setBuscaResponsavel,
  salvando,
  mensagem,
  setMensagem,
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
  buscaResponsavel: string;
  setBuscaResponsavel: (valor: string) => void;
  salvando: boolean;
  mensagem: string;
  setMensagem: (valor: string) => void;
  fechar: () => void;
  alterarCampo: (campo: keyof Socio, valor: string) => void;
  salvar: (dependenteIds?: string[], quantidadeDependentes?: number) => void;
  selecionarFoto: (file: File | null) => void;
  removerFoto: () => void;
}) {
  type ItemExameFamilia = {
    chave: string;
    nome: string;
    matricula: string | null;
    exame_medico_validade: string | null;
    socio_ids: string[];
    dependente_ids: string[];
  };
  const [dependentesExame, setDependentesExame] = useState<ItemExameFamilia[]>([]);
  const [dependentesExameSelecionados, setDependentesExameSelecionados] = useState<string[]>([]);

  useEffect(() => {
    let ativo = true;

    // As famílias novas são gravadas em `socios` (responsavel_id). Cadastros
    // antigos ainda podem estar em `dependentes` (socio_id). Consultamos as
    // duas fontes para que um sócio que também é dependente de outra pessoa
    // possa ter sua própria família e para não deixar famílias legadas de fora.
    void Promise.resolve().then(async () => {
      if (!socioEditando?.id) {
        if (ativo) {
          setDependentesExame([]);
          setDependentesExameSelecionados([]);
        }
        return;
      }

      const dependentesResult = await supabase
        .from("dependentes")
        .select("id,nome,matricula,exame_medico_validade,ativo")
        .eq("socio_id", socioEditando.id)
        .or("ativo.eq.true,ativo.is.null")
        .order("nome");

      if (!ativo) return;

      // A tela Sócios já carrega a tabela `socios` completa pela API
      // administrativa. Usamos essa lista para localizar os filhos vinculados
      // por responsavel_id; isso também atende um SD/SC que seja dependente de
      // alguém, mas tenha filhos próprios cadastrados como sócios.
      const matriculaResponsavel = String(socioEditando.matricula ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const baseMatriculaFamiliar = matriculaResponsavel.endsWith("A") ? matriculaResponsavel.slice(0, -1) : "";
      const filhosComoSocios = socios.filter((registro) => {
        const matriculaFamiliar = String(registro.matricula ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        const vinculoPorId = registro.responsavel_id === socioEditando.id;
        // Compatibilidade com famílias antigas em que B/C/D compartilham a
        // matrícula-base A, mas o campo responsavel_id não foi preenchido.
        const vinculoPorMatricula = Boolean(
          baseMatriculaFamiliar &&
          matriculaFamiliar.length === baseMatriculaFamiliar.length + 1 &&
          matriculaFamiliar.startsWith(baseMatriculaFamiliar) &&
          matriculaFamiliar.slice(-1) !== "A"
        );
        if (!vinculoPorId && !vinculoPorMatricula) return false;
        const situacao = String(registro.situacao || "").trim().toLowerCase();
        return situacao !== "inativo" && situacao !== "cancelado" && situacao !== "cancelada";
      });
      if (dependentesResult.error && filhosComoSocios.length === 0) {
        setMensagem("Não foi possível carregar os dependentes desta família. Confira se os cadastros estão vinculados ao responsável.");
        return;
      }

      const porPessoa = new Map<string, ItemExameFamilia>();
      const chavePessoa = (nome: unknown, matricula: unknown) => {
        const matriculaNormalizada = String(matricula ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (matriculaNormalizada) return `matricula:${matriculaNormalizada}`;
        const nomeNormalizado = String(nome ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
        return `nome:${nomeNormalizado}`;
      };
      const incluir = (registro: { id: string; nome: string; matricula: string | null; exame_medico_validade: string | null }, origem: "socio" | "dependente") => {
        const chave = chavePessoa(registro.nome, registro.matricula);
        const existente = porPessoa.get(chave);
        if (existente) {
          if (origem === "socio" && !existente.socio_ids.includes(registro.id)) existente.socio_ids.push(registro.id);
          if (origem === "dependente" && !existente.dependente_ids.includes(registro.id)) existente.dependente_ids.push(registro.id);
          if (!existente.exame_medico_validade && registro.exame_medico_validade) existente.exame_medico_validade = registro.exame_medico_validade;
          return;
        }
        porPessoa.set(chave, {
          chave,
          nome: registro.nome,
          matricula: registro.matricula == null ? null : String(registro.matricula),
          exame_medico_validade: registro.exame_medico_validade,
          socio_ids: origem === "socio" ? [registro.id] : [],
          dependente_ids: origem === "dependente" ? [registro.id] : [],
        });
      };

      // Os registros da tabela socios são a fonte principal para famílias atuais.
      for (const registro of filhosComoSocios) {
        incluir({
          id: registro.id,
          nome: registro.nome,
          matricula: registro.matricula == null ? null : String(registro.matricula),
          exame_medico_validade: registro.exame_medico_validade,
        }, "socio");
      }
      // Inclui também dependentes do modelo legado. Duplicados por matrícula
      // são agrupados no mesmo checkbox e terão os dois registros atualizados.
      for (const registro of (dependentesResult.data || []) as Array<{ id: string; nome: string; matricula: string | number | null; exame_medico_validade: string | null }>) {
        incluir({ ...registro, matricula: registro.matricula == null ? null : String(registro.matricula) }, "dependente");
      }

      setDependentesExame([...porPessoa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setDependentesExameSelecionados([]);
    });

    return () => { ativo = false; };
  }, [socioEditando?.id, socios, setMensagem]);


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
                    <Image
                      src={form.foto_url}
                      alt={`Foto de ${form.nome || "associado"}`}
                      width={128}
                      height={128}
                      unoptimized
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

            <div className="md:col-span-2">
              <Campo
                label="Matrícula"
                value={form.matricula}
                onChange={(v) => alterarCampo("matricula", v.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="Ex.: SC0001A"
                obrigatorio={!form.responsavel_id}
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Informe a matrícula usada pela sociedade, por exemplo SC0001A, SP0001A ou TE0001A. Cada matrícula deve ser única.
                {form.responsavel_id ? " Para dependentes, informe a matrícula familiar correspondente, como SC0001B ou SC0001C." : ""}
              </p>
            </div>

            <Campo
              label="Data de associação"
              type="date"
              value={form.data_associacao}
              onChange={(v) => alterarCampo("data_associacao", v)}
            />

            <Campo
              label="Validade do exame médico"
              type="date"
              value={form.exame_medico_validade || ""}
              onChange={(v) => alterarCampo("exame_medico_validade", v)}
            />
            {socioEditando && dependentesExame.length > 0 && (
              <div className="md:col-span-2 rounded-2xl border border-[#cbded3] bg-[#f5faf7] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-[#005a3c]">Atualizar exame dos dependentes</h3><p className="text-xs text-slate-600">Marque somente quem também realizou o exame. Os demais cadastros não serão alterados.</p></div>
                  <button type="button" onClick={() => setDependentesExameSelecionados(dependentesExameSelecionados.length === dependentesExame.length ? [] : dependentesExame.map((d) => d.chave))} className="rounded-lg border px-3 py-2 text-xs font-bold">{dependentesExameSelecionados.length === dependentesExame.length ? "Desmarcar todos" : "Selecionar todos"}</button></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">{dependentesExame.map((d) => <label key={d.chave} className="flex cursor-pointer items-center gap-3 rounded-xl border bg-white p-3 text-sm"><input type="checkbox" checked={dependentesExameSelecionados.includes(d.chave)} onChange={(e) => setDependentesExameSelecionados((old) => e.target.checked ? [...old, d.chave] : old.filter((key) => key !== d.chave))} /><span className="min-w-0"><b className="block">{d.nome}</b><span className="text-xs text-slate-500">{d.matricula || "Sem matrícula"} · Validade: {d.exame_medico_validade ? new Date(`${d.exame_medico_validade}T12:00:00`).toLocaleDateString("pt-BR") : "não cadastrada"}</span></span></label>)}</div>
                <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#315b49]">A validade informada acima será aplicada ao titular e aos dependentes marcados quando você clicar em <b>Salvar alterações</b>.</p>
              </div>
            )}

            <SelectCampo
              label="Tipo de associado"
              value={form.tipo_socio || "patrimonial_individual"}
              onChange={(v) => alterarCampo("tipo_socio", v)}
              opcoes={TIPOS_SOCIO.map((item) => item.value)}
              labels={Object.fromEntries(TIPOS_SOCIO.map((item) => [item.value, item.label]))}
            />

            {!form.responsavel_id &&
              !String(form.tipo_socio || "").startsWith("dependente_") &&
              !String(form.tipo_socio || "").startsWith("temporada_") &&
              form.tipo_socio !== "dependente_temporada_familiar" && (
                <div className="md:col-span-2 flex items-center rounded-xl border border-[#d5e0da] bg-[#f7faf8] px-4 py-3">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={Boolean(form.remido)}
                      onChange={(e) => alterarCampo("remido", e.target.checked ? "true" : "false")}
                      className="mt-1 h-4 w-4 accent-[#005a3c]"
                    />
                    <span>
                      <span className="block text-sm font-bold text-[#005a3c]">Associado Remido</span>
                      <span className="mt-1 block text-xs text-gray-500">Isento de mensalidade. O cadastro ficará marcado como remido e a situação financeira como isento.</span>
                    </span>
                  </label>
                </div>
              )}

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

                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-semibold text-gray-700">Responsável</label>
                  <input
                    type="text"
                    value={buscaResponsavel}
                    onChange={(e) => setBuscaResponsavel(e.target.value)}
                    placeholder="Digite o nome do responsável para buscar..."
                    className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 outline-none focus:border-[#005a3c]"
                  />
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[#dfe9e3] bg-white">
                    <button type="button" onClick={() => { alterarCampo("responsavel_id", ""); setBuscaResponsavel(""); }} className="block w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-[#e8f3ee]">Sem responsável</button>
                    {socios
                      .filter((p) => p.id !== socioEditando?.id)
                      .filter((p) => p.nome.toLowerCase().includes(buscaResponsavel.toLowerCase()))
                      .slice(0, 50)
                      .map((p) => (
                        <button key={p.id} type="button" onClick={() => { alterarCampo("responsavel_id", p.id); setBuscaResponsavel(p.nome); }} className={`block w-full px-4 py-2 text-left text-sm hover:bg-[#e8f3ee] ${form.responsavel_id === p.id ? "bg-[#e8f3ee] font-bold text-[#005a3c]" : "text-gray-700"}`}>
                          {p.nome}
                        </button>
                      ))}
                    {buscaResponsavel && socios.filter((p) => p.id !== socioEditando?.id && p.nome.toLowerCase().includes(buscaResponsavel.toLowerCase())).length === 0 && (
                      <p className="px-4 py-3 text-sm text-gray-500">Nenhum responsável encontrado.</p>
                    )}
                  </div>
                </div>
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
            onClick={() => {
              const selecionados = dependentesExame.filter((d) => dependentesExameSelecionados.includes(d.chave));
              const idsSelecionados = selecionados.flatMap((d) => [
                ...d.socio_ids.map((id) => `socio:${id}`),
                ...d.dependente_ids.map((id) => `dependente:${id}`),
              ]);
              salvar(idsSelecionados, selecionados.length);
            }}
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

