"use client";

import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { IdCard, Printer, Search, ShieldCheck, Smartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import { normalizarPoliticaInadimplencia, POLITICA_INADIMPLENCIA_PADRAO, type PoliticaInadimplencia } from "@/lib/politicaInadimplencia";

type Dependente = {
  id: string;
  socio_id: string;
  nome: string;
  cpf?: string | null;
  parentesco?: string | null;
  ativo?: boolean | null;
  titular_nome?: string | null;
  titular_matricula?: number | string | null;
  matricula?: number | string | null;
  foto_url?: string | null;
  situacao?: string | null;
  exame_medico_validade?: string | null;
  financeiro_status?: "em_dia" | "atrasado" | "muito_atrasado" | "restrito";
  dias_atraso?: number;
  meses_atraso?: number;
  meses_atencao?: number;
  meses_bloqueio?: number;
};

type Temporada = {
  id: string;
  matricula?: string | null;
  codigo?: string | null;
  tipo?: string | null;
  modalidade?: string | null;
  inicio?: string | null;
  fim?: string | null;
  valor_total?: number | null;
  situacao?: string | null;
  responsavel_nome?: string | null;
  responsavel_cpf?: string | null;
  status_carteirinha?: "ativa" | "bloqueada" | "inativa" | string;
  status_carteirinha_texto?: string;
  parcelas_atrasadas?: number;
  valor_parcelas_atrasadas?: number;
  participantes?: Array<{
    id: string;
    temporada_id?: string;
    matricula?: string | null;
    nome?: string | null;
    cpf?: string | null;
    foto_url?: string | null;
    papel?: string | null;
    parentesco?: string | null;
    status_carteirinha?: "ativa" | "bloqueada" | "inativa" | string;
    status_carteirinha_texto?: string;
    exame_medico_validade?: string | null;
  }>;
};

type Socio = {
  id: string;
  matricula: number | string | null;
  nome: string;
  cpf?: string | null;
  categoria: string | null;
  tipo_socio: string | null;
  situacao: string | null;
  data_associacao: string | null;
  foto_url: string | null;
  inicio_temporada: string | null;
  fim_temporada: string | null;
  exame_medico_validade?: string | null;
  responsavel_id?: string | null;
  parentesco?: string | null;
  possui_mensalidade?: boolean | null;
  financeiro_status?: "em_dia" | "atrasado" | "muito_atrasado" | "restrito";
  dias_atraso?: number;
  meses_atraso?: number;
  meses_atencao?: number;
  meses_bloqueio?: number;
};

function visual(tipo: string | null) {
  const t = String(tipo || "").toLowerCase();
  if (t.startsWith("patrimonial")) return { nome: "Patrimonial", bg: "#1769aa", text: "#ffffff" };
  if (t.startsWith("contribuinte")) return { nome: "Contribuinte", bg: "#18864b", text: "#ffffff" };
  if (t.startsWith("temporada")) return { nome: "Temporada", bg: "#e87511", text: "#ffffff" };
  if (t.includes("transitorio") || t.includes("temporario")) return { nome: "Temporário", bg: "#eab308", text: "#17382c" };
  if (t.startsWith("convite")) return { nome: "Convite", bg: "#6b7280", text: "#ffffff" };
  return { nome: "Associado", bg: "#005a3c", text: "#ffffff" };
}

function formatarData(valor: string | null) {
  if (!valor) return "—";
  const texto = String(valor).slice(0, 10);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00`) : new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function statusExame(valor: string | null | undefined) {
  if (!valor) {
    return { texto: "NÃO INFORMADO", ponto: "bg-gray-400", textoClasse: "text-gray-600" };
  }
  const data = new Date(`${String(valor).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(data.getTime())) {
    return { texto: "DATA INVÁLIDA", ponto: "bg-gray-400", textoClasse: "text-gray-600" };
  }
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (data < hoje) {
    return { texto: `VENCIDO EM ${formatarData(valor)}`, ponto: "bg-red-500", textoClasse: "text-red-700" };
  }
  return { texto: `VÁLIDO ATÉ ${formatarData(valor)}`, ponto: "bg-emerald-500", textoClasse: "text-emerald-700" };
}

function formatarCpf(valor: string | null | undefined) {
  if (!valor) return "—";
  const digits = valor.replace(/\D/g, "");
  if (digits.length !== 11) return valor;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

type CartaoLote = {
  key: string;
  id: string;
  tipo: "socio" | "dependente" | "temporada";
  nome: string;
  matricula: string;
  cpf: string;
  categoria: string;
  parentesco: string;
  titular: string;
  fotoUrl: string | null;
  qrValue: string;
  cor: string;
  textoCor: string;
  situacao: string;
  validade: string | null;
  exame: string | null;
  ordemFamilia: string;
};

function sobrenomeDe(nome: string) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  return partes.length > 1 ? partes[partes.length - 1] : (partes[0] || "#");
}

function escaparXml(valor: unknown) {
  return String(valor ?? "").replace(/[&<>\"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === "\"") return "&quot;";
    return "&apos;";
  });
}

export default function CarteirinhasPage(): JSX.Element {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [temporadas, setTemporadas] = useState<Temporada[]>([]);
  const [temporadaSelecionada, setTemporadaSelecionada] = useState<Temporada | null>(null);
  const [participanteTemporadaSelecionado, setParticipanteTemporadaSelecionado] = useState<NonNullable<Temporada["participantes"]>[number] | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "inativos" | "exame_vencido">("todos");
  const [selecionado, setSelecionado] = useState<Socio | null>(null);
  const [dependenteSelecionado, setDependenteSelecionado] = useState<Dependente | null>(null);
  const [erro, setErro] = useState("");
  const [politicaInadimplencia, setPoliticaInadimplencia] = useState<PoliticaInadimplencia>(POLITICA_INADIMPLENCIA_PADRAO);
  const [camposVisiveis, setCamposVisiveis] = useState({ financeiro: true, exameMedico: true });
  const [digitalAberta, setDigitalAberta] = useState(false);
  const [modoQr, setModoQr] = useState(false);
  const [indiceAberto, setIndiceAberto] = useState(false);
  const [loteImpressaoMontado, setLoteImpressaoMontado] = useState(false);
  const [cartoesSelecionados, setCartoesSelecionados] = useState<string[]>([]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams(window.location.search);
      const idQr = params.get("id") || "";
      const dependenteQr = params.get("dependente_id") || "";
      const temporadaQr = params.get("temporada_id") || "";

      if (!session) {
        const destino = `/carteirinhas?id=${encodeURIComponent(idQr)}`;
        location.replace(`/login?redirect=${encodeURIComponent(destino)}`);
        return;
      }

      const r = await fetch("/api/carteirinhas", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) {
        if (ativo) setErro(d.error || "Erro ao carregar carteirinhas.");
        return;
      }

      const listaSocios: Socio[] = d.socios || [];
      const listaTemporadas: Temporada[] = d.temporadas || [];
      if (ativo) {
        setSocios(listaSocios);
        setDependentes(d.dependentes || []);
        setTemporadas(listaTemporadas);
        setCamposVisiveis({
          financeiro: d.camposVisiveis?.financeiro !== false,
          exameMedico: d.camposVisiveis?.exameMedico !== false,
        });
        setPoliticaInadimplencia(normalizarPoliticaInadimplencia(d.politicaInadimplencia));
        const socioQr = idQr ? listaSocios.find((s) => String(s.id) === String(idQr)) : null;
        const dependenteQrObj = dependenteQr ? (d.dependentes || []).find((dep: Dependente) => String(dep.id) === String(dependenteQr)) : null;
        const temporadaQrObj = temporadaQr ? listaTemporadas.find((t: Temporada) => String(t.id) === String(temporadaQr)) : null;
        if (temporadaQrObj) {
          setTemporadaSelecionada(temporadaQrObj);
          setParticipanteTemporadaSelecionado(temporadaQrObj.participantes?.find((p) => p.papel === "titular") || temporadaQrObj.participantes?.[0] || null);
          setSelecionado(null);
          setDependenteSelecionado(null);
          setModoQr(true);
        } else if (socioQr) {
          setSelecionado(socioQr);
          setDependenteSelecionado(null);
          setModoQr(true);
        } else if (dependenteQrObj) {
          setSelecionado(null);
          setDependenteSelecionado(dependenteQrObj);
          setModoQr(true);
        } else if (listaSocios.length === 1) setSelecionado(listaSocios[0]);
      }

    })();
    return () => { ativo = false; };
  }, []);

  const normalizarBusca = (valor: unknown) =>
    String(valor ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const buscaNormalizada = useMemo(() => normalizarBusca(busca), [busca]);
  const buscaCpf = useMemo(() => buscaNormalizada.replace(/\D/g, ""), [buscaNormalizada]);

  const lista = useMemo(() => socios.filter((s) => {
    const q = buscaNormalizada;
    const qCpf = buscaCpf;
    const nome = normalizarBusca(s.nome);
    const matricula = normalizarBusca(s.matricula);
    const cpf = String(s.cpf || "").replace(/\D/g, "");
    const correspondeBusca = !q || nome.includes(q) || matricula.includes(q) || (qCpf.length > 0 && cpf.includes(qCpf));
    if (!correspondeBusca) return false;
    const ativo = String(s.situacao || "").toLowerCase() !== "inativo";
    if (filtroStatus === "ativos") return ativo;
    if (filtroStatus === "inativos") return !ativo;
    if (filtroStatus === "exame_vencido") return Boolean(s.exame_medico_validade) && new Date(`${String(s.exame_medico_validade).slice(0,10)}T00:00:00`) < new Date(new Date().toISOString().slice(0,10) + "T00:00:00");
    return true;
  }), [socios, buscaNormalizada, buscaCpf, filtroStatus]);

  const dependentesLista = useMemo(() => dependentes.filter((d) => {
    const q = buscaNormalizada;
    const matricula = normalizarBusca(d.matricula);
    return !q || d.nome.toLowerCase().includes(q) || matricula.includes(q) || String(d.titular_matricula || "").includes(q) || String(d.titular_nome || "").toLowerCase().includes(q);
  }), [dependentes, buscaNormalizada]);

  // Quando um associado é selecionado, mostra somente o grupo familiar dele.
  // A árvore é tratada como uma rede: responsável -> dependente e também
  // dependente -> responsável, permitindo abrir a mesma família ao clicar
  // no titular, no cônjuge ou em qualquer filho.
  const familiaSelecionada = useMemo(() => {
    if (!selecionado) return [] as Socio[];

    const familia = new Set<string>([String(selecionado.id)]);
    let mudou = true;

    while (mudou) {
      mudou = false;
      for (const membro of socios) {
        const id = String(membro.id);
        const responsavel = membro.responsavel_id ? String(membro.responsavel_id) : "";
        const estaNaFamilia = familia.has(id) || (responsavel && familia.has(responsavel));

        if (estaNaFamilia && !familia.has(id)) {
          familia.add(id);
          mudou = true;
        }

        if (responsavel && familia.has(id) && !familia.has(responsavel)) {
          familia.add(responsavel);
          mudou = true;
        }
      }
    }

    return socios
      .filter((s) => familia.has(String(s.id)) && String(s.id) !== String(selecionado.id))
      .filter((s) => String(s.situacao || "").toLowerCase() !== "inativo")
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  }, [socios, selecionado]);

  const dependentesFamiliaSelecionada = useMemo(() => {
    if (!selecionado) return [] as Dependente[];
    return dependentes
      .filter((d) => String(d.socio_id) === String(selecionado.id) && d.ativo !== false)
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
  }, [dependentes, selecionado]);

  const temporadasLista = useMemo(() => {
    const q = buscaNormalizada;
    return temporadas.filter((t) => {
      if (!q) return true;
      return normalizarBusca(t.responsavel_nome).includes(q)
        || normalizarBusca(t.matricula).includes(q)
        || normalizarBusca(t.codigo).includes(q)
        || (t.participantes || []).some((p) => normalizarBusca(p.nome).includes(q) || normalizarBusca(p.matricula).includes(q));
    });
  }, [temporadas, buscaNormalizada]);

  const indiceFamilias = useMemo(() => {
    const sociosPorId = new Map(socios.map((s) => [String(s.id), s]));
    const familias = new Map<string, { titular: Socio; socios: Socio[]; dependentes: Dependente[] }>();

    const obterTitular = (socio: Socio) => {
      let atual = socio;
      const vistos = new Set<string>([String(socio.id)]);
      while (atual.responsavel_id) {
        const responsavel = sociosPorId.get(String(atual.responsavel_id));
        if (!responsavel || vistos.has(String(responsavel.id))) break;
        atual = responsavel;
        vistos.add(String(atual.id));
      }
      return atual;
    };

    for (const socio of socios) {
      const titular = obterTitular(socio);
      const chave = String(titular.id);
      if (!familias.has(chave)) familias.set(chave, { titular, socios: [], dependentes: [] });
      familias.get(chave)!.socios.push(socio);
    }

    for (const dependente of dependentes) {
      const socioVinculado = sociosPorId.get(String(dependente.socio_id));
      const titular = socioVinculado ? obterTitular(socioVinculado) : null;
      const chave = titular ? String(titular.id) : `dep-${dependente.socio_id || dependente.id}`;
      if (!familias.has(chave)) {
        if (!titular) continue;
        familias.set(chave, { titular, socios: [titular], dependentes: [] });
      }
      familias.get(chave)!.dependentes.push(dependente);
    }

    return Array.from(familias.values())
      .map((familia) => ({
        ...familia,
        socios: familia.socios.filter((s) => String(s.id) !== String(familia.titular.id)).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")),
        dependentes: familia.dependentes.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR")),
      }))
      .sort((a, b) => sobrenomeDe(a.titular.nome).localeCompare(sobrenomeDe(b.titular.nome), "pt-BR") || a.titular.nome.localeCompare(b.titular.nome, "pt-BR"));
  }, [socios, dependentes]);

  const indicePorSobrenome = useMemo(() => {
    const grupos = new Map<string, { letra: string; sobrenome: string; familias: typeof indiceFamilias }>();
    for (const familia of indiceFamilias) {
      const sobrenome = sobrenomeDe(familia.titular.nome).toLocaleUpperCase("pt-BR");
      const chave = sobrenome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const letra = chave.charAt(0) || "#";
      if (!grupos.has(chave)) grupos.set(chave, { letra, sobrenome, familias: [] });
      grupos.get(chave)!.familias.push(familia);
    }
    return Array.from(grupos.values()).sort((a, b) => a.sobrenome.localeCompare(b.sobrenome, "pt-BR"));
  }, [indiceFamilias]);

  const cartoesParaImpressao = useMemo<CartaoLote[]>(() => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const cartoes: CartaoLote[] = [];
    const sociosPorId = new Map(socios.map((s) => [String(s.id), s]));
    const obterTitular = (socio: Socio) => {
      let atual = socio;
      const vistos = new Set<string>([String(socio.id)]);
      while (atual.responsavel_id) {
        const pai = sociosPorId.get(String(atual.responsavel_id));
        if (!pai || vistos.has(String(pai.id))) break;
        atual = pai;
        vistos.add(String(atual.id));
      }
      return atual;
    };

    socios.filter((s) => String(s.situacao || "").toLowerCase() !== "inativo").forEach((s) => {
      const titular = obterTitular(s);
      const cor = visual(s.tipo_socio);
      cartoes.push({
        key: `socio-${s.id}`, id: String(s.id), tipo: "socio", nome: s.nome,
        matricula: String(s.matricula || "—"), cpf: formatarCpf(s.cpf), categoria: cor.nome,
        parentesco: s.parentesco || "", titular: titular.nome, fotoUrl: s.foto_url,
        qrValue: `${baseUrl}/acessos/validar?id=${encodeURIComponent(s.id)}`,
        cor: cor.bg, textoCor: cor.text, situacao: s.situacao || "Ativo",
        validade: s.fim_temporada, exame: s.exame_medico_validade || null,
        ordemFamilia: titular.nome,
      });
    });

    dependentes.filter((d) => d.ativo !== false && String(d.situacao || "").toLowerCase() !== "inativo").forEach((d) => {
      const socioVinculado = sociosPorId.get(String(d.socio_id));
      const titular = socioVinculado ? obterTitular(socioVinculado) : null;
      cartoes.push({
        key: `dependente-${d.id}`, id: String(d.id), tipo: "dependente", nome: d.nome,
        matricula: String(d.matricula || "—"), cpf: formatarCpf(d.cpf), categoria: "Dependente",
        parentesco: d.parentesco || "Família", titular: titular?.nome || d.titular_nome || "—",
        fotoUrl: d.foto_url || null,
        qrValue: `${baseUrl}/acessos/validar?id=${encodeURIComponent(d.id)}`,
        cor: "#005a3c", textoCor: "#ffffff", situacao: d.situacao || "Vinculado ao titular",
        validade: null, exame: d.exame_medico_validade || null,
        ordemFamilia: titular?.nome || d.titular_nome || d.nome,
      });
    });

    temporadas.forEach((temporada) => (temporada.participantes || []).forEach((p) => {
      const statusEfetivo = String(p.status_carteirinha || temporada.status_carteirinha || "").toLowerCase();
      // Só participantes explicitamente ativos entram na seleção e impressão em lote.
      if (statusEfetivo !== "ativa") return;
      const cor = visual("temporada");
      cartoes.push({
        key: `temporada-${p.id}`, id: String(p.id), tipo: "temporada",
        nome: p.nome || temporada.responsavel_nome || "Participante",
        matricula: String(p.matricula || temporada.matricula || "—"),
        cpf: formatarCpf(p.cpf || temporada.responsavel_cpf), categoria: p.parentesco || (p.papel === "titular" ? "Titular da temporada" : "Temporada"),
        parentesco: p.parentesco || "", titular: temporada.responsavel_nome || "—", fotoUrl: p.foto_url || null,
        qrValue: `guarani:temporada-participante:${p.id}`,
        cor: cor.bg, textoCor: cor.text,
        situacao: p.status_carteirinha_texto || temporada.status_carteirinha_texto || temporada.situacao || "Não informada",
        validade: temporada.fim || null, exame: p.exame_medico_validade || null,
        ordemFamilia: temporada.responsavel_nome || p.nome || "",
      });
    }));

    return cartoes.sort((a, b) => sobrenomeDe(a.ordemFamilia).localeCompare(sobrenomeDe(b.ordemFamilia), "pt-BR")
      || a.ordemFamilia.localeCompare(b.ordemFamilia, "pt-BR")
      || (a.nome === a.ordemFamilia ? -1 : b.nome === b.ordemFamilia ? 1 : a.nome.localeCompare(b.nome, "pt-BR")));
  }, [socios, dependentes, temporadas]);

  const cartoesSelecionadosParaImpressao = useMemo(
    () => cartoesParaImpressao.filter((cartao) => cartoesSelecionados.includes(cartao.key)),
    [cartoesParaImpressao, cartoesSelecionados],
  );

  useEffect(() => {
    const chavesAtivas = new Set(cartoesParaImpressao.map((cartao) => cartao.key));
    setCartoesSelecionados((atuais) => atuais.filter((chave) => chavesAtivas.has(chave)));
  }, [cartoesParaImpressao]);

  useEffect(() => {
    if (!loteImpressaoMontado) return;
    let cancelado = false;
    const frame = window.requestAnimationFrame(() => {
      void (async () => {
        const raiz = document.querySelector<HTMLElement>(".print-lote-root");
        if (!raiz) {
          setErro("Não foi possível preparar as carteirinhas para impressão.");
          setLoteImpressaoMontado(false);
          return;
        }
        const imagens = Array.from(raiz.querySelectorAll("img"));
        await Promise.all(imagens.map((img) => img.decode().catch(() => undefined)));
        if (cancelado) return;
        const limpar = prepararImpressao("print-all-mode");
        window.print();
        window.setTimeout(() => {
          limpar();
          setLoteImpressaoMontado(false);
        }, 1500);
      })();
    });
    return () => {
      cancelado = true;
      window.cancelAnimationFrame(frame);
    };
  }, [loteImpressaoMontado, cartoesSelecionadosParaImpressao.length]);

  const contadores = useMemo(() => {
    let ativos = 0;
    let inativos = 0;
    let examesVencidos = 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    for (const socio of socios) {
      const ativo = String(socio.situacao || "").toLowerCase() !== "inativo";
      if (ativo) ativos += 1;
      else inativos += 1;

      if (socio.exame_medico_validade) {
        const data = new Date(`${String(socio.exame_medico_validade).slice(0, 10)}T00:00:00`);
        if (!Number.isNaN(data.getTime()) && data < hoje) examesVencidos += 1;
      }
    }

    return { ativos, inativos, examesVencidos };
  }, [socios]);

  const v = selecionado ? visual(selecionado.tipo_socio) : visual(null);
  const validade = selecionado?.fim_temporada || null;
  const statusFinanceiro = selecionado?.financeiro_status || "em_dia";
  const statusFinanceiroLabel = statusFinanceiro === "em_dia" ? "EM DIA" : statusFinanceiro === "atrasado" ? "ATENÇÃO" : statusFinanceiro === "restrito" ? "RESTRITO" : "BLOQUEIO";
  const statusFinanceiroClass = statusFinanceiro === "em_dia" ? "bg-emerald-500" : statusFinanceiro === "atrasado" ? "bg-yellow-400" : statusFinanceiro === "restrito" ? "bg-gray-400" : "bg-red-500";
  const mesesSelecionado = Number(selecionado?.meses_atraso || 0);
  const statusFinanceiroText = statusFinanceiro === "atrasado"
    ? `${mesesSelecionado} competência(s) vencida(s) — atenção; entrada liberada`
    : statusFinanceiro === "muito_atrasado"
      ? `${mesesSelecionado} competência(s) vencida(s) — bloqueio a partir de ${politicaInadimplencia.meses_bloqueio}`
      : mesesSelecionado > 0
        ? `${mesesSelecionado} competência(s) vencida(s) — dentro da tolerância (verde até ${politicaInadimplencia.meses_atencao - 1})`
        : "Nenhuma competência vencida";
  const qrValue = selecionado ? `${typeof window !== "undefined" ? window.location.origin : ""}/acessos/validar?id=${encodeURIComponent(selecionado.id)}` : "";
  const participanteTemporadaAtual = participanteTemporadaSelecionado || temporadaSelecionada?.participantes?.find((p) => p.papel === "titular") || temporadaSelecionada?.participantes?.[0] || null;
  const temporadaQrValue = temporadaSelecionada
    ? participanteTemporadaAtual?.id
      ? `guarani:temporada-participante:${participanteTemporadaAtual.id}`
      : `guarani:temporada:${temporadaSelecionada.id}`
    : "";
  const temporadaValidade = temporadaSelecionada?.fim || null;
  const statusTemporadaTexto = participanteTemporadaAtual?.status_carteirinha_texto || temporadaSelecionada?.status_carteirinha_texto || (temporadaSelecionada?.situacao || "Situação não informada");
  const statusTemporadaAtiva = (participanteTemporadaAtual?.status_carteirinha || temporadaSelecionada?.status_carteirinha) === "ativa";
  const statusTemporadaBloqueada = (participanteTemporadaAtual?.status_carteirinha || temporadaSelecionada?.status_carteirinha) === "bloqueada";
  const exame = statusExame(selecionado?.exame_medico_validade);
  const exameTemporada = statusExame(participanteTemporadaAtual?.exame_medico_validade);

  function prepararImpressao(modo: "print-all-mode" | "print-index-mode") {
    const classes = ["print-all-mode", "print-index-mode"];
    classes.forEach((classe) => document.body.classList.remove(classe));
    document.body.classList.add(modo);
    const limpar = () => {
      document.body.classList.remove(modo);
      window.removeEventListener("afterprint", limpar);
    };
    window.addEventListener("afterprint", limpar);
    return limpar;
  }

  function selecionarTodasAtivas() {
    setCartoesSelecionados(cartoesParaImpressao.map((cartao) => cartao.key));
  }

  function alternarSelecaoCartao(chave: string) {
    setCartoesSelecionados((atuais) => atuais.includes(chave)
      ? atuais.filter((item) => item !== chave)
      : [...atuais, chave]);
  }

  function limparSelecaoCartoes() {
    setCartoesSelecionados([]);
  }

  function imprimirCarteirinhasSelecionadas() {
    if (!cartoesSelecionadosParaImpressao.length || loteImpressaoMontado) return;
    setErro("");
    setLoteImpressaoMontado(true);
  }

  function imprimirIndice() {
    const limpar = prepararImpressao("print-index-mode");
    window.print();
    window.setTimeout(limpar, 1500);
  }

  async function baixarCarteirinhaDigital() {
    let cartao: { nome: string; matricula: string; cpf: string; categoria: string; situacao: string; validade: string | null; fotoUrl: string | null; cor: string; textoCor: string; chaveQr: string } | null = null;
    if (temporadaSelecionada && participanteTemporadaAtual) {
      cartao = { nome: participanteTemporadaAtual.nome || temporadaSelecionada.responsavel_nome || "Participante", matricula: String(participanteTemporadaAtual.matricula || temporadaSelecionada.matricula || "—"), cpf: formatarCpf(participanteTemporadaAtual.cpf || temporadaSelecionada.responsavel_cpf), categoria: participanteTemporadaAtual.parentesco || "Temporada", situacao: participanteTemporadaAtual.status_carteirinha_texto || statusTemporadaTexto, validade: temporadaSelecionada.fim || null, fotoUrl: participanteTemporadaAtual.foto_url || null, cor: "#e87511", textoCor: "#ffffff", chaveQr: "temporada-atual" };
    } else if (dependenteSelecionado) {
      cartao = { nome: dependenteSelecionado.nome, matricula: String(dependenteSelecionado.matricula || "—"), cpf: formatarCpf(dependenteSelecionado.cpf), categoria: `Dependente · ${dependenteSelecionado.parentesco || "Família"}`, situacao: dependenteSelecionado.situacao || "Vinculado ao titular", validade: null, fotoUrl: dependenteSelecionado.foto_url || null, cor: "#005a3c", textoCor: "#ffffff", chaveQr: `dependente-atual-${dependenteSelecionado.id}` };
    } else if (selecionado) {
      cartao = { nome: selecionado.nome, matricula: String(selecionado.matricula || "—"), cpf: formatarCpf(selecionado.cpf), categoria: visual(selecionado.tipo_socio).nome, situacao: selecionado.situacao || "Não informada", validade: selecionado.fim_temporada, fotoUrl: selecionado.foto_url || null, cor: visual(selecionado.tipo_socio).bg, textoCor: visual(selecionado.tipo_socio).text, chaveQr: `socio-atual-${selecionado.id}` };
    }
    if (!cartao) return;

    const qrElemento = document.querySelector<SVGSVGElement>(`svg[data-carteirinha-qr="${cartao.chaveQr}"]`);
    if (!qrElemento) {
      setErro("Não foi possível localizar o QR Code desta carteirinha para exportar.");
      return;
    }

    const imagemComoDataUri = async (origem: string) => {
      if (!origem) return "";
      try {
        const resposta = await fetch(origem, { mode: "cors", credentials: "omit" });
        if (!resposta.ok) return origem;
        const blob = await resposta.blob();
        if (!blob.type.startsWith("image/")) return origem;
        return await new Promise<string>((resolve, reject) => {
          const leitor = new FileReader();
          leitor.onload = () => resolve(String(leitor.result || origem));
          leitor.onerror = () => reject(new Error("Falha ao carregar imagem"));
          leitor.readAsDataURL(blob);
        });
      } catch {
        // Se o servidor de fotos não liberar CORS, conserva o endereço público.
        return origem;
      }
    };
    const fotoHref = await imagemComoDataUri(cartao.fotoUrl || "");
    const logoOrigem = `${window.location.origin}/logo-guarani.png`;
    const logoHref = await imagemComoDataUri(logoOrigem);

    const qrSvg = qrElemento.outerHTML
      .replace(/class="[^"]*"/g, "")
      .replace(/data-carteirinha-qr="[^"]*"/g, "")
      .replace(/style="[^"]*"/g, "")
      .replace(/width="[^"]*"/, 'x="680" width="150"')
      .replace(/height="[^"]*"/, 'y="145" height="150"');
    const cor = escaparXml(cartao.cor);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="85.6mm" height="53.98mm" viewBox="0 0 856 540">
<rect x="4" y="4" width="848" height="532" rx="34" fill="#ffffff" stroke="${cor}" stroke-width="9"/>
<path d="M20 20h816v92H20z" rx="20" fill="${cor}"/>
<image x="35" y="28" width="70" height="70" href="${escaparXml(logoHref)}" xlink:href="${escaparXml(logoHref)}" preserveAspectRatio="xMidYMid meet"/>
<text x="125" y="55" fill="${escaparXml(cartao.textoCor)}" font-family="Arial,sans-serif" font-size="20" font-weight="700">SOCIEDADE RECREATIVA GUARANI</text>
<text x="125" y="87" fill="${escaparXml(cartao.textoCor)}" font-family="Arial,sans-serif" font-size="27" font-weight="800">CARTEIRA DIGITAL</text>
<rect x="30" y="135" width="145" height="185" rx="16" fill="#eef2f0"/>
${fotoHref ? `<image x="30" y="135" width="145" height="185" href="${escaparXml(fotoHref)}" xlink:href="${escaparXml(fotoHref)}" preserveAspectRatio="xMidYMid slice"/>` : `<text x="102" y="235" text-anchor="middle" font-size="58">👤</text>`}
<text x="195" y="166" fill="#17382c" font-family="Arial,sans-serif" font-size="29" font-weight="800">${escaparXml(cartao.nome.slice(0, 30))}</text>
<text x="195" y="211" fill="#4b5563" font-family="Arial,sans-serif" font-size="21">Matrícula: ${escaparXml(cartao.matricula)}</text>
<text x="195" y="250" fill="#4b5563" font-family="Arial,sans-serif" font-size="19">CPF: ${escaparXml(cartao.cpf)}</text>
<rect x="195" y="273" width="240" height="38" rx="18" fill="${cor}"/>
<text x="315" y="299" text-anchor="middle" fill="${escaparXml(cartao.textoCor)}" font-family="Arial,sans-serif" font-size="18" font-weight="700">${escaparXml(cartao.categoria.slice(0, 25))}</text>
<text x="30" y="380" fill="#6b7280" font-family="Arial,sans-serif" font-size="16">SITUAÇÃO</text>
<text x="30" y="410" fill="#17382c" font-family="Arial,sans-serif" font-size="20" font-weight="700">${escaparXml(cartao.situacao.slice(0, 35))}</text>
<text x="30" y="455" fill="#6b7280" font-family="Arial,sans-serif" font-size="16">VALIDADE</text>
<text x="30" y="485" fill="#17382c" font-family="Arial,sans-serif" font-size="19">${escaparXml(cartao.validade ? formatarData(cartao.validade) : "Conforme cadastro")}</text>
${qrSvg}
<text x="755" y="330" text-anchor="middle" fill="#4b5563" font-family="Arial,sans-serif" font-size="14">QR DE ACESSO</text>
</svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `carteirinha-${cartao.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function imprimirCarteirinha() {
    if (!selecionado && !temporadaSelecionada && !dependenteSelecionado) return;
    document.body.classList.remove("print-all-mode", "print-index-mode");
    window.print();
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }

          body.print-all-mode *, body.print-index-mode * { visibility: hidden !important; }
          body.print-all-mode .print-lote-root,
          body.print-all-mode .print-lote-root *,
          body.print-index-mode .print-index-root,
          body.print-index-mode .print-index-root * { visibility: visible !important; }
          .print-lote-root, .print-index-root { display: none !important; }
          body.print-all-mode .print-lote-root { display: block !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 194mm !important; }
          body.print-index-mode .print-index-root { display: block !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 194mm !important; padding: 0 !important; color: #111 !important; background: #fff !important; }

          body:not(.print-all-mode):not(.print-index-mode) * { visibility: hidden !important; }
          body:not(.print-all-mode):not(.print-index-mode) .print-carteirinha,
          body:not(.print-all-mode):not(.print-index-mode) .print-carteirinha * { visibility: visible !important; }
          body:not(.print-all-mode):not(.print-index-mode) .print-carteirinha { position: absolute !important; left: 50% !important; top: 12mm !important; transform: translateX(-50%) !important; width: 85.60mm !important; height: 53.98mm !important; margin: 0 !important; border-width: 0.6mm !important; border-radius: 4mm !important; box-shadow: none !important; overflow: hidden !important; page-break-inside: avoid !important; font-size: 7px !important; }
          .print-carteirinha .card-top { padding: 3mm !important; }
          .print-carteirinha .card-logo { width: 8mm !important; height: 8mm !important; }
          .print-carteirinha .card-title { font-size: 7px !important; }
          .print-carteirinha .card-subtitle { margin-top: 0.5mm !important; font-size: 5px !important; }
          .print-carteirinha .card-body { padding: 3mm !important; }
          .print-carteirinha > .p-6 { padding: 3mm !important; }
          .print-carteirinha .card-photo { width: 16mm !important; height: 20mm !important; }
          .print-carteirinha .card-name { font-size: 9px !important; }
          .print-carteirinha .card-info { font-size: 5.5px !important; }
          .print-carteirinha .card-badge { margin-top: 1mm !important; padding: 1mm 2mm !important; font-size: 5px !important; }
          .print-carteirinha .card-bottom { margin-top: 2mm !important; }
          .print-carteirinha .card-qr { width: 22mm !important; height: 22mm !important; display: block !important; }
          .print-hide { display: none !important; }

          .print-sheet { display: grid !important; grid-template-columns: repeat(2, 85.6mm) !important; grid-template-rows: repeat(5, 53.98mm) !important; gap: 1mm !important; justify-content: center !important; align-content: start !important; width: 100% !important; height: 274mm !important; page-break-after: always !important; break-after: page !important; }
          .print-sheet:last-child { page-break-after: auto !important; break-after: auto !important; }
          .print-batch-card { width: 85.6mm !important; height: 53.98mm !important; overflow: hidden !important; border: 0.55mm solid #17382c !important; border-radius: 2.5mm !important; background: #fff !important; display: flex !important; flex-direction: column !important; color: #17382c !important; break-inside: avoid !important; }
          .print-batch-head { height: 12mm !important; min-height: 12mm !important; display: flex !important; align-items: center !important; gap: 2mm !important; padding: 1.5mm 2mm !important; color: white !important; print-color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
          .print-batch-logo { width: 8mm !important; height: 8mm !important; object-fit: contain !important; }
          .print-batch-title { font: 700 5pt Arial,sans-serif !important; letter-spacing: .2pt !important; }
          .print-batch-subtitle { font: 800 8pt Arial,sans-serif !important; }
          .print-batch-main { display: grid !important; grid-template-columns: 15mm 1fr 19mm !important; gap: 2mm !important; align-items: center !important; padding: 2mm !important; height: 41.98mm !important; }
          .print-batch-photo { width: 15mm !important; height: 20mm !important; object-fit: cover !important; border-radius: 1mm !important; background: #eef2f0 !important; }
          .print-batch-name { font: 800 7pt Arial,sans-serif !important; line-height: 1.1 !important; margin-bottom: 1.5mm !important; }
          .print-batch-info { font: 5pt Arial,sans-serif !important; line-height: 1.25 !important; margin-top: .8mm !important; }
          .print-batch-qr { width: 18mm !important; height: 18mm !important; display: block !important; }
          .print-index-root { font: 10pt Arial,sans-serif !important; }
          .print-index-group { margin: 0 0 5mm !important; break-inside: avoid !important; }
          .print-index-letter { font-size: 14pt !important; font-weight: 800 !important; border-bottom: 1px solid #333 !important; padding-bottom: 1mm !important; margin-bottom: 2mm !important; }
          .print-index-family { margin: 0 0 3mm 0 !important; break-inside: avoid !important; }
          .print-index-line { display: flex !important; justify-content: space-between !important; gap: 8mm !important; padding: 1mm 0 !important; }
          .print-index-dependent { padding-left: 8mm !important; color: #333 !important; font-size: 9pt !important; }
        }
      `}</style>

      <div className="print-hide"><CabecalhoPadrao /><MenuLateralPadrao /></div>

      <main className={`${modoQr ? "min-h-screen px-3 py-4" : "min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8"}`}>
        <div className={`${modoQr ? "mx-auto max-w-md" : "mx-auto max-w-7xl space-y-6"}`}>
          {!modoQr && <div>
            <p className="text-sm text-gray-500">Identificação</p>
            <h1 className="text-3xl font-extrabold text-[#005a3c]">Carteirinhas</h1>
            <p className="mt-1 text-sm text-gray-500">Carteirinha física, carteira digital e QR Code de acesso. Ao ler o QR, esta carteirinha é aberta e o acesso é contabilizado automaticamente.</p>
            <div className="mt-4 flex flex-wrap gap-2 print-hide">
              <button type="button" onClick={selecionarTodasAtivas} disabled={!cartoesParaImpressao.length || loteImpressaoMontado} className="inline-flex items-center gap-2 rounded-xl border border-[#005a3c] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] disabled:opacity-50">☑ Selecionar todas as ativas ({cartoesParaImpressao.length})</button>
              <button type="button" onClick={limparSelecaoCartoes} disabled={!cartoesSelecionados.length || loteImpressaoMontado} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:opacity-50">Limpar seleção</button>
              <button type="button" onClick={imprimirCarteirinhasSelecionadas} disabled={!cartoesSelecionadosParaImpressao.length || loteImpressaoMontado} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><Printer className="h-4 w-4" /> {loteImpressaoMontado ? "Preparando..." : `Imprimir selecionadas (${cartoesSelecionadosParaImpressao.length})`}</button>
              <button type="button" onClick={() => setIndiceAberto((aberto) => !aberto)} className="inline-flex items-center gap-2 rounded-xl border border-[#005a3c] bg-white px-4 py-3 text-sm font-bold text-[#005a3c]"><Search className="h-4 w-4" /> {indiceAberto ? "Ocultar índice" : "Lista alfabética"}</button>
            </div>
            <div className="print-hide mt-3 rounded-2xl border border-[#d8e9df] bg-white p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-black text-[#005a3c]">Selecionar carteirinhas para impressão</div>
                <div className="text-xs font-semibold text-gray-500">{cartoesSelecionadosParaImpressao.length} selecionada(s) de {cartoesParaImpressao.length} ativas</div>
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                {cartoesParaImpressao.map((cartao) => (
                  <label key={cartao.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-[#f4faf7] ${cartoesSelecionados.includes(cartao.key) ? "border-[#83b99d] bg-[#edf7f1]" : "border-gray-100 bg-white"}`}>
                    <input type="checkbox" checked={cartoesSelecionados.includes(cartao.key)} onChange={() => alternarSelecaoCartao(cartao.key)} disabled={loteImpressaoMontado} className="h-4 w-4 accent-[#005a3c]" />
                    <span className="min-w-0 flex-1"><span className="block truncate font-bold text-gray-800">{cartao.nome}</span><span className="block truncate text-xs text-gray-500">{cartao.matricula} · {cartao.categoria}{cartao.tipo === "dependente" ? ` · ${cartao.titular}` : ""}</span></span>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800">ATIVA</span>
                  </label>
                ))}
                {!cartoesParaImpressao.length && <p className="py-4 text-center text-sm text-gray-500">Nenhuma carteirinha ativa disponível.</p>}
              </div>
              <p className="mt-2 text-[11px] text-gray-500">Carteirinhas inativas ou bloqueadas não aparecem nesta seleção e não entram na impressão em lote.</p>
            </div>
          </div>}

          {!modoQr && erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{erro}</div>}

          <div className={`${modoQr ? "" : "grid gap-6 lg:grid-cols-[1fr_430px]"}`}>
            {!modoQr && <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 rounded-xl border px-3">
                <Search className="h-4 w-4 text-gray-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, matrícula ou CPF..." className="w-full py-3 outline-none" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  ["todos", `Todos (${socios.length})`],
                  ["ativos", `Ativos (${contadores.ativos})`],
                  ["inativos", `Inativos (${contadores.inativos})`],
                  ...(camposVisiveis.exameMedico ? [["exame_vencido", `Exame vencido (${contadores.examesVencidos})`] as [string, string]] : []),
                ] as [string, string][]).map(([valor, rotulo]) => (
                  <button key={valor} type="button" onClick={() => setFiltroStatus(valor as typeof filtroStatus)} className={`rounded-lg border px-2 py-2 text-xs font-bold ${filtroStatus === valor ? "border-[#005a3c] bg-[#e8f3ee] text-[#005a3c]" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
              <div className="mt-3 text-xs font-semibold text-gray-500">{lista.length} associado(s) encontrado(s)</div>
              <div className="mt-4 space-y-2">
                {lista.map((s) => (
                  <button key={s.id} onClick={() => { setSelecionado(s); setDependenteSelecionado(null); setTemporadaSelecionada(null); setParticipanteTemporadaSelecionado(null); }} className={`w-full rounded-xl border p-4 text-left ${selecionado?.id === s.id ? "border-[#005a3c] bg-[#e8f3ee]" : "hover:bg-gray-50"}`}>
                    <b>{s.nome}</b>
                    <div className="text-xs text-gray-500">Matrícula: {s.matricula || "—"} · {visual(s.tipo_socio).nome}</div>
                  </button>
                ))}

                {temporadasLista.length > 0 && (
                  <div className="pt-4">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-orange-600">🏖️ Temporadas</div>
                    <div className="space-y-2">
                      {temporadasLista.map((t) => (
                        <div key={t.id} className={`rounded-xl border p-3 ${temporadaSelecionada?.id === t.id ? "border-orange-500 bg-orange-50" : ""}`}>
                          <button
                            onClick={() => {
                              setTemporadaSelecionada(t);
                              setParticipanteTemporadaSelecionado(t.participantes?.find((p) => p.papel === "titular") || t.participantes?.[0] || null);
                              setSelecionado(null);
                              setDependenteSelecionado(null);
                              setModoQr(false);
                            }}
                            className="w-full text-left"
                          >
                            <b>{t.responsavel_nome || "Responsável da temporada"}</b>
                            <div className="text-xs text-gray-500">Matrícula: {t.matricula || "—"} · {t.tipo === "temporada_familiar" ? "Temporada Familiar" : "Temporada Individual"}</div>
                            <div className={`mt-1 text-xs font-black ${t.status_carteirinha === "bloqueada" ? "text-red-700" : t.status_carteirinha === "ativa" ? "text-emerald-700" : "text-gray-600"}`}>{t.status_carteirinha_texto || t.situacao || "Situação não informada"}</div>
                          </button>
                          {temporadaSelecionada?.id === t.id && (t.participantes || []).length > 0 && (
                            <div className="mt-3 space-y-2 border-t border-orange-200 pt-3">
                              <div className="text-[10px] font-black uppercase tracking-wide text-orange-800">Carteirinhas individuais</div>
                              {t.participantes!.map((p) => (
                                <button key={p.id} onClick={() => { setParticipanteTemporadaSelecionado(p); setModoQr(false); }} className={`flex w-full items-center gap-3 rounded-lg border bg-white p-2 text-left ${participanteTemporadaAtual?.id === p.id ? "border-orange-500 ring-1 ring-orange-300" : "hover:border-orange-300"}`}>
                                  <div className="h-10 w-9 shrink-0 overflow-hidden rounded bg-orange-50">{p.foto_url ? <img src={p.foto_url} alt={p.nome || "Foto do participante"} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center">👤</div>}</div>
                                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{p.nome || "Participante"}</div><div className="text-xs text-gray-500">{p.matricula || "Sem matrícula"} · {p.parentesco || (p.papel === "titular" ? "Titular" : "Dependente")}</div></div>
                                  <span className={`text-[10px] font-black ${p.status_carteirinha === "bloqueada" ? "text-red-700" : p.status_carteirinha === "ativa" ? "text-emerald-700" : "text-gray-600"}`}>{p.status_carteirinha === "bloqueada" ? "BLOQUEADA" : p.status_carteirinha === "ativa" ? "ATIVA" : "INATIVA"}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selecionado && (familiaSelecionada.length > 0 || dependentesFamiliaSelecionada.length > 0) && (
                  <div className="pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-black uppercase tracking-wide text-gray-400">Grupo familiar</div>
                      <div className="text-xs font-semibold text-gray-400">{familiaSelecionada.length + dependentesFamiliaSelecionada.length + 1} pessoa(s)</div>
                    </div>
                    <div className="rounded-xl bg-[#f4f7f5] p-3 text-xs text-gray-600">
                      Selecionado: <b>{selecionado.nome}</b>. Abaixo aparecem cônjuge, filhos e demais integrantes vinculados à mesma família.
                    </div>
                    <div className="mt-2 space-y-2">
                      {familiaSelecionada.map((membro) => (
                        <button key={membro.id} onClick={() => { setSelecionado(membro); setDependenteSelecionado(null); setTemporadaSelecionada(null); setParticipanteTemporadaSelecionado(null); }} className="w-full rounded-xl border p-4 text-left hover:border-[#005a3c] hover:bg-gray-50">
                          <b>{membro.nome}</b>
                          <div className="text-xs text-gray-500">
                            Matrícula: {membro.matricula || "—"} · {membro.parentesco || visual(membro.tipo_socio).nome}
                          </div>
                        </button>
                      ))}
                      {dependentesFamiliaSelecionada.map((d) => (
                        <button key={`dep-${d.id}`} onClick={() => { setSelecionado(null); setDependenteSelecionado(d); setTemporadaSelecionada(null); setParticipanteTemporadaSelecionado(null); }} className="w-full rounded-xl border p-4 text-left hover:border-[#005a3c] hover:bg-gray-50">
                          <b>{d.nome}</b>
                          <div className="text-xs text-gray-500">Matrícula: {d.matricula || "—"} · {d.parentesco || "Família"}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!selecionado && dependentesLista.length > 0 && (
                  <div className="pt-3">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-400">Dependentes da família</div>
                    <div className="space-y-2">
                      {dependentesLista.map((d) => (
                        <button key={d.id} onClick={() => { setSelecionado(null); setDependenteSelecionado(d); setTemporadaSelecionada(null); setParticipanteTemporadaSelecionado(null); }} className={`w-full rounded-xl border p-4 text-left ${dependenteSelecionado?.id === d.id ? "border-[#005a3c] bg-[#e8f3ee]" : "hover:bg-gray-50"}`}>
                          <b>{d.nome}</b>
                          <div className="text-xs text-gray-500">Dependente · {d.parentesco || "Família"} · Titular: {d.titular_nome || "—"}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>}

            {temporadaSelecionada && (
              <section className={modoQr ? "space-y-3" : "space-y-4"}>
                <div className={`${modoQr ? "hidden" : ""} print-carteirinha overflow-hidden rounded-3xl border-4 border-orange-700 bg-white shadow-xl`}>
                  <div className="card-top p-5" style={{ background: "#e87511", color: "#ffffff" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="card-logo h-10 w-10 rounded-lg object-contain" />
                        <div>
                          <div className="card-subtitle text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div>
                          <div className="card-title mt-1 text-lg font-black">CARTEIRA DE TEMPORADA</div>
                        </div>
                      </div>
                      <IdCard />
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex gap-4">
                      <div className="card-photo h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-orange-50">
                        {participanteTemporadaAtual?.foto_url ? <img src={participanteTemporadaAtual.foto_url} alt={participanteTemporadaAtual.nome || "Participante"} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">👤</div>}
                      </div>
                      <div className="min-w-0">
                        <h2 className="card-name text-xl font-black leading-tight">{participanteTemporadaAtual?.nome || temporadaSelecionada.responsavel_nome || "Responsável da temporada"}</h2>
                        <p className="card-info mt-1 text-sm text-gray-500">Matrícula <b>{participanteTemporadaAtual?.matricula || temporadaSelecionada.matricula || "—"}</b></p>
                        <p className="card-info text-sm text-gray-500">CPF <b>{formatarCpf(participanteTemporadaAtual?.cpf || temporadaSelecionada.responsavel_cpf)}</b></p>
                        <span className="card-badge mt-2 inline-block rounded-full bg-orange-600 px-3 py-1 text-xs font-black text-white">
                          {temporadaSelecionada.tipo === "temporada_familiar" ? "Temporada Familiar" : "Temporada Individual"}
                        </span>
                      </div>
                    </div>
                    <div className="card-bottom mt-6 flex items-end justify-between gap-4">
                      <div className="space-y-2 text-sm">
                        <div><div className="text-[10px] font-bold uppercase text-gray-400">Situação</div><div className={`font-black ${statusTemporadaBloqueada ? "text-red-700" : statusTemporadaAtiva ? "text-emerald-700" : "text-gray-700"}`}>{statusTemporadaTexto}</div></div>
                        <div><div className="text-[10px] font-bold uppercase text-gray-400">Validade da temporada</div><div className="font-bold">{temporadaValidade ? formatarData(temporadaValidade) : "—"}</div></div>
                        {camposVisiveis.exameMedico && <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${exameTemporada.ponto}`} /><div><div className="text-[10px] font-bold uppercase text-gray-400">Exame médico</div><div className={`font-black text-xs ${exameTemporada.textoClasse}`}>{exameTemporada.texto}</div></div></div>}
                      </div>
                      <QRCodeSVG className="card-qr" data-carteirinha-qr="temporada-atual" value={temporadaQrValue} size={112} includeMargin />
                    </div>
                  </div>
                </div>

                <div className={`${modoQr ? "hidden" : "grid grid-cols-3 gap-2"}`}>
                  <button onClick={imprimirCarteirinha} className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-bold text-white hover:bg-orange-700"><Printer className="h-4 w-4" /> Imprimir</button>
                  <button onClick={() => setDigitalAberta(true)} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-sm font-bold"><Smartphone className="h-4 w-4" /> Digital</button>
                  <button onClick={() => void baixarCarteirinhaDigital()} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-xs font-bold"><IdCard className="h-4 w-4" /> Exportar digital</button>
                </div>

                {modoQr && (
                  <div className="overflow-hidden rounded-[26px] border-4 border-orange-700 bg-white shadow-2xl">
                    <div className="p-5" style={{ background: "#e87511", color: "#ffffff" }}>
                      <div className="flex items-center gap-3">
                        <img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="h-12 w-12 rounded-xl object-contain" />
                        <div><div className="text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div><div className="text-xl font-black">CARTEIRA DIGITAL · TEMPORADA</div></div>
                      </div>
                    </div>
                    <div className="p-6">
                      <h2 className="text-xl font-black">{temporadaSelecionada.responsavel_nome || "Responsável da temporada"}</h2>
                      <p className="mt-1 text-sm text-gray-500">Matrícula: <b>{temporadaSelecionada.matricula || "—"}</b></p>
                      <p className="text-sm text-gray-500">Validade: <b>{temporadaValidade ? formatarData(temporadaValidade) : "—"}</b></p>
                      <div className="mt-5 flex justify-center"><QRCodeSVG value={temporadaQrValue} size={210} includeMargin /></div>
                      <div className="mt-4 rounded-xl bg-orange-50 p-3 text-center text-xs font-semibold text-orange-800">Apresente este QR Code para identificação na portaria.</div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {dependenteSelecionado && (
              <section className={modoQr ? "space-y-3" : "space-y-4"}>
                <div className={`${modoQr ? "hidden" : ""} print-carteirinha overflow-hidden rounded-3xl border-4 border-[#17382c] bg-white shadow-xl`}>
                  <div className="card-top p-5" style={{ background: "#005a3c", color: "#ffffff" }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3"><img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="card-logo h-10 w-10 rounded-lg object-contain" /><div><div className="card-subtitle text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div><div className="card-title mt-1 text-lg font-black">CARTEIRA DE ASSOCIADO</div></div></div><IdCard />
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex gap-4"><div className="card-photo h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                        {dependenteSelecionado.foto_url ? <img src={dependenteSelecionado.foto_url} alt={dependenteSelecionado.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">👤</div>}
                      </div><div className="min-w-0"><h2 className="card-name text-xl font-black leading-tight">{dependenteSelecionado.nome}</h2><p className="card-info mt-1 text-sm text-gray-500">Dependente · <b>{dependenteSelecionado.parentesco || "Família"}</b></p><p className="card-info text-sm text-gray-500">Titular <b>{dependenteSelecionado.titular_nome || "—"}</b></p><p className="card-info text-sm text-gray-500">Matrícula <b>{dependenteSelecionado.matricula || "—"}</b></p><p className="card-info text-sm text-gray-500">Matrícula do titular <b>{dependenteSelecionado.titular_matricula || "—"}</b></p><span className="card-badge mt-2 inline-block rounded-full bg-[#005a3c] px-3 py-1 text-xs font-black text-white">Dependente</span></div></div>
                    <div className="card-bottom mt-6 flex items-end justify-between gap-4"><div className="space-y-2 text-sm"><div><div className="text-[10px] font-bold uppercase text-gray-400">Situação</div><div className="font-black text-[#005a3c]">{dependenteSelecionado.situacao || "Não informada"}</div></div>{camposVisiveis.financeiro && <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${dependenteSelecionado.financeiro_status === "em_dia" ? "bg-emerald-500" : dependenteSelecionado.financeiro_status === "atrasado" ? "bg-yellow-400" : "bg-red-500"}`} /><div><div className="text-[10px] font-bold uppercase text-gray-400">Mensalidade</div><div className="font-black">{dependenteSelecionado.financeiro_status === "em_dia" ? "EM DIA" : dependenteSelecionado.financeiro_status === "atrasado" ? "ATENÇÃO" : dependenteSelecionado.financeiro_status === "restrito" ? "RESTRITO" : "BLOQUEIO"}</div></div></div>}</div><QRCodeSVG className="card-qr" data-carteirinha-qr={`dependente-atual-${dependenteSelecionado.id}`} value={`${typeof window !== "undefined" ? window.location.origin : ""}/acessos/validar?id=${encodeURIComponent(dependenteSelecionado.id)}`} size={112} includeMargin /></div>
                  </div>
                </div>
                <div className={`${modoQr ? "hidden" : "grid grid-cols-3 gap-2"}`}><button onClick={imprimirCarteirinha} className="flex items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-3 py-3 text-sm font-bold text-white hover:bg-[#003d2b]"><Printer className="h-4 w-4" /> Imprimir</button><button onClick={() => setDigitalAberta(true)} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-sm font-bold hover:bg-gray-50"><Smartphone className="h-4 w-4" /> Digital</button><button onClick={() => void baixarCarteirinhaDigital()} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-xs font-bold hover:bg-gray-50"><IdCard className="h-4 w-4" /> Exportar digital</button></div>
                <div className={`${modoQr ? "hidden" : "rounded-xl bg-[#e8f3ee] p-4 text-sm"}`}><ShieldCheck className="mr-2 inline h-4 w-4 text-[#005a3c]" /><b>QR Code exclusivo.</b> O funcionário pode escanear este código para registrar a entrada.</div>
                {modoQr && <div className="rounded-xl bg-[#e8f3ee] p-4 text-center text-sm font-semibold text-[#005a3c]">Carteira digital do dependente · titular: {dependenteSelecionado.titular_nome || "—"}</div>}
              </section>
            )}

            {selecionado && (
              <section className={modoQr ? "space-y-3" : "space-y-4"}>
                <div className={`${modoQr ? "hidden" : ""} print-carteirinha overflow-hidden rounded-3xl border-4 border-[#17382c] bg-white shadow-xl`}>
                  <div className="card-top p-5" style={{ background: v.bg, color: v.text }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="card-logo h-10 w-10 rounded-lg object-contain" />
                        <div>
                          <div className="card-subtitle text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div>
                          <div className="card-title mt-1 text-lg font-black">CARTEIRA DE ASSOCIADO</div>
                        </div>
                      </div>
                      <IdCard />
                    </div>
                  </div>

                  <div className="p-6">
                    <div className="flex gap-4">
                      <div className="card-photo h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                        {selecionado.foto_url ? <img src={selecionado.foto_url} alt={selecionado.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">👤</div>}
                      </div>
                      <div className="min-w-0">
                        <h2 className="card-name text-xl font-black leading-tight">{selecionado.nome}</h2>
                        <p className="card-info mt-1 text-sm text-gray-500">Matrícula <b>{selecionado.matricula || "—"}</b></p>
                        <p className="card-info text-sm text-gray-500">CPF <b>{formatarCpf(selecionado.cpf)}</b></p>
                        <span className="card-badge mt-2 inline-block rounded-full px-3 py-1 text-xs font-black" style={{ background: v.bg, color: v.text }}>{v.nome}</span>
                      </div>
                    </div>

                    <div className="card-bottom mt-6 flex items-end justify-between gap-4">
                      <div className="space-y-2 text-sm">
                        <div><div className="text-[10px] font-bold uppercase text-gray-400">Situação</div><div className="font-black text-[#005a3c]">{selecionado.situacao || "Não informada"}</div></div>
                        <div><div className="text-[10px] font-bold uppercase text-gray-400">Validade</div><div className="font-bold">{validade ? formatarData(validade) : "Conforme cadastro"}</div></div>
                        {camposVisiveis.financeiro && <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${statusFinanceiroClass}`} /><div><div className="text-[10px] font-bold uppercase text-gray-400">Mensalidade</div><div className="font-black">{statusFinanceiroLabel}</div></div></div>}
                        {camposVisiveis.exameMedico && <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${exame.ponto}`} /><div><div className="text-[10px] font-bold uppercase text-gray-400">Exame médico</div><div className={`font-black text-xs ${exame.textoClasse}`}>{exame.texto}</div></div></div>}
                      </div>
                      <QRCodeSVG className="card-qr" data-carteirinha-qr={`socio-atual-${selecionado.id}`} value={qrValue} size={112} includeMargin />
                    </div>
                  </div>
                </div>

                <div className={`${modoQr ? "hidden" : "grid grid-cols-3 gap-2"}`}>
                  <button onClick={imprimirCarteirinha} className="flex items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 font-bold text-white hover:bg-[#003d2b]"><Printer className="h-4 w-4" /> Imprimir</button>
                  <button onClick={() => setDigitalAberta(true)} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-sm font-bold hover:bg-gray-50"><Smartphone className="h-4 w-4" /> Digital</button>
                  <button onClick={() => void baixarCarteirinhaDigital()} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-3 py-3 text-xs font-bold hover:bg-gray-50"><IdCard className="h-4 w-4" /> Exportar digital</button>
                </div>

                <div className={`${modoQr ? "hidden" : "rounded-xl bg-[#e8f3ee] p-4 text-sm"}`}><ShieldCheck className="mr-2 inline h-4 w-4 text-[#005a3c]" /><b>QR Code exclusivo.</b> O funcionário pode escanear este código para registrar a entrada.</div>

                {modoQr && (
                  <div className="overflow-hidden rounded-[26px] border-4 border-[#17382c] bg-white shadow-2xl">
                    <div className="p-5" style={{ background: v.bg, color: v.text }}>
                      <div className="flex items-center gap-3">
                        <img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="h-12 w-12 rounded-xl object-contain" />
                        <div><div className="text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div><div className="text-xl font-black">CARTEIRA DIGITAL</div></div>
                      </div>
                    </div>
                    <div className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">{selecionado.foto_url ? <img src={selecionado.foto_url} alt={selecionado.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">👤</div>}</div>
                        <div className="min-w-0"><h2 className="text-xl font-black">{selecionado.nome}</h2><p className="text-sm text-gray-500">Matrícula: <b>{selecionado.matricula || "—"}</b></p><span className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-black" style={{ background: v.bg, color: v.text }}>{v.nome}</span></div>
                      </div>
                      {camposVisiveis.financeiro && <div className="mt-5 rounded-2xl bg-[#f4f7f5] p-4">
                        <div className="flex items-center gap-3"><span className={`h-5 w-5 rounded-full ${statusFinanceiroClass} ring-4 ring-white shadow`} /><div><div className="text-xs font-bold uppercase text-gray-400">Situação financeira</div><div className="text-lg font-black">{statusFinanceiroLabel}</div><div className="text-xs text-gray-500">{statusFinanceiroText}</div></div></div>
                      </div>}
                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border p-3"><div className="text-[10px] font-bold uppercase text-gray-400">Situação</div><b>{selecionado.situacao || "Não informada"}</b></div><div className="rounded-xl border p-3"><div className="text-[10px] font-bold uppercase text-gray-400">Validade</div><b>{validade ? formatarData(validade) : "Conforme cadastro"}</b></div></div>
                      {erro && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{erro}</div>}
                      <div className="mt-5 rounded-xl bg-[#e8f3ee] p-3 text-center text-xs font-semibold text-[#005a3c]">Acesso contabilizado automaticamente na leitura do QR Code.</div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
          {indiceAberto && !modoQr && (
            <section className="print-index-root mt-6 rounded-2xl border bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print-hide">
                <div><h2 className="text-lg font-black text-[#005a3c]">Índice alfabético de associados</h2><p className="text-xs text-gray-500">Famílias agrupadas pelo sobrenome, com as matrículas alinhadas à direita.</p></div>
                <button type="button" onClick={imprimirIndice} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-2.5 text-sm font-bold text-white"><Printer className="h-4 w-4" /> Imprimir lista</button>
              </div>
              <div>
                {indicePorSobrenome.map((grupo) => (
                  <div className="print-index-group mb-5" key={grupo.sobrenome}>
                    <div className="print-index-letter border-b border-gray-300 pb-1 text-base font-black text-[#005a3c]">{grupo.letra} — {grupo.sobrenome}</div>
                    {grupo.familias.map((familia) => (
                      <div className="print-index-family py-2" key={familia.titular.id}>
                        <div className="print-index-line flex justify-between gap-4 text-sm"><span className="font-bold">{familia.titular.nome}</span><span className="font-mono font-bold">{familia.titular.matricula || "—"}</span></div>
                        {familia.socios.map((membro) => <div className="print-index-line print-index-dependent ml-4 flex justify-between gap-4 text-sm text-gray-600" key={membro.id}><span>↳ {membro.nome} ({membro.parentesco || visual(membro.tipo_socio).nome})</span><span className="font-mono">{membro.matricula || "—"}</span></div>)}
                        {familia.dependentes.map((membro) => <div className="print-index-line print-index-dependent ml-4 flex justify-between gap-4 text-sm text-gray-600" key={`dep-${membro.id}`}><span>↳ {membro.nome} ({membro.parentesco || "Dependente"})</span><span className="font-mono">{membro.matricula || "—"}</span></div>)}
                      </div>
                    ))}
                  </div>
                ))}
                {!indicePorSobrenome.length && <p className="text-sm text-gray-500">Nenhum associado encontrado.</p>}
              </div>
            </section>
          )}
          {loteImpressaoMontado && <div className="print-lote-root hidden" aria-hidden="true">
            {Array.from({ length: Math.ceil(cartoesSelecionadosParaImpressao.length / 10) }, (_, folha) => (
              <div className="print-sheet" key={`folha-${folha}`}>
                {cartoesSelecionadosParaImpressao.slice(folha * 10, folha * 10 + 10).map((cartao) => (
                  <article className="print-batch-card" key={cartao.key}>
                    <div className="print-batch-head" style={{ background: cartao.cor, color: cartao.textoCor }}>
                      <img className="print-batch-logo" src="/logo-guarani.png" alt="" />
                      <div><div className="print-batch-title">SOCIEDADE RECREATIVA GUARANI</div><div className="print-batch-subtitle">CARTEIRA · {cartao.categoria.toLocaleUpperCase("pt-BR")}</div></div>
                    </div>
                    <div className="print-batch-main">
                      {cartao.fotoUrl ? <img className="print-batch-photo" src={cartao.fotoUrl} alt={cartao.nome} /> : <div className="print-batch-photo grid place-items-center text-xl">👤</div>}
                      <div className="min-w-0">
                        <div className="print-batch-name">{cartao.nome}</div>
                        <div className="print-batch-info">Matrícula: <b>{cartao.matricula}</b></div>
                        <div className="print-batch-info">CPF: {cartao.cpf}</div>
                        <div className="print-batch-info">{cartao.tipo === "dependente" ? `Titular: ${cartao.titular}` : cartao.situacao}</div>
                        {cartao.validade && <div className="print-batch-info">Validade: {formatarData(cartao.validade)}</div>}
                        {camposVisiveis.exameMedico && cartao.exame && <div className="print-batch-info">Exame: {formatarData(cartao.exame)}</div>}
                      </div>
                      <QRCodeSVG className="print-batch-qr" value={cartao.qrValue} size={100} includeMargin />
                    </div>
                  </article>
                ))}
              </div>
            ))}
          </div>}
        </div>
      </main>

      {digitalAberta && temporadaSelecionada && !modoQr && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001f16]/85 p-4">
          <div className="relative w-full max-w-md rounded-[28px] bg-white p-4 shadow-2xl">
            <button onClick={() => setDigitalAberta(false)} className="absolute right-4 top-4 z-10 rounded-full bg-white p-2 shadow" aria-label="Fechar"><X className="h-5 w-5" /></button>
            <div className="overflow-hidden rounded-[22px] border-4 border-orange-700 bg-white">
              <div className="p-5" style={{ background: "#e87511", color: "#ffffff" }}>
                <div className="text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div>
                <div className="text-xl font-black">CARTEIRA DIGITAL · TEMPORADA</div>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-3"><div className="h-20 w-16 overflow-hidden rounded-lg bg-orange-50">{participanteTemporadaAtual?.foto_url ? <img src={participanteTemporadaAtual.foto_url} alt={participanteTemporadaAtual.nome || "Participante"} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-2xl">👤</div>}</div><div><h2 className="text-xl font-black">{participanteTemporadaAtual?.nome || temporadaSelecionada.responsavel_nome || "Responsável da temporada"}</h2><p className="mt-1 text-sm text-gray-500">Matrícula: <b>{participanteTemporadaAtual?.matricula || temporadaSelecionada.matricula || "—"}</b></p></div></div>
                <p className="mt-3 text-sm text-gray-500">Situação: <b className={statusTemporadaBloqueada ? "text-red-700" : statusTemporadaAtiva ? "text-emerald-700" : "text-gray-700"}>{statusTemporadaTexto}</b></p>
                <p className="text-sm text-gray-500">Validade da temporada: <b>{temporadaValidade ? formatarData(temporadaValidade) : "—"}</b></p>
                {camposVisiveis.exameMedico && <div className="mt-3 flex items-center gap-2 rounded-xl bg-gray-50 p-3"><span className={`h-3 w-3 shrink-0 rounded-full ${exameTemporada.ponto}`} /><div><div className="text-[10px] font-bold uppercase text-gray-400">Exame médico</div><div className={`text-sm font-black ${exameTemporada.textoClasse}`}>{exameTemporada.texto}</div></div></div>}
                <div className="mt-5 flex justify-center"><QRCodeSVG value={temporadaQrValue} size={210} includeMargin /></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {digitalAberta && selecionado && !modoQr && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001f16]/85 p-4">
          <div className="relative w-full max-w-md rounded-[28px] bg-white p-4 shadow-2xl">
            <button onClick={() => setDigitalAberta(false)} className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 shadow" aria-label="Fechar carteira digital"><X className="h-5 w-5" /></button>
            <div className="overflow-hidden rounded-[22px] border-4 border-[#17382c] bg-white">
              <div className="p-5" style={{ background: v.bg, color: v.text }}>
                <div className="flex items-center gap-3">
                  <img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="h-12 w-12 rounded-xl object-contain" />
                  <div><div className="text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div><div className="text-xl font-black">CARTEIRA DIGITAL</div></div>
                </div>
              </div>
              <div className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-24 w-20 overflow-hidden rounded-xl bg-gray-100">{selecionado.foto_url ? <img src={selecionado.foto_url} alt={selecionado.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">👤</div>}</div>
                  <div><h2 className="text-xl font-black">{selecionado.nome}</h2><p className="text-sm text-gray-500">Matrícula: <b>{selecionado.matricula || "—"}</b></p><p className="text-sm text-gray-500">CPF: <b>{formatarCpf(selecionado.cpf)}</b></p><span className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-black" style={{ background: v.bg, color: v.text }}>{v.nome}</span></div>
                </div>
                <div className="mt-6 rounded-2xl bg-[#f4f7f5] p-4"><div className="text-xs font-bold uppercase text-gray-400">Situação</div><div className="text-lg font-black text-[#005a3c]">{selecionado.situacao || "Não informada"}</div><div className="mt-2 text-sm">Validade: <b>{validade ? formatarData(validade) : "Conforme cadastro"}</b></div></div>
                <div className="mt-6 flex justify-center"><QRCodeSVG value={qrValue} size={210} includeMargin /></div>
                <div className="mt-4 rounded-xl bg-[#e8f3ee] p-3 text-center text-xs font-semibold text-[#005a3c]">Apresente este QR Code para identificação na portaria.</div>
              </div>
            </div>
          </div>
        </div>
      )}
      {digitalAberta && dependenteSelecionado && !modoQr && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001f16]/85 p-4">
          <div className="relative w-full max-w-md rounded-[28px] bg-white p-4 shadow-2xl">
            <button onClick={() => setDigitalAberta(false)} className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 shadow" aria-label="Fechar carteira digital"><X className="h-5 w-5" /></button>
            <div className="overflow-hidden rounded-[22px] border-4 border-[#17382c] bg-white"><div className="p-5" style={{ background: "#005a3c", color: "#ffffff" }}><div className="flex items-center gap-3"><img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="h-12 w-12 rounded-xl object-contain" /><div><div className="text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div><div className="text-xl font-black">CARTEIRA DIGITAL</div></div></div></div><div className="p-6"><div className="flex items-center gap-4"><div className="h-24 w-20 overflow-hidden rounded-xl bg-gray-100">{dependenteSelecionado.foto_url ? <img src={dependenteSelecionado.foto_url} alt={dependenteSelecionado.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">👤</div>}</div><div><h2 className="text-xl font-black">{dependenteSelecionado.nome}</h2><p className="text-sm text-gray-500">Dependente: <b>{dependenteSelecionado.parentesco || "Família"}</b></p><p className="text-sm text-gray-500">Matrícula: <b>{dependenteSelecionado.matricula || "—"}</b></p><p className="text-sm text-gray-500">Titular: <b>{dependenteSelecionado.titular_nome || "—"}</b></p><span className="mt-2 inline-block rounded-full bg-[#005a3c] px-3 py-1 text-xs font-black text-white">Dependente</span></div></div>{camposVisiveis.financeiro && <div className="mt-6 rounded-2xl bg-[#f4f7f5] p-4"><div className="text-xs font-bold uppercase text-gray-400">Situação financeira</div><div className="text-lg font-black text-[#005a3c]">{dependenteSelecionado.financeiro_status === "em_dia" ? "EM DIA" : dependenteSelecionado.financeiro_status === "atrasado" ? "ATENÇÃO" : dependenteSelecionado.financeiro_status === "restrito" ? "RESTRITO" : "BLOQUEIO"}</div></div>}<div className="mt-6 flex justify-center"><QRCodeSVG value={`${typeof window !== "undefined" ? window.location.origin : ""}/acessos/validar?id=${encodeURIComponent(dependenteSelecionado.id)}`} size={210} includeMargin /></div><div className="mt-4 rounded-xl bg-[#e8f3ee] p-3 text-center text-xs font-semibold text-[#005a3c]">Apresente este QR Code para identificação na portaria.</div></div></div>
          </div>
        </div>
      )}

    </div>
  );
}
