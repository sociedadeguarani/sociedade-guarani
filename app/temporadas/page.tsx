/* app/temporadas/page.tsx */
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { QRCodeSVG } from "qrcode.react";
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  Umbrella,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Conta = {
  id: string;
  nome: string;
  banco: string | null;
  ativo: boolean;
};

type Parcela = {
  id: string;
  numero: number;
  descricao: string | null;
  valor: number;
  data_vencimento: string;
  forma_pagamento: string | null;
  situacao: string;
  data_pagamento: string | null;
  conta_bancaria_id: string | null;
  movimentacao_id: string | null;
  boleto_status: string | null;
  cheque_numero: string | null;
};

type Temporada = {
  id: string;
  socio_id: string | null;
  tipo: "temporada_individual" | "temporada_familiar";
  modalidade: "individual" | "familiar";
  codigo: string | null;
  matricula: string | null;
  inicio: string;
  fim: string;
  valor_total: number;
  situacao: string;
  forma_pagamento: string | null;
  conta_bancaria_id: string | null;
  data_contratacao: string;
  data_pagamento: string | null;
  observacoes: string | null;
  responsavel_nome: string;
  responsavel_cpf: string | null;
  responsavel_telefone: string | null;
  responsavel_email: string | null;
  parcelas: Parcela[];
  participantes: { id?: string; socio_id: string | null; nome: string | null; cpf?: string | null; telefone?: string | null; parentesco?: string | null; papel: string; matricula: string | null; foto_url?: string | null }[];
};

type ParcelaForm = {
  descricao: string;
  valor: string;
  data_vencimento: string;
  forma_pagamento: string;
  confirmar: boolean;
};

const hoje = new Date().toISOString().slice(0, 10);
const fimPadrao = `${new Date().getFullYear() + 1}-03-31`;

function moeda(valor: number) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBr(valor: string | null | undefined) {
  if (!valor) return "—";
  const [a, m, d] = valor.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : valor;
}

function formaLabel(valor: string | null | undefined) {
  const mapa: Record<string, string> = {
    pix: "PIX",
    dinheiro: "Dinheiro",
    cheque: "Cheque",
    boleto: "Boleto",
    debito_em_conta: "Débito em conta",
    transferencia: "Transferência",
    cartao: "Cartão",
  };
  return mapa[String(valor || "").toLowerCase()] || valor || "—";
}

function situacaoLabel(valor: string) {
  const mapa: Record<string, string> = {
    pendente: "Pendente",
    ativa: "Ativa",
    encerrada: "Encerrada",
    cancelada: "Cancelada",
    pago: "Pago",
    em_compensacao: "Em compensação",
    vencido: "Vencido",
    cancelado: "Cancelado",
  };
  return mapa[valor] || valor;
}

function badgeClass(valor: string) {
  if (valor === "ativa" || valor === "pago") return "bg-emerald-100 text-emerald-700";
  if (valor === "cancelada" || valor === "cancelado") return "bg-red-100 text-red-700";
  if (valor === "vencido") return "bg-red-100 text-red-700";
  if (valor === "em_compensacao") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function criarParcelas(
  total: number,
  plano: "avista" | "entrada_1" | "entrada_2",
  inicio: string,
  forma: string
): ParcelaForm[] {
  const base = new Date(`${inicio}T12:00:00`);
  const parcelas = plano === "avista" ? 1 : plano === "entrada_1" ? 2 : 3;
  const valorBase = Math.floor((total / parcelas) * 100) / 100;
  const primeira = total - valorBase * (parcelas - 1);

  return Array.from({ length: parcelas }, (_, i) => {
    const vencimento = new Date(base);
    vencimento.setMonth(vencimento.getMonth() + i);
    return {
      descricao: i === 0 ? "Entrada" : `Parcela ${i}`,
      valor: (i === 0 ? primeira : valorBase).toFixed(2),
      data_vencimento: vencimento.toISOString().slice(0, 10),
      forma_pagamento: forma,
      confirmar: i === 0,
    };
  });
}

function statusCarteirinhaTemporada(temporada: Temporada) {
  const hojeLocal = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const parcelasAtrasadas = (temporada.parcelas || []).filter((p) =>
    String(p.data_vencimento || "").slice(0, 10) < hojeLocal &&
    !["pago", "paid", "quitado", "recebido", "cancelado", "cancelada", "isento", "isenta"].includes(String(p.situacao || "").toLowerCase())
  );
  const validade = (!temporada.inicio || temporada.inicio.slice(0, 10) <= hojeLocal) && (!temporada.fim || temporada.fim.slice(0, 10) >= hojeLocal);
  if (parcelasAtrasadas.length) return { texto: `BLOQUEADA — ${parcelasAtrasadas.length} parcela(s) vencida(s)`, bloqueada: true, ativa: false };
  if (temporada.situacao !== "ativa" || !validade) return { texto: "INATIVA / FORA DA VALIDADE", bloqueada: false, ativa: false };
  return { texto: "ATIVA — EM DIA", bloqueada: false, ativa: true };
}

export default function TemporadasPage() {
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [abrirCadastro, setAbrirCadastro] = useState(false);
  const [modoCadastro, setModoCadastro] = useState<"novo" | "editar">("novo");
  const [temporadaEditando, setTemporadaEditando] = useState<Temporada | null>(null);
  const [abrirParticipantes, setAbrirParticipantes] = useState<Temporada | null>(null);
  const [abrirCarteirinhas, setAbrirCarteirinhas] = useState<Temporada | null>(null);
  const [novoParticipanteNome, setNovoParticipanteNome] = useState("");
  const [novoParticipanteCpf, setNovoParticipanteCpf] = useState("");
  const [novoParticipanteTelefone, setNovoParticipanteTelefone] = useState("");
  const [novoParticipanteParentesco, setNovoParticipanteParentesco] = useState("Filho(a)");
  const [abrirPagamento, setAbrirPagamento] = useState<Parcela | null>(null);
  const [temporadaPagamento, setTemporadaPagamento] = useState<Temporada | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const [tipo, setTipo] = useState<"temporada_individual" | "temporada_familiar">(
    "temporada_familiar"
  );
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState(fimPadrao);
  const [valor, setValor] = useState("1100");
  const [plano, setPlano] = useState<"avista" | "entrada_1" | "entrada_2">("avista");
  const [formaPadrao, setFormaPadrao] = useState("pix");
  const [contaId, setContaId] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [responsavelCpf, setResponsavelCpf] = useState("");
  const [responsavelTelefone, setResponsavelTelefone] = useState("");
  const [responsavelEmail, setResponsavelEmail] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [parcelas, setParcelas] = useState<ParcelaForm[]>([]);

  const [pagamentoData, setPagamentoData] = useState(hoje);
  const [pagamentoForma, setPagamentoForma] = useState("pix");
  const [pagamentoConta, setPagamentoConta] = useState("");
  const [chequeNumero, setChequeNumero] = useState("");

  async function token() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }

  async function carregar() {
    setCarregando(true);
    try {
      const accessToken = await token();
      if (!accessToken) {
        window.location.href = "/login";
        return;
      }

      const [rTemp, rContas] = await Promise.all([
        fetch("/api/temporadas", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }),
        fetch("/api/financeiro", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }),
      ]);

      const [jTemp, jContas] = await Promise.all([
        rTemp.json().catch(() => ({})),
        rContas.json().catch(() => ({})),
      ]);

      if (!rTemp.ok) throw new Error(jTemp?.error || "Erro ao carregar temporadas.");

      setTemporadas(Array.isArray(jTemp?.temporadas) ? jTemp.temporadas : []);
      setContas(Array.isArray(jContas?.contas) ? jContas.contas : []);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao carregar temporadas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  useEffect(() => {
    const total = Number(valor || 0);
    setParcelas(criarParcelas(total, plano, inicio || hoje, formaPadrao));
  }, [valor, plano, inicio, formaPadrao]);

  useEffect(() => {
    if (tipo === "temporada_familiar") {
      setValor((atual) => (atual === "600" ? "1100" : atual || "1100"));
    } else {
      setValor((atual) => (atual === "1100" ? "600" : atual || "600"));
    }
  }, [tipo]);


  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return temporadas.filter((t) => {
      const nome = t.responsavel_nome || "";
      const texto = `${nome} ${t.matricula || ""} ${t.codigo || ""}`.toLowerCase();
      const bateBusca = !termo || texto.includes(termo);
      const bateFiltro = filtro === "todas" || t.situacao === filtro;
      return bateBusca && bateFiltro;
    });
  }, [temporadas, busca, filtro]);

  function limparFormulario() {
    setModoCadastro("novo");
    setTemporadaEditando(null);
    setTipo("temporada_familiar");
    setResponsavelNome("");
    setResponsavelCpf("");
    setResponsavelTelefone("");
    setResponsavelEmail("");
    setInicio(hoje);
    setFim(fimPadrao);
    setValor("1100");
    setPlano("avista");
    setFormaPadrao("pix");
    setContaId("");
    setObservacoes("");
  }

  function editarParcela(index: number, campo: keyof ParcelaForm, valorCampo: string | boolean) {
    setParcelas((atual) =>
      atual.map((p, i) => (i === index ? { ...p, [campo]: valorCampo } : p))
    );
  }

  function abrirEdicaoTemporada(t: Temporada) {
    setModoCadastro("editar");
    setTemporadaEditando(t);
    setTipo(t.tipo);
    setResponsavelNome(t.responsavel_nome || "");
    setResponsavelCpf(t.responsavel_cpf || "");
    setResponsavelTelefone(t.responsavel_telefone || "");
    setResponsavelEmail(t.responsavel_email || "");
    setInicio(t.inicio);
    setFim(t.fim);
    setValor(String(t.valor_total || 0));
    setObservacoes(t.observacoes || "");
    setAbrirCadastro(true);
    setMensagem("");
  }

  function abrirParticipantesModal(t: Temporada) {
    setAbrirParticipantes(t);
    setNovoParticipanteNome("");
    setNovoParticipanteCpf("");
    setNovoParticipanteTelefone("");
    setNovoParticipanteParentesco("Filho(a)");
    setMensagem("");
  }

  async function adicionarParticipante() {
    if (!abrirParticipantes || !novoParticipanteNome.trim()) {
      setMensagem("Informe o nome do participante.");
      return;
    }

    setSalvando(true);
    setMensagem("");

    try {
      const accessToken = await token();
      const resposta = await fetch("/api/temporadas", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "adicionar_participante",
          temporada_id: abrirParticipantes.id,
          nome: novoParticipanteNome.trim(),
          cpf: novoParticipanteCpf,
          telefone: novoParticipanteTelefone,
          parentesco: novoParticipanteParentesco,
        }),
      });

      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível adicionar o participante.");

      setMensagem(resultado?.participante?.matricula
        ? `Participante adicionado com matrícula ${resultado.participante.matricula}.`
        : "Participante adicionado.");
      setNovoParticipanteNome("");
      setNovoParticipanteCpf("");
      setNovoParticipanteTelefone("");
      await carregar();

      const recarregar = await fetch("/api/temporadas", {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
      });
      const dados = await recarregar.json().catch(() => ({}));
      const t = (dados?.temporadas || []).find((x: Temporada) => x.id === abrirParticipantes.id);
      if (t) setAbrirParticipantes(t);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao adicionar participante.");
    } finally {
      setSalvando(false);
    }
  }

  async function salvarFotoParticipante(participanteId: string, arquivo: File) {
    if (!abrirParticipantes || !arquivo) return;
    if (!arquivo.type.startsWith("image/")) {
      setMensagem("Selecione um arquivo de imagem (JPG, PNG ou WEBP).");
      return;
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      setMensagem("A foto deve ter no máximo 5 MB.");
      return;
    }

    setSalvando(true);
    setMensagem("");
    try {
      const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "jpg";
      const caminho = `socios/temporada-${participanteId}.${extensao}`;
      const upload = await supabase.storage.from("fotos-associados").upload(caminho, arquivo, {
        upsert: true,
        contentType: arquivo.type || "image/jpeg",
      });
      if (upload.error) throw upload.error;

      const { data: urlData } = supabase.storage.from("fotos-associados").getPublicUrl(caminho);
      const accessToken = await token();
      const resposta = await fetch("/api/temporadas", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "atualizar_foto_participante", temporada_id: abrirParticipantes.id, participante_id: participanteId, foto_url: urlData.publicUrl }),
      });
      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível salvar a foto.");

      await carregar();
      const recarregar = await fetch("/api/temporadas", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const dados = await recarregar.json().catch(() => ({}));
      const t = (dados?.temporadas || []).find((x: Temporada) => x.id === abrirParticipantes.id);
      if (t) {
        setAbrirParticipantes(t);
        setAbrirCarteirinhas((atual) => atual?.id === t.id ? t : atual);
      }
      setMensagem("Foto do participante salva com sucesso.");
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao salvar a foto.");
    } finally {
      setSalvando(false);
    }
  }

  async function removerParticipante(participanteId: string) {
    if (!abrirParticipantes) return;
    if (!window.confirm("Remover este participante da temporada?")) return;

    setSalvando(true);
    try {
      const accessToken = await token();
      const resposta = await fetch("/api/temporadas", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "remover_participante",
          temporada_id: abrirParticipantes.id,
          participante_id: participanteId,
        }),
      });

      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível remover o participante.");

      await carregar();
      const recarregar = await fetch("/api/temporadas", {
        headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
      });
      const dados = await recarregar.json().catch(() => ({}));
      const t = (dados?.temporadas || []).find((x: Temporada) => x.id === abrirParticipantes.id);
      if (t) setAbrirParticipantes(t);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao remover participante.");
    } finally {
      setSalvando(false);
    }
  }

  async function gerarCarteirinhas(t: Temporada) {
    setSalvando(true);
    setMensagem("");

    try {
      const accessToken = await token();
      const resposta = await fetch("/api/temporadas", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "gerar_carteirinhas", temporada_id: t.id }),
      });

      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível gerar as carteirinhas.");

      setAbrirCarteirinhas({
        ...t,
        codigo: resultado.codigo || t.codigo,
        matricula: resultado.codigo || t.matricula,
        participantes: resultado.participantes || t.participantes || [],
      });
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao gerar carteirinhas.");
    } finally {
      setSalvando(false);
    }
  }

  function imprimirCarteirinhas() {
    window.print();
  }

  async function salvarTemporada() {
    if (!responsavelNome.trim()) {
      setMensagem("Informe o responsável pela temporada.");
      return;
    }
    if (!inicio || !fim || fim < inicio) {
      setMensagem("Informe um período válido.");
      return;
    }

    setSalvando(true);
    setMensagem("");

    try {
      const accessToken = await token();

      if (modoCadastro === "editar" && temporadaEditando) {
        const resposta = await fetch("/api/temporadas", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            acao: "editar",
            temporada_id: temporadaEditando.id,
            responsavel_nome: responsavelNome.trim(),
            responsavel_cpf: responsavelCpf.replace(/\D/g, "").slice(0, 11) || null,
            responsavel_telefone: responsavelTelefone.trim() || null,
            responsavel_email: responsavelEmail.trim() || null,
            inicio,
            fim,
            observacoes: observacoes || null,
          }),
        });

        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível salvar as alterações.");

        setMensagem("Temporada atualizada com sucesso.");
        setAbrirCadastro(false);
        limparFormulario();
        await carregar();
        return;
      }

      const total = Number(valor || 0);
      if (total <= 0) {
        setMensagem("Informe um valor de temporada maior que zero.");
        return;
      }

      if (!parcelas.length) {
        setMensagem("Configure pelo menos uma parcela.");
        return;
      }

      const somaParcelas = parcelas.reduce((s, p) => s + Number(p.valor || 0), 0);
      if (Math.abs(somaParcelas - total) > 0.02) {
        setMensagem(`As parcelas somam ${moeda(somaParcelas)}, mas a temporada vale ${moeda(total)}. Ajuste os valores antes de salvar.`);
        return;
      }

      const resposta = await fetch("/api/temporadas", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "criar",
          socio_id: null,
          responsavel_nome: responsavelNome.trim(),
          responsavel_cpf: responsavelCpf.replace(/\D/g, "").slice(0, 11) || null,
          responsavel_telefone: responsavelTelefone.trim() || null,
          responsavel_email: responsavelEmail.trim() || null,
          tipo,
          inicio,
          fim,
          valor_total: total,
          conta_bancaria_id: contaId || null,
          observacoes: observacoes || null,
          parcelas: parcelas.map((p) => ({
            descricao: p.descricao,
            valor: Number(p.valor || 0),
            data_vencimento: p.data_vencimento,
            forma_pagamento: p.forma_pagamento,
            confirmar: p.confirmar,
            conta_bancaria_id: p.confirmar ? contaId || null : null,
          })),
        }),
      });

      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível cadastrar a temporada.");

      setMensagem(
        `Temporada cadastrada. ${resultado?.codigo ? `Matrícula ${resultado.codigo}.` : "A matrícula será gerada quando houver confirmação de pagamento."}`
      );
      setAbrirCadastro(false);
      limparFormulario();
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao cadastrar temporada.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirModalPagamento(t: Temporada, p: Parcela) {
    setTemporadaPagamento(t);
    setAbrirPagamento(p);
    setPagamentoData(hoje);
    setPagamentoForma(p.forma_pagamento || "pix");
    setPagamentoConta(p.conta_bancaria_id || contas[0]?.id || "");
    setChequeNumero(p.cheque_numero || "");
  }

  async function confirmarPagamento() {
    if (!temporadaPagamento || !abrirPagamento) return;

    if (pagamentoForma !== "cheque" && !pagamentoConta) {
      setMensagem("Selecione a conta que receberá o pagamento.");
      return;
    }

    setSalvando(true);
    setMensagem("");

    try {
      const accessToken = await token();
      const resposta = await fetch("/api/temporadas", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acao: "registrar_pagamento",
          temporada_id: temporadaPagamento.id,
          parcela_id: abrirPagamento.id,
          data_pagamento: pagamentoData,
          forma_pagamento: pagamentoForma,
          conta_bancaria_id: pagamentoForma === "cheque" ? null : pagamentoConta,
          cheque_numero: pagamentoForma === "cheque" ? chequeNumero || null : null,
        }),
      });

      const resultado = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível registrar o pagamento.");

      setMensagem(
        resultado?.movimentacao_id
          ? "Pagamento confirmado e lançado no Financeiro."
          : "Pagamento registrado. A parcela ficará em compensação até a confirmação."
      );
      setAbrirPagamento(null);
      setTemporadaPagamento(null);
      await carregar();
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao registrar pagamento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <header className="sticky top-0 z-40 flex h-[76px] items-center justify-between border-b border-[#dfe9e3] bg-white px-5 shadow-sm lg:px-8">
        <div className="flex items-center gap-3 pl-12 lg:pl-0">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#ffead9] text-[#b65308]">
            <Umbrella className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#005a3c]">Temporada</h1>
            <p className="text-xs font-medium text-[#718078]">Venda, pagamentos e validade</p>
          </div>
        </div>
        <button
          onClick={() => { limparFormulario(); setAbrirCadastro(true); }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#003d2b]"
        >
          <Plus className="h-4 w-4" />
          Nova temporada
        </button>
      </header>

      <div className="flex min-h-[calc(100vh-76px)]">
        <MenuLateralPadrao />

        <section className="min-w-0 flex-1 p-5 lg:ml-[220px] lg:p-8">
          {mensagem && (
            <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-[#cfe0d7] bg-white p-4 text-sm shadow-sm">
              <span>{mensagem}</span>
              <button onClick={() => setMensagem("")}><X className="h-4 w-4" /></button>
            </div>
          )}

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-[#7a8b84]">Temporadas</p>
              <p className="mt-1 text-3xl font-black text-[#005a3c]">{temporadas.length}</p>
            </div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-[#7a8b84]">Ativas</p>
              <p className="mt-1 text-3xl font-black text-emerald-600">
                {temporadas.filter((t) => t.situacao === "ativa").length}
              </p>
            </div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-[#7a8b84]">Valor contratado</p>
              <p className="mt-1 text-2xl font-black text-[#17382c]">
                {moeda(temporadas.reduce((s, t) => s + Number(t.valor_total || 0), 0))}
              </p>
            </div>
          </div>

          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#dfe9e3] bg-white p-4 shadow-sm md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-[#91a099]" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, matrícula ou código TE..."
                className="w-full rounded-xl border border-[#d5e0da] bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#005a3c]"
              />
            </div>
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="rounded-xl border border-[#d5e0da] px-3 py-2.5 text-sm font-semibold"
            >
              <option value="todas">Todas</option>
              <option value="pendente">Pendentes</option>
              <option value="ativa">Ativas</option>
              <option value="encerrada">Encerradas</option>
              <option value="cancelada">Canceladas</option>
            </select>
            <button
              onClick={() => void carregar()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#d5e0da] px-4 py-2.5 text-sm font-bold hover:bg-[#f4f7f5]"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#dfe9e3] bg-white shadow-sm">
            {carregando ? (
              <div className="p-10 text-center text-sm text-[#718078]">Carregando temporadas...</div>
            ) : filtradas.length === 0 ? (
              <div className="p-10 text-center">
                <Umbrella className="mx-auto h-10 w-10 text-[#c7d6ce]" />
                <p className="mt-3 font-bold text-[#50625a]">Nenhuma temporada encontrada.</p>
                <p className="mt-1 text-sm text-[#82918a]">Cadastre a primeira venda pelo botão “Nova temporada”.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#edf2ef]">
                {filtradas.map((t) => {
                  const pagos = t.parcelas.filter((p) => p.situacao === "pago").reduce((s, p) => s + Number(p.valor), 0);
                  const pendentes = t.parcelas.filter((p) => p.situacao !== "pago" && p.situacao !== "cancelado");
                  return (
                    <div key={t.id} className="p-5">
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#ffead9] px-3 py-1 text-xs font-black text-[#b65308]">
                              {t.tipo === "temporada_familiar" ? "Familiar" : "Individual"}
                            </span>
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${badgeClass(t.situacao)}`}>
                              {situacaoLabel(t.situacao)}
                            </span>
                            {t.matricula && (
                              <span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs font-black text-[#005a3c]">
                                {t.matricula}
                              </span>
                            )}
                          </div>
                          <h2 className="mt-2 text-lg font-black">{t.responsavel_nome || "Responsável não informado"}</h2>
                          <div className="mt-2 grid gap-2 text-sm text-[#68776f] sm:grid-cols-3">
                            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {dataBr(t.inicio)} → {dataBr(t.fim)}</span>
                            <span className="inline-flex items-center gap-1.5"><DollarSign className="h-4 w-4" /> {moeda(t.valor_total)}</span>
                            <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> {Math.max(t.participantes?.length || 0, 1)} participante(s)</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:max-w-[360px]">
                          <button onClick={() => abrirEdicaoTemporada(t)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#d5e0da] bg-white px-3 py-2 text-xs font-bold text-[#005a3c] hover:bg-[#f4f7f5]">
                            <Pencil className="h-4 w-4" /> Editar
                          </button>
                          {t.tipo === "temporada_familiar" && (
                            <button onClick={() => abrirParticipantesModal(t)} className="inline-flex items-center gap-1.5 rounded-xl border border-[#f2bb91] bg-[#fff8f2] px-3 py-2 text-xs font-bold text-[#b65308] hover:bg-[#fff0e3]">
                              <UserPlus className="h-4 w-4" /> Dependentes
                            </button>
                          )}
                          {t.situacao === "ativa" && (
                            <button onClick={() => void gerarCarteirinhas(t)} className="inline-flex items-center gap-1.5 rounded-xl bg-[#005a3c] px-3 py-2 text-xs font-bold text-white hover:bg-[#003d2b]">
                              <CreditCard className="h-4 w-4" /> Carteirinhas
                            </button>
                          )}
                        </div>

                        <div className="min-w-[240px] rounded-2xl bg-[#f6f9f7] p-4">
                          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-[#7b8a83]">
                            <span>Financeiro</span>
                            <span>{t.parcelas.length} parcela(s)</span>
                          </div>
                          <p className="mt-1 text-lg font-black text-[#005a3c]">
                            {moeda(pagos)} <span className="text-xs font-semibold text-[#82918a]">de {moeda(t.valor_total)}</span>
                          </p>
                          {pendentes.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {pendentes.map((p) => (
                                <button
                                  key={p.id}
                                  onClick={() => abrirModalPagamento(t, p)}
                                  className="flex w-full items-center justify-between rounded-xl border border-[#d8e5dd] bg-white px-3 py-2 text-left text-xs hover:border-[#005a3c]"
                                >
                                  <span>
                                    <b>{p.descricao || `Parcela ${p.numero}`}</b>
                                    <span className="ml-2 text-[#7b8a83]">{dataBr(p.data_vencimento)}</span>
                                  </span>
                                  <span className="font-black">{moeda(p.valor)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#edf2ef] pt-4 text-xs text-[#68776f]">
                        <span className="rounded-lg bg-[#f6f9f7] px-3 py-2">Contratação: {dataBr(t.data_contratacao)}</span>
                        <span className="rounded-lg bg-[#f6f9f7] px-3 py-2">Pagamento: {formaLabel(t.forma_pagamento)}</span>
                        {t.codigo && <span className="rounded-lg bg-[#f6f9f7] px-3 py-2">Código: {t.codigo}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      {abrirCadastro && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto my-6 w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e5ece8] p-5">
              <div>
                <h2 className="text-xl font-black text-[#005a3c]">{modoCadastro === "editar" ? "Editar temporada" : "Nova temporada"}</h2>
                <p className="text-sm text-[#718078]">A temporada não gera mensalidade.</p>
              </div>
              <button onClick={() => setAbrirCadastro(false)} className="rounded-xl p-2 hover:bg-[#f4f7f5]"><X /></button>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-2">
              <div className="md:col-span-2 rounded-2xl border border-[#f2bb91] bg-[#fff8f2] p-4">
                <div className="mb-3">
                  <p className="text-sm font-extrabold text-[#b65308]">👤 Responsável pela temporada</p>
                  <p className="mt-1 text-xs text-[#7b6b60]">
                    O responsável da temporada é cadastrado aqui e não precisa ser sócio da Sociedade Guarani.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Nome completo *</span>
                    <input value={responsavelNome} onChange={(e) => setResponsavelNome(e.target.value)} placeholder="Nome do responsável" className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">CPF</span>
                    <input value={responsavelCpf} onChange={(e) => setResponsavelCpf(e.target.value)} placeholder="000.000.000-00" className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Telefone / WhatsApp</span>
                    <input value={responsavelTelefone} onChange={(e) => setResponsavelTelefone(e.target.value)} placeholder="(00) 00000-0000" className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">E-mail</span>
                    <input type="email" value={responsavelEmail} onChange={(e) => setResponsavelEmail(e.target.value)} placeholder="email@exemplo.com" className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
                  </label>
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Tipo</span>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTipo("temporada_familiar")} className={`rounded-xl border p-3 text-sm font-bold ${tipo === "temporada_familiar" ? "border-[#b65308] bg-[#ffead9] text-[#b65308]" : "border-[#d5e0da]"}`}>Familiar<br /><span className="text-xs">R$ 1.100 padrão</span></button>
                  <button type="button" onClick={() => setTipo("temporada_individual")} className={`rounded-xl border p-3 text-sm font-bold ${tipo === "temporada_individual" ? "border-[#b65308] bg-[#ffead9] text-[#b65308]" : "border-[#d5e0da]"}`}>Individual<br /><span className="text-xs">R$ 600 padrão</span></button>
                </div>
              </div>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Valor total</span>
                <input value={valor} onChange={(e) => setValor(e.target.value.replace(",", "."))} inputMode="decimal" className="w-full rounded-xl border border-[#d5e0da] px-3 py-3 text-lg font-black" />
                <span className="mt-1 block text-xs text-[#82918a]">Editável em cada venda.</span>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Início</span>
                <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Fim</span>
                <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Plano de pagamento</span>
                <select value={plano} onChange={(e) => setPlano(e.target.value as any)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3">
                  <option value="avista">À vista</option>
                  <option value="entrada_1">Entrada + 1 parcela</option>
                  <option value="entrada_2">Entrada + 2 parcelas</option>
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Forma padrão</span>
                <select value={formaPadrao} onChange={(e) => setFormaPadrao(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3">
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="boleto">Boleto</option>
                  <option value="cheque">Cheque</option>
                  <option value="debito_em_conta">Débito em conta</option>
                  <option value="transferencia">Transferência</option>
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Conta de recebimento</span>
                <select value={contaId} onChange={(e) => setContaId(e.target.value)} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3">
                  <option value="">Selecione se houver recebimento confirmado</option>
                  {contas.filter((c) => c.ativo !== false).map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</option>
                  ))}
                </select>
              </label>

              <div className="md:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-[#718078]">Parcelas</span>
                  <span className="text-xs font-bold text-[#005a3c]">{moeda(Number(valor || 0))}</span>
                </div>
                <div className="space-y-3">
                  {parcelas.map((p, i) => (
                    <div key={i} className="grid gap-3 rounded-2xl border border-[#dfe9e3] bg-[#f9fbfa] p-3 md:grid-cols-[1.2fr_.8fr_1fr_1fr_auto]">
                      <input value={p.descricao} onChange={(e) => editarParcela(i, "descricao", e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
                      <input value={p.valor} onChange={(e) => editarParcela(i, "valor", e.target.value.replace(",", "."))} inputMode="decimal" className="rounded-lg border px-3 py-2 text-sm font-bold" />
                      <input type="date" value={p.data_vencimento} onChange={(e) => editarParcela(i, "data_vencimento", e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
                      <select value={p.forma_pagamento} onChange={(e) => editarParcela(i, "forma_pagamento", e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
                        <option value="pix">PIX</option>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="boleto">Boleto</option>
                        <option value="cheque">Cheque</option>
                        <option value="debito_em_conta">Débito</option>
                        <option value="transferencia">Transferência</option>
                      </select>
                      <label className="flex items-center gap-2 text-xs font-bold text-[#50625a]">
                        <input type="checkbox" checked={p.confirmar} onChange={(e) => editarParcela(i, "confirmar", e.target.checked)} />
                        Recebida
                      </label>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[#82918a]">
                  “Recebida” cria a Entrada no Financeiro. Cheque fica em compensação e não aumenta o saldo até a baixa.
                </p>
              </div>

              {tipo === "temporada_familiar" && (
                <div className="md:col-span-2 rounded-2xl border border-[#f2bb91] bg-[#fff8f2] p-4">
                  <div className="flex items-center gap-2 font-bold text-[#b65308]"><Users className="h-4 w-4" /> Temporada familiar</div>
                  <p className="mt-1 text-xs text-[#7b6b60]">
                    Os familiares da temporada serão cadastrados como participantes da própria temporada. Eles não precisam ser sócios da Sociedade Guarani.
                  </p>
                </div>
              )}

              <label className="md:col-span-2">
                <span className="mb-1.5 block text-xs font-bold uppercase text-[#718078]">Observações</span>
                <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} className="w-full rounded-xl border border-[#d5e0da] px-3 py-3" />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#e5ece8] p-5">
              <button onClick={() => setAbrirCadastro(false)} className="rounded-xl border border-[#d5e0da] px-5 py-2.5 font-bold">Cancelar</button>
              <button disabled={salvando} onClick={() => void salvarTemporada()} className="rounded-xl bg-[#005a3c] px-5 py-2.5 font-bold text-white disabled:opacity-50">
                {salvando ? "Salvando..." : modoCadastro === "editar" ? "Salvar alterações" : "Cadastrar temporada"}
              </button>
            </div>
          </div>
        </div>
      )}

      {abrirParticipantes && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-black text-[#005a3c]">Dependentes da temporada</h2>
                <p className="text-sm text-[#718078]">{abrirParticipantes.responsavel_nome} · {abrirParticipantes.codigo || "Temporada pendente"}</p>
              </div>
              <button onClick={() => setAbrirParticipantes(null)}><X /></button>
            </div>

            <div className="space-y-5 p-5">
              <div className="rounded-2xl border border-[#f2bb91] bg-[#fff8f2] p-4">
                <p className="font-black text-[#b65308]">Titular</p>
                <p className="mt-1 font-bold">{abrirParticipantes.responsavel_nome}</p>
                <p className="mt-1 text-xs text-[#718078]">{abrirParticipantes.matricula || "TE — aguardando pagamento"}</p>
                {(() => {
                  const titular = (abrirParticipantes.participantes || []).find((p) => p.papel === "titular");
                  return titular?.id ? <div className="mt-3 flex items-center gap-3">
                    <div className="h-16 w-12 overflow-hidden rounded-lg bg-orange-50">{titular.foto_url ? <img src={titular.foto_url} alt={titular.nome || "Titular"} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center">👤</div>}</div>
                    <label className="cursor-pointer rounded-lg border border-[#d5e0da] px-3 py-2 text-xs font-bold hover:bg-white">Adicionar/trocar foto<input type="file" accept="image/*" className="hidden" disabled={salvando} onChange={(e) => { const file = e.target.files?.[0]; if (file) void salvarFotoParticipante(titular.id!, file); e.currentTarget.value = ""; }} /></label>
                  </div> : <p className="mt-2 text-xs text-[#718078]">A carteirinha do titular será criada após ativação/pagamento.</p>;
                })()}
              </div>

              <div>
                <h3 className="mb-3 font-black text-[#17382c]">Participantes cadastrados</h3>
                <div className="space-y-2">
                  {(abrirParticipantes.participantes || []).filter((p) => p.papel !== "titular").length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#d5e0da] p-4 text-sm text-[#718078]">Nenhum dependente cadastrado ainda.</div>
                  ) : (
                    (abrirParticipantes.participantes || []).filter((p) => p.papel !== "titular").map((p) => (
                      <div key={p.id || `${p.nome}-${p.matricula}`} className="flex items-center justify-between gap-3 rounded-xl border border-[#dfe9e3] p-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="h-14 w-11 shrink-0 overflow-hidden rounded-lg bg-orange-50">{p.foto_url ? <img src={p.foto_url} alt={p.nome || "Dependente"} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center">👤</div>}</div>
                          <div className="min-w-0"><p className="font-bold">{p.nome}</p><p className="text-xs text-[#718078]">{p.parentesco || "Dependente"} {p.matricula ? `· ${p.matricula}` : "· matrícula após pagamento"}</p>
                            {p.id && <label className="mt-2 inline-block cursor-pointer rounded-lg border px-2 py-1 text-xs font-bold hover:bg-[#f9fbfa]">Adicionar/trocar foto<input type="file" accept="image/*" className="hidden" disabled={salvando} onChange={(e) => { const file = e.target.files?.[0]; if (file) void salvarFotoParticipante(p.id!, file); e.currentTarget.value = ""; }} /></label>}
                          </div>
                        </div>
                        {p.id && (
                          <button onClick={() => void removerParticipante(p.id!)} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100">
                            <Trash2 className="h-4 w-4" /> Remover
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[#dfe9e3] bg-[#f9fbfa] p-4">
                <h3 className="font-black text-[#005a3c]">+ Adicionar dependente</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Nome *</span>
                    <input value={novoParticipanteNome} onChange={(e) => setNovoParticipanteNome(e.target.value)} className="w-full rounded-xl border px-3 py-3" placeholder="Nome completo" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Parentesco</span>
                    <select value={novoParticipanteParentesco} onChange={(e) => setNovoParticipanteParentesco(e.target.value)} className="w-full rounded-xl border px-3 py-3">
                      <option>Esposa</option><option>Esposo</option><option>Companheiro(a)</option><option>Filho(a)</option><option>Enteado(a)</option><option>Pai</option><option>Mãe</option><option>Irmão(ã)</option><option>Outro</option>
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">CPF</span>
                    <input value={novoParticipanteCpf} onChange={(e) => setNovoParticipanteCpf(e.target.value)} className="w-full rounded-xl border px-3 py-3" placeholder="000.000.000-00" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Telefone</span>
                    <input value={novoParticipanteTelefone} onChange={(e) => setNovoParticipanteTelefone(e.target.value)} className="w-full rounded-xl border px-3 py-3" placeholder="(55) 99999-9999" />
                  </label>
                </div>
                <button onClick={() => void adicionarParticipante()} disabled={salvando} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  <UserPlus className="h-4 w-4" /> Adicionar dependente
                </button>
              </div>
            </div>

            <div className="flex justify-end border-t p-5">
              <button onClick={() => setAbrirParticipantes(null)} className="rounded-xl border px-5 py-2.5 font-bold">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {abrirCarteirinhas && (
        <div className="fixed inset-0 z-[115] overflow-y-auto bg-black/50 p-4">
          <div className="mx-auto my-6 w-full max-w-4xl rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5 print:hidden">
              <div>
                <h2 className="text-lg font-black text-[#005a3c]">Carteirinhas da temporada</h2>
                <p className="text-sm text-[#718078]">Temporada {abrirCarteirinhas.codigo}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={imprimirCarteirinhas} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-2.5 text-sm font-bold text-white">
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
                <button onClick={() => setAbrirCarteirinhas(null)} className="rounded-xl border px-3 py-2"><X /></button>
              </div>
            </div>

            <div className="grid gap-5 p-6 sm:grid-cols-2">
              {(abrirCarteirinhas.participantes || []).map((p, index) => {
                const statusCartao = statusCarteirinhaTemporada(abrirCarteirinhas);
                return <div key={p.id || `${p.nome}-${index}`} className="overflow-hidden rounded-3xl border-2 border-[#f2bb91] bg-gradient-to-br from-[#fff8f2] to-white shadow-sm">
                  <div className="flex items-center justify-between bg-[#e87511] p-4 text-white">
                    <div><p className="text-[10px] font-black uppercase tracking-widest">Sociedade Recreativa Guarani</p><p className="mt-1 text-sm font-black">CARTEIRA DE TEMPORADA</p></div>
                    <div className="rounded-xl bg-white/20 px-3 py-2 text-xs font-black">TE</div>
                  </div>
                  <div className="p-5">
                    <div className="flex gap-3">
                      <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-orange-50">{p.foto_url ? <img src={p.foto_url} alt={p.nome || "Participante"} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">👤</div>}</div>
                      <div className="min-w-0"><p className="text-lg font-black text-[#17382c]">{p.nome || "Participante"}</p><p className="mt-1 text-sm font-black text-[#005a3c]">{p.matricula || "Matrícula pendente"}</p><p className="mt-1 text-xs text-[#718078]">{p.parentesco || (p.papel === "titular" ? "Titular" : "Dependente")}</p><p className="mt-1 text-xs text-[#718078]">Validade: {dataBr(abrirCarteirinhas.inicio)} até {dataBr(abrirCarteirinhas.fim)}</p></div>
                    </div>
                    <div className={`mt-4 rounded-lg p-2 text-center text-xs font-black ${statusCartao.bloqueada ? "bg-red-100 text-red-700" : statusCartao.ativa ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>{statusCartao.texto}</div>
                    <div className="mt-4 flex items-center justify-center border-t border-[#f2bb91] pt-4"><QRCodeSVG value={p.id ? `guarani:temporada-participante:${p.id}` : `guarani:temporada:${abrirCarteirinhas.id}`} size={112} includeMargin /></div>
                  </div>
                </div>;
              })}
            </div>
          </div>
        </div>
      )}

      {abrirPagamento && temporadaPagamento && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-black text-[#005a3c]">Confirmar pagamento</h2>
                <p className="text-sm text-[#718078]">{temporadaPagamento.responsavel_nome || "Responsável não informado"} · {abrirPagamento.descricao}</p>
              </div>
              <button onClick={() => setAbrirPagamento(null)}><X /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-2xl bg-[#f6f9f7] p-4">
                <p className="text-xs font-bold uppercase text-[#7b8a83]">Valor</p>
                <p className="text-2xl font-black text-[#005a3c]">{moeda(abrirPagamento.valor)}</p>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Data do pagamento</span>
                <input type="date" value={pagamentoData} onChange={(e) => setPagamentoData(e.target.value)} className="w-full rounded-xl border px-3 py-3" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Forma</span>
                <select value={pagamentoForma} onChange={(e) => setPagamentoForma(e.target.value)} className="w-full rounded-xl border px-3 py-3">
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="boleto">Boleto</option>
                  <option value="cheque">Cheque</option>
                  <option value="debito_em_conta">Débito em conta</option>
                  <option value="transferencia">Transferência</option>
                </select>
              </label>
              {pagamentoForma !== "cheque" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Conta de recebimento</span>
                  <select value={pagamentoConta} onChange={(e) => setPagamentoConta(e.target.value)} className="w-full rounded-xl border px-3 py-3">
                    <option value="">Selecione...</option>
                    {contas.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</option>)}
                  </select>
                </label>
              )}
              {pagamentoForma === "cheque" && (
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase text-[#718078]">Número do cheque</span>
                  <input value={chequeNumero} onChange={(e) => setChequeNumero(e.target.value)} className="w-full rounded-xl border px-3 py-3" />
                </label>
              )}
              <div className="rounded-xl bg-[#fff8f2] p-3 text-xs text-[#7b6b60]">
                PIX/dinheiro/transferência/boleto confirmado gera uma <b>Entrada</b> vinculada à parcela. Cheque fica como <b>em compensação</b>.
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t p-5">
              <button onClick={() => setAbrirPagamento(null)} className="rounded-xl border px-5 py-2.5 font-bold">Cancelar</button>
              <button disabled={salvando} onClick={() => void confirmarPagamento()} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-5 py-2.5 font-bold text-white disabled:opacity-50">
                <CheckCircle2 className="h-4 w-4" />
                {salvando ? "Registrando..." : "Confirmar pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          [class*="z-[115]"], [class*="z-[115]"] * { visibility: visible !important; }
          [class*="z-[115]"] { position: static !important; background: white !important; padding: 0 !important; }
          [class*="z-[115]"] > div { box-shadow: none !important; max-width: none !important; margin: 0 !important; }
          @page { margin: 10mm; }
        }
      `}</style>
    </main>
  );
}
