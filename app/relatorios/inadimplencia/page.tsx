"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";
import {
  classificarMesesAtraso,
  normalizarPoliticaInadimplencia,
  POLITICA_INADIMPLENCIA_PADRAO,
  type PoliticaInadimplencia,
} from "@/lib/politicaInadimplencia";

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

type PessoaResumoServidor = {
  pessoa: {
    chave: string;
    socio_id: string;
    nome: string;
    matricula: string | number | null;
    responsavel_nome: string | null;
  };
  meses: number;
  valorDevido: number;
  competencias: string[];
};

type DadosInadimplencia = {
  pessoas: PessoaResumoServidor[];
  politica: PoliticaInadimplencia;
};

function moeda(valor: number | string | null | undefined) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function buscarDadosInadimplencia(): Promise<DadosInadimplencia> {
  const { data: authData } = await supabase.auth.getSession();
  const token = authData.session?.access_token;
  if (!token) throw new Error("Sessão expirada.");

  const response = await fetch("/api/financeiro/inadimplencia", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const resultado = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(resultado?.error || "Não foi possível carregar o relatório de inadimplência.");
  }

  const politica = normalizarPoliticaInadimplencia(
    resultado?.politica || POLITICA_INADIMPLENCIA_PADRAO,
  );
  const pessoas = Array.isArray(resultado?.pessoas)
    ? resultado.pessoas as PessoaResumoServidor[]
    : [];

  return {
    politica,
    pessoas: pessoas.map((item) => {
      const meses = Math.max(0, Number(item.meses || 0));
      return {
        pessoaId: item.pessoa.chave,
        socioId: item.pessoa.socio_id,
        nome: item.pessoa.nome,
        matricula: item.pessoa.matricula != null ? String(item.pessoa.matricula) : "—",
        responsavel: item.pessoa.responsavel_nome || "Titular",
        meses,
        valor: Number(item.valorDevido || 0),
        competencias: Array.isArray(item.competencias) ? item.competencias : [],
        nivel: classificarMesesAtraso(meses, politica),
      };
    }),
  };
}

export default function InadimplenciaPage() {
  const router = useRouter();
  const [inadimplentes, setInadimplentes] = useState<Inadimplente[]>([]);
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
      setInadimplentes(dados.pessoas);
      setPoliticaInadimplencia(dados.politica);
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

    void buscarDadosInadimplencia()
      .then((dados) => {
        if (!ativo) return;
        setInadimplentes(dados.pessoas);
        setPoliticaInadimplencia(dados.politica);
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
