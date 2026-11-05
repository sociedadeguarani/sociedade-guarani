"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";
import { dataHojeBrasil, classificarMesesAtraso, normalizarPoliticaInadimplencia, POLITICA_INADIMPLENCIA_PADRAO, type PoliticaInadimplencia } from "@/lib/politicaInadimplencia";

type Socio = {
  id: string;
  matricula: string | number | null;
  nome: string;
  cpf: string | null;
  data_associacao: string | null;
  valor_mensalidade: number | string | null;
  dia_vencimento: number | null;
  possui_mensalidade: boolean | null;
  tipo_socio: string | null;
  categoria: string | null;
  situacao: string | null;
  remido: boolean | null;
  ativo: boolean | null;
};

type Dependente = {
  id: string;
  socio_id: string;
  nome: string;
  cpf: string | null;
  ativo: boolean | null;
  possui_mensalidade: boolean | null;
};

type Mensalidade = {
  id: string;
  socio_id: string | null;
  dependente_id: string | null;
  competencia: string | null;
  data_vencimento: string | null;
  valor: number | string | null;
  situacao: string | null;
  data_pagamento?: string | null;
};

type Inadimplente = {
  pessoaId: string;
  socioId: string;
  nome: string;
  matricula: string;
  responsavel: string;
  meses: number;
  valor: number;
  competencias: string[];
  nivel: "verde" | "amarelo" | "vermelho";
};

function moeda(valor: number | string | null | undefined) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function competenciaBR(valor: string | null | undefined) {
  if (!valor) return "—";
  const partes = valor.slice(0, 10).split("-");
  if (partes.length < 2) return valor;
  return `${partes[1]}/${partes[0]}`;
}

function normalizarSituacao(valor: unknown) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function isPago(m: Mensalidade) {
  return Boolean(m.data_pagamento) || ["pago", "paga", "paid", "quitado", "quitada", "recebido", "recebida", "baixado", "baixada", "compensado", "compensada"].includes(normalizarSituacao(m.situacao));
}

function isIsento(m: Mensalidade) {
  return ["isento", "isenta", "cancelado", "cancelada"].includes(normalizarSituacao(m.situacao));
}

type DadosInadimplencia = {
  socios: Socio[];
  dependentes: Dependente[];
  mensalidades: Mensalidade[];
  politicaInadimplencia: PoliticaInadimplencia;
};

async function buscarMensalidadesPaginadas(): Promise<Mensalidade[]> {
  const tamanhoLote = 1000;
  const todas: Mensalidade[] = [];

  // A apuração usa o histórico completo; o limite padrão do Supabase pode
  // ocultar pagamentos antigos e classificar associados em dia como devedores.
  for (let offset = 0; offset < 100_000; offset += tamanhoLote) {
    const { data, error } = await supabase
      .from("mensalidades")
      .select("id,socio_id,dependente_id,competencia,data_vencimento,valor,situacao,data_pagamento")
      .order("data_vencimento", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + tamanhoLote - 1);

    if (error) throw new Error(error.message);
    const lote = (data || []) as Mensalidade[];
    todas.push(...lote);
    if (lote.length < tamanhoLote) return todas;
  }

  throw new Error("O histórico de mensalidades excedeu o limite de segurança de 100.000 registros.");
}

/** Busca os dados sem atualizar estado React; pode ser chamada pelo efeito ou pelo botão Atualizar. */
async function buscarDadosInadimplencia(): Promise<DadosInadimplencia> {
  const [sociosResult, dependentesResult, mensalidadesCompletas] =
    await Promise.all([
      supabase
        .from("socios")
        .select("id,matricula,nome,cpf,data_associacao,valor_mensalidade,dia_vencimento,possui_mensalidade,tipo_socio,categoria,situacao,remido,ativo")
        .order("nome"),
      supabase
        .from("dependentes")
        .select("id,socio_id,nome,cpf,ativo,possui_mensalidade")
        .eq("ativo", true)
        .order("nome"),
      buscarMensalidadesPaginadas(),
    ]);

  if (sociosResult.error) throw new Error(sociosResult.error.message);
  if (dependentesResult.error) throw new Error(dependentesResult.error.message);

  let politicaInadimplencia = POLITICA_INADIMPLENCIA_PADRAO;
  try {
    const { data: authData } = await supabase.auth.getSession();
    const token = authData.session?.access_token;
    if (token) {
      const policyResponse = await fetch("/api/configuracoes/acessos", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const policyJson = await policyResponse.json().catch(() => ({}));
      if (policyResponse.ok) {
        politicaInadimplencia = normalizarPoliticaInadimplencia(
          policyJson?.politica
        );
      }
    }
  } catch {
    // Mantém a política padrão caso a configuração não possa ser consultada.
  }

  return {
    socios: (sociosResult.data || []) as Socio[],
    dependentes: (dependentesResult.data || []) as Dependente[],
    mensalidades: mensalidadesCompletas,
    politicaInadimplencia,
  };
}

export default function InadimplenciaPage() {
  const router = useRouter();
  const [socios, setSocios] = useState<Socio[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "verde" | "amarelo" | "vermelho">("todos");
  const [busca, setBusca] = useState("");
  const [politicaInadimplencia, setPoliticaInadimplencia] = useState<PoliticaInadimplencia>(POLITICA_INADIMPLENCIA_PADRAO);

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const dados = await buscarDadosInadimplencia();
      setSocios(dados.socios);
      setDependentes(dados.dependentes);
      setMensalidades(dados.mensalidades);
      setPoliticaInadimplencia(dados.politicaInadimplencia);
    } catch (error: unknown) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o relatório de inadimplência."
      );
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    let ativo = true;

    // O efeito só atualiza estado após a Promise de busca concluir; evita setState síncrono no efeito.
    void buscarDadosInadimplencia()
      .then((dados) => {
        if (!ativo) return;
        setSocios(dados.socios);
        setDependentes(dados.dependentes);
        setMensalidades(dados.mensalidades);
        setPoliticaInadimplencia(dados.politicaInadimplencia);
      })
      .catch((error: unknown) => {
        if (!ativo) return;
        setErro(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o relatório de inadimplência."
        );
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, []);

  const socioMap = useMemo(
    () => new Map(socios.map((s) => [s.id, s])),
    [socios]
  );

  const socioPorCpf = useMemo(() => {
    const mapa = new Map<string, Socio>();
    for (const socio of socios) {
      const cpf = String(socio.cpf || "").replace(/\D/g, "");
      if (cpf) mapa.set(cpf, socio);
    }
    return mapa;
  }, [socios]);

  const socioElegivel = (socio: Socio) => {
    const tipo = normalizarSituacao(socio.tipo_socio);
    const categoria = normalizarSituacao(socio.categoria);
    const situacao = normalizarSituacao(socio.situacao);
    const remido = socio.remido === true || tipo.includes("remido") || categoria.includes("remido");
    const temporada = tipo.includes("temporada") || categoria.includes("temporada") || tipo.includes("transitorio") || categoria.includes("transitorio");
    const ativo = socio.ativo !== false && !["inativo", "cancelado", "cancelada"].includes(situacao);
    return ativo && !remido && !temporada && socio.possui_mensalidade === true;
  };

  const dependenteMap = useMemo(
    () => new Map(dependentes.map((d) => [d.id, d])),
    [dependentes]
  );

  const responsaveis = useMemo(
    () =>
      new Map(
        dependentes.map((d) => [
          d.id,
          socioMap.get(d.socio_id)?.nome || "Responsável não localizado",
        ])
      ),
    [dependentes, socioMap]
  );

  const hoje = useMemo(() => dataHojeBrasil(), []);

  const inadimplentes = useMemo<Inadimplente[]>(() => {
    const grupos = new Map<
      string,
      {
        pessoaId: string;
        socioId: string;
        nome: string;
        matricula: string;
        responsavel: string;
        competencias: Set<string>;
        valor: number;
      }
    >();

    // Começa com todas as pessoas cadastradas para que quem está em dia
    // também apareça no relatório para conferência.
    for (const socio of socios) {
      if (!socioElegivel(socio)) continue;
      grupos.set(socio.id, {
        pessoaId: socio.id,
        socioId: socio.id,
        nome: socio.nome,
        matricula: socio.matricula != null ? String(socio.matricula) : "—",
        responsavel: "Titular",
        competencias: new Set<string>(),
        valor: 0,
      });
    }

    // Mantém compatibilidade com dependentes do modelo antigo.
    for (const dependente of dependentes) {
      if (dependente.ativo === false || dependente.possui_mensalidade !== true) continue;
      const cpfDependente = String(dependente.cpf || "").replace(/\D/g, "");
      const socioMigrado = cpfDependente ? socioPorCpf.get(cpfDependente) : null;
      if (socioMigrado && socioElegivel(socioMigrado)) continue;
      grupos.set(dependente.id, {
        pessoaId: dependente.id,
        socioId: dependente.socio_id,
        nome: dependente.nome,
        matricula: socioMap.get(dependente.socio_id)?.matricula != null
          ? String(socioMap.get(dependente.socio_id)?.matricula)
          : "—",
        responsavel: responsaveis.get(dependente.id) || "—",
        competencias: new Set<string>(),
        valor: 0,
      });
    }

    for (const m of mensalidades) {
      if (!m.data_vencimento || m.data_vencimento.slice(0, 10) >= hoje) continue;
      if (isPago(m) || isIsento(m)) continue;

      const dependente = m.dependente_id
        ? dependenteMap.get(m.dependente_id)
        : null;
      const socio = m.socio_id ? socioMap.get(m.socio_id) : null;
      const cpfDependente = String(dependente?.cpf || "").replace(/\D/g, "");
      const socioMigrado = cpfDependente ? socioPorCpf.get(cpfDependente) : null;
      // Se o cadastro antigo do dependente já foi removido, mas o socio_id
      // está vinculado diretamente ao sócio atual, preserva o histórico nele.
      const pessoaSocio = socioMigrado && socioElegivel(socioMigrado)
        ? socioMigrado
        : !dependente && socio && socioElegivel(socio)
          ? socio
          : null;
      if (m.dependente_id && !dependente && !pessoaSocio) continue;
      const pessoaId = pessoaSocio?.id || dependente?.id || socio?.id;
      if (!pessoaId) continue;
      if (pessoaSocio && !grupos.has(pessoaSocio.id)) continue;
      if (!pessoaSocio && dependente && (dependente.ativo === false || dependente.possui_mensalidade !== true)) continue;
      if (!pessoaSocio && !dependente && socio && !socioElegivel(socio)) continue;

      if (!grupos.has(pessoaId)) {
        grupos.set(pessoaId, {
          pessoaId,
          socioId: m.socio_id || dependente?.socio_id || pessoaId,
          nome: pessoaSocio?.nome || dependente?.nome || socio?.nome || "Pessoa",
          matricula: pessoaSocio?.matricula != null ? String(pessoaSocio.matricula) : socio?.matricula != null ? String(socio.matricula) : "—",
          responsavel: pessoaSocio ? (socioMap.get(pessoaSocio.id)?.nome || "—") : dependente
            ? responsaveis.get(dependente.id) || "—"
            : "Titular",
          competencias: new Set<string>(),
          valor: 0,
        });
      }

      const grupo = grupos.get(pessoaId)!;
      const comp = competenciaBR(m.competencia || m.data_vencimento);

      if (!grupo.competencias.has(comp)) {
        grupo.competencias.add(comp);
        grupo.valor += Number(m.valor || 0);
      }
    }

    // Apuração virtual: o relatório não depende mais de mensalidades terem sido
    // previamente geradas. Usa data de associação; se estiver ausente, toma
    // a primeira competência paga como início do histórico de cobrança.
    const normalizarStatus = (valor: unknown) =>
      String(valor || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const statusQuitadoOuIsento = (registro: Mensalidade) =>
      Boolean(registro.data_pagamento) || [
        "pago", "paga", "paid", "quitado", "quitada", "recebido", "recebida",
        "baixado", "baixada", "compensado", "compensada", "isento", "isenta",
        "cancelado", "cancelada",
      ].includes(normalizarStatus(registro.situacao));

    const statusPago = (registro: Mensalidade) =>
      Boolean(registro.data_pagamento) || [
        "pago", "paga", "paid", "quitado", "quitada", "recebido", "recebida",
        "baixado", "baixada", "compensado", "compensada",
      ].includes(normalizarStatus(registro.situacao));

    const chaveCompetencia = (valor: string | null | undefined) => {
      if (!valor) return "";
      const raw = valor.slice(0, 10);
      if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
      const br = raw.match(/^(\d{2})\/(\d{4})$/);
      return br ? `${br[2]}-${br[1]}` : "";
    };

    const competenciaParaBR = (chave: string) => {
      const [ano, mes] = chave.split("-");
      return `${mes}/${ano}`;
    };

    const mesAtual = hoje.slice(0, 7);

    for (const socio of socios) {
      const tipo = String(socio.tipo_socio || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const categoria = String(socio.categoria || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const situacaoSocio = String(socio.situacao || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const ehRemido = socio.remido === true || tipo.includes("remido") || categoria.includes("remido");
      const ehTemporada = tipo.includes("temporada") || categoria.includes("temporada") || tipo.includes("transitorio") || categoria.includes("transitorio");
      const ativo = !["inativo", "cancelado", "cancelada"].includes(situacaoSocio);
      const cobraMensalidade = socio.possui_mensalidade === true || String(socio.possui_mensalidade || "").toLowerCase() === "true";

      if (ehRemido || ehTemporada || !ativo || !cobraMensalidade) continue;

      const cpfSocio = String(socio.cpf || "").replace(/\D/g, "");
      const rowsSocio = mensalidades.filter((m) => {
        if (String(m.socio_id || "") !== String(socio.id)) return false;
        if (!m.dependente_id) return true;
        const dependente = dependenteMap.get(m.dependente_id);
        // O socio_id da consulta já é o ID do cadastro atual. Se o registro
        // legado do dependente não existe mais, mantém o lançamento nesse sócio.
        if (!dependente) return true;
        const cpfDependente = String(dependente.cpf || "").replace(/\D/g, "");
        // Histórico antigo de uma pessoa migrada para socios: vincula ao CPF atual.
        return Boolean(cpfSocio && cpfDependente && cpfDependente === cpfSocio);
      });
      const paidKeys = rowsSocio
        .filter((m) => statusPago(m))
        .map((m) => chaveCompetencia(m.competencia || m.data_vencimento))
        .filter(Boolean)
        .sort();

      let inicio = chaveCompetencia(socio.data_associacao);
      if (!inicio) inicio = paidKeys[0] || "";
      if (!inicio || !/^\d{4}-\d{2}$/.test(inicio)) continue;

      const valorMensal = Number(socio.valor_mensalidade || 0);
      if (!(valorMensal > 0)) continue;

      const diaVencimento = Math.min(28, Math.max(1, Number(socio.dia_vencimento || 10)));
      const cursor = new Date(`${inicio}-01T00:00:00`);

      while (cursor.toISOString().slice(0, 7) <= mesAtual) {
        const chave = cursor.toISOString().slice(0, 7);
        const compBR = competenciaParaBR(chave);
        const ultimoDia = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        const dia = Math.min(diaVencimento, ultimoDia);
        const vencimento = `${chave}-${String(dia).padStart(2, "0")}`;
        const [anoAssociacao, mesAssociacao, diaAssociacao] = String(socio.data_associacao || "").slice(0, 10).split("-").map(Number);
        const associacaoDepoisDoVencimento = Boolean(socio.data_associacao) && anoAssociacao === cursor.getFullYear() && mesAssociacao === cursor.getMonth() + 1 && Number.isFinite(diaAssociacao) && diaAssociacao > dia;
        if (vencimento < hoje && !associacaoDepoisDoVencimento) {
          const existentes = rowsSocio.filter((m) => chaveCompetencia(m.competencia || m.data_vencimento) === chave);
          const algumaQuitada = existentes.some((m) => statusQuitadoOuIsento(m));
          if (!algumaQuitada) {
            const grupo = grupos.get(socio.id);
            if (grupo && !grupo.competencias.has(compBR)) {
              grupo.competencias.add(compBR);
              const valorExistente = existentes.reduce((sum, m) => sum + Number(m.valor || 0), 0);
              grupo.valor += valorExistente > 0 ? valorExistente : valorMensal;
            }
          }
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    return Array.from(grupos.values())
      .map((g) => {
        const meses = g.competencias.size;
        return {
          ...g,
          competencias: Array.from(g.competencias),
          meses,
          nivel: classificarMesesAtraso(meses, politicaInadimplencia),
        };
      })
      .sort((a, b) => b.meses - a.meses || a.nome.localeCompare(b.nome));
  }, [mensalidades, socios, dependentes, socioMap, socioPorCpf, dependenteMap, responsaveis, hoje, politicaInadimplencia]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return inadimplentes.filter((item) => {
      const bateFiltro =
        filtro === "todos" || item.nivel === filtro;

      const bateBusca =
        !termo ||
        item.nome.toLowerCase().includes(termo) ||
        item.matricula.toLowerCase().includes(termo) ||
        item.responsavel.toLowerCase().includes(termo);

      return bateFiltro && bateBusca;
    });
  }, [inadimplentes, filtro, busca]);

  const totalDevido = inadimplentes.reduce((s, i) => s + i.valor, 0);
  const verdes = inadimplentes.filter((i) => i.nivel === "verde").length;
  const amarelos = inadimplentes.filter((i) => i.nivel === "amarelo").length;
  const vermelhos = inadimplentes.filter((i) => i.nivel === "vermelho").length;

  function abrirSocio(item: Inadimplente) {
    router.push(`/socios?id=${encodeURIComponent(item.socioId)}`);
  }

  function imprimir() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#18362b]">
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }

          body {
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .area-impressao,
          .area-impressao * {
            visibility: visible !important;
          }

          .area-impressao {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            background: white !important;
          }

          .nao-imprimir {
            display: none !important;
          }
        }
      `}</style>

      <CabecalhoPadrao />
      <MenuLateralPadrao />

      <main className="area-impressao mx-auto max-w-[1500px] px-6 py-8 lg:ml-[220px]">
        <div className="nao-imprimir mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <button
              onClick={() => router.push("/relatorios")}
              className="mb-3 text-sm font-semibold text-[#005a3c]"
            >
              ← Voltar para Relatórios
            </button>
            <p className="text-sm font-medium text-gray-500">Financeiro</p>
            <h1 className="mt-1 text-3xl font-extrabold text-[#005a3c]">
              Relatório de Inadimplência
            </h1>
            <p className="mt-1 text-gray-500">
              Controle de mensalidades, situação por meses em atraso e valores devidos.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={carregar}
              className="rounded-xl border border-[#cddbd4] bg-white px-4 py-3 text-sm font-bold text-[#005a3c]"
            >
              ↻ Atualizar
            </button>
            <button
              onClick={imprimir}
              className="rounded-xl bg-[#005a3c] px-5 py-3 text-sm font-bold text-white"
            >
              🖨️ Imprimir / Salvar PDF
            </button>
          </div>
        </div>

        {erro && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            Erro ao carregar: {erro}
          </div>
        )}

        {carregando ? (
          <div className="rounded-2xl border border-[#dfe7e2] bg-white p-12 text-center text-gray-500 shadow-sm">
            Carregando inadimplência...
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Pessoas monitoradas</p>
                <p className="mt-2 text-3xl font-extrabold text-[#005a3c]">
                  {inadimplentes.length}
                </p>
                <p className="mt-1 text-xs text-gray-500">Em dia + atenção + crítico</p>
              </div>

              <div className="rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">0 a {politicaInadimplencia.meses_atencao - 1} meses</p>
                <p className="mt-2 text-3xl font-extrabold text-green-600">
                  {verdes}
                </p>
                <p className="mt-1 text-xs text-gray-500">Dentro da tolerância de acesso</p>
              </div>

              <div className="rounded-2xl border border-yellow-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">{politicaInadimplencia.meses_atencao}–{politicaInadimplencia.meses_bloqueio - 1} meses</p>
                <p className="mt-2 text-3xl font-extrabold text-yellow-600">
                  {amarelos}
                </p>
                <p className="mt-1 text-xs text-gray-500">Atenção</p>
              </div>

              <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">{politicaInadimplencia.meses_bloqueio}+ meses</p>
                <p className="mt-2 text-3xl font-extrabold text-red-600">
                  {vermelhos}
                </p>
                <p className="mt-1 text-xs text-gray-500">Bloqueio da entrada</p>
              </div>

              <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Valor total devido</p>
                <p className="mt-2 text-3xl font-extrabold text-[#005a3c]">
                  {moeda(totalDevido)}
                </p>
                <p className="mt-1 text-xs text-gray-500">Mensalidades vencidas</p>
              </div>
            </div>

            <div className="mb-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <div className="flex-1">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-500">
                    Buscar
                  </label>
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome, matrícula ou responsável..."
                    className="w-full rounded-xl border border-[#d5e0da] px-4 py-3 outline-none focus:border-[#005a3c]"
                  />
                </div>

                <div className="flex gap-2">
                  {[
                    ["todos", "Todos"],
                    ["verde", `🟢 0–${politicaInadimplencia.meses_atencao - 1} meses`],
                    ["amarelo", `🟡 ${politicaInadimplencia.meses_atencao}–${politicaInadimplencia.meses_bloqueio - 1} meses`],
                    ["vermelho", `🔴 ${politicaInadimplencia.meses_bloqueio}+ meses`],
                  ].map(([valor, label]) => (
                    <button
                      key={valor}
                      onClick={() => setFiltro(valor as typeof filtro)}
                      className={`rounded-xl px-4 py-3 text-sm font-bold ${
                        filtro === valor
                          ? "bg-[#005a3c] text-white"
                          : "border border-[#d5e0da] bg-white text-[#18362b]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full bg-green-50 px-3 py-2 text-green-700">
                  🟢 0–{politicaInadimplencia.meses_atencao - 1} meses: Em dia
                </span>
                <span className="rounded-full bg-yellow-50 px-3 py-2 text-yellow-700">
                  🟡 {politicaInadimplencia.meses_atencao}–{politicaInadimplencia.meses_bloqueio - 1} meses: Atenção
                </span>
                <span className="rounded-full bg-red-50 px-3 py-2 text-red-700">
                  🔴 {politicaInadimplencia.meses_bloqueio} meses ou mais: Bloqueio
                </span>
              </div>
            </div>

            <section className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
              <div className="border-b border-[#dfe7e2] p-5">
                <h2 className="text-xl font-extrabold text-[#003d2b]">
                  Controle de mensalidades
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {filtrados.length} registro(s) encontrado(s).
                </p>
              </div>

              {filtrados.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-4xl">✅</div>
                  <h3 className="mt-3 font-extrabold text-[#005a3c]">
                    Nenhuma pessoa encontrada com esse filtro
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Ajuste os filtros ou atualize os dados.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[#e8f3ee] text-left text-xs uppercase tracking-wide text-gray-600">
                      <tr>
                        <th className="px-5 py-4">Pessoa</th>
                        <th className="px-5 py-4">Matrícula</th>
                        <th className="px-5 py-4">Responsável</th>
                        <th className="px-5 py-4">Meses</th>
                        <th className="px-5 py-4">Competências</th>
                        <th className="px-5 py-4">Valor devido</th>
                        <th className="nao-imprimir px-5 py-4">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map((item) => (
                        <tr key={item.pessoaId} className="border-t border-[#e5ece8]">
                          <td className="px-5 py-4 font-extrabold text-[#18362b]">
                            {item.nome}
                          </td>
                          <td className="px-5 py-4">{item.matricula}</td>
                          <td className="px-5 py-4 text-gray-600">
                            {item.responsavel}
                          </td>
                          <td className="px-5 py-4">
                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${
                                item.nivel === "vermelho"
                                  ? "bg-red-100 text-red-700"
                                  : item.nivel === "amarelo"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-green-100 text-green-700"
                              }`}
                            >
                              {item.meses} {item.meses === 1 ? "mês" : "meses"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-gray-600">
                            {item.competencias.length ? item.competencias.join(", ") : "Nenhuma em atraso"}
                          </td>
                          <td className={`px-5 py-4 font-extrabold ${item.nivel === "verde" ? "text-green-600" : "text-red-600"}`}>
                            {moeda(item.valor)}
                          </td>
                          <td className="nao-imprimir px-5 py-4">
                            <button
                              onClick={() => abrirSocio(item)}
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
            </section>
          </>
        )}
      </main>
    </div>
  );
}
