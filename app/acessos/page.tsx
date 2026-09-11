"use client";

import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Search, ShieldAlert, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";

type Acesso = {
  id: string;
  socio_id: string;
  usuario_id: string;
  entrada_em: string;
  resultado: string | null;
  socio?: { nome: string; matricula: number | string | null; foto_url?: string | null } | null;
  usuario?: { nome_exibicao: string | null } | null;
};

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function RelatorioAcessosPage() {
  const [data, setData] = useState(hojeISO());
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar(dataEscolhida: string) {
    setCarregando(true);
    setErro("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login?redirect=/acessos/relatorio";
        return;
      }
      const r = await fetch(`/api/acessos?de=${dataEscolhida}&ate=${dataEscolhida}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível carregar os acessos.");
      setAcessos(d.acessos || []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar os acessos.");
      setAcessos([]);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const termo = busca.trim().toLowerCase();
  const filtrados = acessos.filter((a) => {
    if (!termo) return true;
    return (
      a.socio?.nome?.toLowerCase().includes(termo) ||
      String(a.socio?.matricula || "").includes(termo)
    );
  });

  const totalLiberados = filtrados.filter((a) => a.resultado === "liberado").length;
  const totalBloqueados = filtrados.filter((a) => a.resultado === "bloqueado").length;

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <p className="text-sm text-gray-500">Portaria</p>
            <h1 className="text-3xl font-extrabold text-[#005a3c]">Relatório de acessos</h1>
            <p className="mt-1 text-sm text-gray-500">Consulte quantas pessoas entraram e em que horário, por dia.</p>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border bg-white p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <label className="block">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-gray-500">
                <CalendarDays className="mr-1 inline h-4 w-4" />Data
              </span>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="rounded-xl border px-4 py-3 outline-none focus:border-[#005a3c]"
              />
            </label>

            <label className="block flex-1 sm:max-w-xs">
              <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-gray-500">
                <Search className="mr-1 inline h-4 w-4" />Buscar nome ou matrícula
              </span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Ex.: João ou 00125"
                className="w-full rounded-xl border px-4 py-3 outline-none focus:border-[#005a3c]"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Total de acessos no dia</p>
              <p className="mt-1 text-3xl font-black text-[#005a3c]">{filtrados.length}</p>
            </div>
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Liberados</p>
              <p className="mt-1 text-3xl font-black text-green-700">{totalLiberados}</p>
            </div>
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Bloqueados</p>
              <p className="mt-1 text-3xl font-black text-red-700">{totalBloqueados}</p>
            </div>
          </div>

          {erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">{erro}</div>}

          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-[#e8f3ee] text-xs font-black uppercase text-gray-500">
                  <tr>
                    <th className="p-3 text-left">Horário</th>
                    <th className="p-3 text-left">Associado</th>
                    <th className="p-3 text-left">Matrícula</th>
                    <th className="p-3 text-left">Resultado</th>
                    <th className="p-3 text-left">Registrado por</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {carregando && (
                    <tr><td colSpan={5} className="p-10 text-center text-gray-500">Carregando acessos...</td></tr>
                  )}
                  {!carregando && filtrados.length === 0 && (
                    <tr><td colSpan={5} className="p-10 text-center text-gray-500">Nenhum acesso registrado nesse dia.</td></tr>
                  )}
                  {!carregando && filtrados.map((a) => (
                    <tr key={a.id}>
                      <td className="p-3 font-bold">{new Date(a.entrada_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gray-100">
                            {a.socio?.foto_url ? <img src={a.socio.foto_url} alt={a.socio.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><UserRound className="h-4 w-4 text-gray-400" /></div>}
                          </div>
                          <span className="font-semibold">{a.socio?.nome || "—"}</span>
                        </div>
                      </td>
                      <td className="p-3">{a.socio?.matricula || "—"}</td>
                      <td className="p-3">
                        {a.resultado === "liberado" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />Liberado</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700"><ShieldAlert className="h-3.5 w-3.5" />Bloqueado</span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-gray-600">{a.usuario?.nome_exibicao || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
