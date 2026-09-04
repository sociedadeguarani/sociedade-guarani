"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Socio = {
  id: string;
  matricula: string | number | null;
  nome: string;
};

type Dependente = {
  id: string;
  socio_id: string;
  nome: string;
  ativo: boolean | null;
};

type Mensalidade = {
  id: string;
  socio_id: string | null;
  dependente_id: string | null;
  referencia: string | null;
  vencimento: string | null;
  valor: number | string | null;
  status: string | null;
  situacao: string | null;
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
  nivel: "amarelo" | "vermelho";
};

function moeda(valor: number | string | null | undefined) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataBR(valor: string | null | undefined) {
  if (!valor) return "—";
  const partes = valor.slice(0, 10).split("-");
  if (partes.length !== 3) return valor;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function competenciaBR(valor: string | null | undefined) {
  if (!valor) return "—";
  const partes = valor.slice(0, 10).split("-");
  if (partes.length < 2) return valor;
  return `${partes[1]}/${partes[0]}`;
}

function isPago(m: Mensalidade) {
  const status = String(m.situacao || m.status || "").toLowerCase();
  return ["pago", "paid", "quitado", "recebido"].includes(status);
}

function isIsento(m: Mensalidade) {
  const status = String(m.situacao || m.status || "").toLowerCase();
  return ["isento", "isenta"].includes(status);
}

export default function InadimplenciaPage() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "amarelo" | "vermelho">("todos");
  const [busca, setBusca] = useState("");

  async function carregar() {
    setCarregando(true);
    setErro("");

    const [sociosResult, dependentesResult, mensalidadesResult] =
      await Promise.all([
        supabase.from("socios").select("id,matricula,nome").order("nome"),
        supabase
          .from("dependentes")
          .select("id,socio_id,nome,ativo")
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("mensalidades")
          .select(
            "id,socio_id,dependente_id,referencia,vencimento,valor,status,situacao"
          )
          .order("vencimento", { ascending: false }),
      ]);

    if (sociosResult.error) {
      setErro(sociosResult.error.message);
      setCarregando(false);
      return;
    }

    if (dependentesResult.error) {
      setErro(dependentesResult.error.message);
      setCarregando(false);
      return;
    }

    if (mensalidadesResult.error) {
      setErro(mensalidadesResult.error.message);
      setCarregando(false);
      return;
    }

    setSocios((sociosResult.data || []) as Socio[]);
    setDependentes((dependentesResult.data || []) as Dependente[]);
    setMensalidades((mensalidadesResult.data || []) as Mensalidade[]);
    setCarregando(false);
  }

  useEffect(() => {
    void carregar();
  }, []);

  const socioMap = useMemo(
    () => new Map(socios.map((s) => [s.id, s])),
    [socios]
  );

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

  const hoje = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

    for (const m of mensalidades) {
      if (!m.vencimento || m.vencimento.slice(0, 10) >= hoje) continue;
      if (isPago(m) || isIsento(m)) continue;

      const dependente = m.dependente_id
        ? dependenteMap.get(m.dependente_id)
        : null;
      const socio = m.socio_id ? socioMap.get(m.socio_id) : null;

      const pessoaId = dependente?.id || socio?.id;
      if (!pessoaId) continue;

      const nome = dependente?.nome || socio?.nome || "Pessoa";
      const matricula = socio?.matricula != null ? String(socio.matricula) : "—";
      const responsavel = dependente
        ? responsaveis.get(dependente.id) || "—"
        : "Titular";

      if (!grupos.has(pessoaId)) {
        grupos.set(pessoaId, {
          pessoaId,
          socioId: m.socio_id || dependente?.socio_id || pessoaId,
          nome,
          matricula,
          responsavel,
          competencias: new Set<string>(),
          valor: 0,
        });
      }

      const grupo = grupos.get(pessoaId)!;
      const comp = competenciaBR(m.referencia || m.vencimento);

      if (!grupo.competencias.has(comp)) {
        grupo.competencias.add(comp);
        grupo.valor += Number(m.valor || 0);
      }
    }

    return Array.from(grupos.values())
      .map((g) => {
        const meses = g.competencias.size;
        return {
          ...g,
          competencias: Array.from(g.competencias),
          meses,
          nivel: meses >= 3 ? "vermelho" : "amarelo",
        };
      })
      .sort((a, b) => b.meses - a.meses || a.nome.localeCompare(b.nome));
  }, [mensalidades, socioMap, dependenteMap, responsaveis, hoje]);

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
  const amarelos = inadimplentes.filter((i) => i.nivel === "amarelo").length;
  const vermelhos = inadimplentes.filter((i) => i.nivel === "vermelho").length;

  function abrirSocio(item: Inadimplente) {
    window.location.href = `/socios?id=${encodeURIComponent(item.socioId)}`;
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

      <header className="sticky top-0 z-20 border-b border-[#dfe7e2] bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4">
          <button
            onClick={() => (window.location.href = "/painel")}
            className="flex items-center gap-3 text-left"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#005a3c] text-xl">
              🏛️
            </div>
            <div>
              <div className="text-lg font-extrabold text-[#005a3c]">
                SOCIEDADE GUARANI
              </div>
              <div className="text-xs text-gray-500">
                Sociedade Recreativa Guarani — S.R.G.
              </div>
            </div>
          </button>

          <div className="text-sm font-medium text-gray-400">
            Área Administrativa
          </div>
        </div>
      </header>

      <main className="area-impressao mx-auto max-w-[1500px] px-6 py-8">
        <div className="nao-imprimir mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <button
              onClick={() => (window.location.href = "/relatorios")}
              className="mb-3 text-sm font-semibold text-[#005a3c]"
            >
              ← Voltar para Relatórios
            </button>
            <p className="text-sm font-medium text-gray-500">Financeiro</p>
            <h1 className="mt-1 text-3xl font-extrabold text-[#005a3c]">
              Relatório de Inadimplência
            </h1>
            <p className="mt-1 text-gray-500">
              Controle de mensalidades vencidas, quantidade de meses e valores devidos.
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
            <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">Total inadimplentes</p>
                <p className="mt-2 text-3xl font-extrabold text-red-600">
                  {inadimplentes.length}
                </p>
                <p className="mt-1 text-xs text-gray-500">Sócios e dependentes</p>
              </div>

              <div className="rounded-2xl border border-yellow-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">1 ou 2 meses</p>
                <p className="mt-2 text-3xl font-extrabold text-yellow-600">
                  {amarelos}
                </p>
                <p className="mt-1 text-xs text-gray-500">Atenção</p>
              </div>

              <div className="rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
                <p className="text-sm text-gray-500">3+ meses</p>
                <p className="mt-2 text-3xl font-extrabold text-red-600">
                  {vermelhos}
                </p>
                <p className="mt-1 text-xs text-gray-500">Inadimplência crítica</p>
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
                    ["amarelo", "🟡 1–2 meses"],
                    ["vermelho", "🔴 3+ meses"],
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
                  🟢 Em dia: não aparece na lista
                </span>
                <span className="rounded-full bg-yellow-50 px-3 py-2 text-yellow-700">
                  🟡 1–2 meses em atraso
                </span>
                <span className="rounded-full bg-red-50 px-3 py-2 text-red-700">
                  🔴 3 meses ou mais
                </span>
              </div>
            </div>

            <section className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
              <div className="border-b border-[#dfe7e2] p-5">
                <h2 className="text-xl font-extrabold text-[#003d2b]">
                  Inadimplentes
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {filtrados.length} registro(s) encontrado(s).
                </p>
              </div>

              {filtrados.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-4xl">✅</div>
                  <h3 className="mt-3 font-extrabold text-[#005a3c]">
                    Nenhum inadimplente encontrado
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
                                  : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {item.meses} {item.meses === 1 ? "mês" : "meses"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-gray-600">
                            {item.competencias.join(", ")}
                          </td>
                          <td className="px-5 py-4 font-extrabold text-red-600">
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

