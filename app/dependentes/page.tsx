"use client";

import { useEffect, useMemo, useState } from "react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import { supabase } from "@/lib/supabaseClient";

type Socio = {
  id: string;
  matricula?: number | string | null;
  nome: string;
  cpf?: string | null;
  data_nascimento?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  foto_url?: string | null;
  parentesco?: string | null;
  responsavel_id?: string | null;
  possui_mensalidade?: boolean | null;
  valor_mensalidade?: number | null;
  situacao?: string | null;
  tipo_socio?: string | null;
};

type Mensalidade = {
  socio_id: string;
  data_vencimento?: string | null;
  situacao?: string | null;
};

function pago(situacao?: string | null) {
  return ["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(
    String(situacao || "").toLowerCase()
  );
}

function statusFinanceiro(mensalidades: Mensalidade[], socioId: string) {
  const hoje = new Date();
  const pendentes = mensalidades.filter(
    (m) => String(m.socio_id) === String(socioId) && !pago(m.situacao)
  );

  let maxDias = 0;
  for (const m of pendentes) {
    if (!m.data_vencimento) continue;
    const d = new Date(`${String(m.data_vencimento).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const dias = Math.floor((hoje.getTime() - d.getTime()) / 86400000);
    if (dias > maxDias) maxDias = dias;
  }

  if (maxDias <= 14) return "em_dia";
  if (maxDias <= 60) return "atrasado";
  return "muito_atrasado";
}

function cpf(valor?: string | null) {
  if (!valor) return "—";
  const d = valor.replace(/\D/g, "");
  return d.length === 11
    ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    : valor;
}

function dataBR(valor?: string | null) {
  if (!valor) return "—";
  const d = new Date(`${String(valor).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString("pt-BR");
}

function statusLabel(status: string) {
  if (status === "em_dia") return { label: "Em dia", classe: "bg-emerald-100 text-emerald-700" };
  if (status === "atrasado") return { label: "Em atraso", classe: "bg-yellow-100 text-yellow-700" };
  return { label: "Muito atrasado", classe: "bg-red-100 text-red-700" };
}

export default function DependentesPage() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [busca, setBusca] = useState("");
  const [responsavelFiltro, setResponsavelFiltro] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("todos");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.replace("/login");
        return;
      }

      const [{ data: sociosData, error: sociosError }, { data: mensalidadesData, error: mensalidadesError }] =
        await Promise.all([
          supabase.from("socios").select("*").order("nome", { ascending: true }),
          supabase.from("mensalidades").select("socio_id,data_vencimento,situacao"),
        ]);

      if (!ativo) return;
      if (sociosError || mensalidadesError) {
        setErro("Não foi possível carregar os dependentes.");
        setCarregando(false);
        return;
      }

      setSocios((sociosData || []) as Socio[]);
      setMensalidades((mensalidadesData || []) as Mensalidade[]);
      setCarregando(false);
    })();

    return () => {
      ativo = false;
    };
  }, []);

  const dependentes = useMemo(
    () => socios.filter((s) => Boolean(s.responsavel_id) && s.possui_mensalidade !== true),
    [socios]
  );

  const responsaveis = useMemo(() => {
    const ids = new Set(dependentes.map((d) => d.responsavel_id).filter(Boolean));
    return socios.filter((s) => ids.has(s.id));
  }, [socios, dependentes]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return dependentes.filter((d) => {
      const responsavel = socios.find((s) => s.id === d.responsavel_id);
      const status = responsavel
        ? statusFinanceiro(mensalidades, responsavel.id)
        : "em_dia";

      const correspondeBusca =
        !termo ||
        d.nome.toLowerCase().includes(termo) ||
        String(d.cpf || "").toLowerCase().includes(termo) ||
        String(d.parentesco || "").toLowerCase().includes(termo) ||
        String(responsavel?.nome || "").toLowerCase().includes(termo) ||
        String(d.matricula || "").includes(termo);

      const correspondeResponsavel =
        !responsavelFiltro || d.responsavel_id === responsavelFiltro;

      const correspondeSituacao =
        situacaoFiltro === "todos" ||
        (situacaoFiltro === "ativos" && d.situacao?.toLowerCase() === "ativo") ||
        (situacaoFiltro === "inativos" && d.situacao?.toLowerCase() !== "ativo") ||
        (situacaoFiltro === "em_dia" && status === "em_dia") ||
        (situacaoFiltro === "atrasado" && status === "atrasado") ||
        (situacaoFiltro === "muito_atrasado" && status === "muito_atrasado");

      return correspondeBusca && correspondeResponsavel && correspondeSituacao;
    });
  }, [dependentes, busca, responsavelFiltro, situacaoFiltro, socios, mensalidades]);

  const ativos = dependentes.filter((s) => s.situacao?.toLowerCase() === "ativo").length;
  const inativos = dependentes.length - ativos;

  function editar(id: string) {
    window.location.href = `/socios?editar=${encodeURIComponent(id)}`;
  }

  function novoDependente() {
    window.location.href = "/socios";
  }

  return (
    <main className="min-h-screen min-w-0 overflow-x-hidden bg-[#f8faf9] text-[#173d2e]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />

      <section className="min-w-0 p-5 sm:p-7 lg:ml-[220px] lg:p-8">
        <div className="mb-6 flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-500">Administração</p>
            <h2 className="mt-1 text-3xl font-bold text-[#005a3c]">Dependentes</h2>
            <p className="mt-1 text-gray-500">
              Cadastro e gerenciamento dos dependentes dos associados.
            </p>
          </div>
          <button
            onClick={novoDependente}
            className="shrink-0 rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white shadow-sm hover:bg-[#003d2b]"
          >
            + Novo Dependente
          </button>
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Total de dependentes</p>
            <p className="mt-1 text-3xl font-bold text-[#005a3c]">{dependentes.length}</p>
          </div>
          <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Dependentes ativos</p>
            <p className="mt-1 text-3xl font-bold text-[#005a3c]">{ativos}</p>
          </div>
          <div className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Dependentes inativos</p>
            <p className="mt-1 text-3xl font-bold text-gray-600">{inativos}</p>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-[#e2ebe6] bg-white p-4 shadow-sm">
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_260px_180px]">
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-[#d5e0da] px-3">
              <span className="shrink-0 text-xl">🔎</span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, CPF, parentesco ou sócio..."
                className="min-w-0 w-full py-3 outline-none"
              />
            </div>
            <select
              value={responsavelFiltro}
              onChange={(e) => setResponsavelFiltro(e.target.value)}
              className="w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none"
            >
              <option value="">Todos os responsáveis</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </select>
            <select
              value={situacaoFiltro}
              onChange={(e) => setSituacaoFiltro(e.target.value)}
              className="w-full rounded-xl border border-[#d5e0da] bg-white px-3 py-3 outline-none"
            >
              <option value="todos">Todos</option>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
              <option value="em_dia">Financeiro em dia</option>
              <option value="atrasado">Financeiro em atraso</option>
              <option value="muito_atrasado">Financeiro muito atrasado</option>
            </select>
          </div>
        </div>

        {erro && <div className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}

        <div className="w-full overflow-hidden rounded-2xl border border-[#e2ebe6] bg-white shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[1450px] border-separate border-spacing-0">
              <thead className="bg-[#e8f3ee]">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="whitespace-nowrap px-4 py-4">Foto</th>
                  <th className="whitespace-nowrap px-4 py-4">Nome</th>
                  <th className="whitespace-nowrap px-4 py-4">Parentesco</th>
                  <th className="whitespace-nowrap px-4 py-4">Nascimento</th>
                  <th className="whitespace-nowrap px-4 py-4">CPF</th>
                  <th className="whitespace-nowrap px-4 py-4">Responsável</th>
                  <th className="whitespace-nowrap px-4 py-4">Telefone</th>
                  <th className="whitespace-nowrap px-4 py-4">Mensalidade</th>
                  <th className="whitespace-nowrap px-4 py-4">Financeiro</th>
                  <th className="whitespace-nowrap px-4 py-4">Situação</th>
                  <th className="sticky right-0 z-20 whitespace-nowrap bg-[#e8f3ee] px-4 py-4 text-right shadow-[-5px_0_10px_rgba(0,0,0,0.05)]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2ef]">
                {carregando && (
                  <tr><td colSpan={11} className="px-5 py-12 text-center text-gray-500">Carregando dependentes...</td></tr>
                )}
                {!carregando && filtrados.length === 0 && (
                  <tr><td colSpan={11} className="px-5 py-12 text-center text-gray-500">Nenhum dependente encontrado.</td></tr>
                )}
                {!carregando && filtrados.map((d) => {
                  const responsavel = socios.find((s) => s.id === d.responsavel_id);
                  const status = responsavel ? statusFinanceiro(mensalidades, responsavel.id) : "em_dia";
                  const statusInfo = statusLabel(status);
                  return (
                    <tr key={d.id} className="hover:bg-[#fafcfb]">
                      <td className="whitespace-nowrap px-4 py-3">
                        {d.foto_url ? <img src={d.foto_url} alt={d.nome} className="h-10 w-10 rounded-full object-cover" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f3ee]">👤</div>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-[#173d2e]">{d.nome}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{d.parentesco || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{dataBR(d.data_nascimento)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{cpf(d.cpf)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{responsavel?.nome || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{d.whatsapp || d.telefone || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-gray-500">Sem mensalidade</td>
                      <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusInfo.classe}`}>{statusInfo.label}</span></td>
                      <td className="whitespace-nowrap px-4 py-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${d.situacao?.toLowerCase() === "ativo" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{d.situacao?.toLowerCase() === "ativo" ? "Ativo" : "Inativo"}</span></td>
                      <td className="sticky right-0 z-10 whitespace-nowrap bg-white px-4 py-3 text-right shadow-[-5px_0_10px_rgba(0,0,0,0.05)]">
                        <button onClick={() => editar(d.id)} className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-sm font-semibold text-[#005a3c] hover:bg-[#dce8df]">✏️ Editar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
