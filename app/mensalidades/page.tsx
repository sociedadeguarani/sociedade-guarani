"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, QrCode, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Mensalidade = {
  id: string;
  competencia: string;
  valor: number;
  data_vencimento: string | null;
  situacao: string | null;
  data_pagamento: string | null;
  tipo_pagamento: string | null;
  numero_recibo: string | null;
};

type ConfigPix = {
  chave_pix: string | null;
  nome_recebedor: string | null;
  cidade: string | null;
  copia_e_cola: string | null;
} | null;

function formatarMoeda(valor: number | null | undefined) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarCompetencia(valor: string) {
  const p = valor.slice(0, 7).split("-");
  return p.length === 2 ? `${p[1]}/${p[0]}` : valor;
}

function formatarData(valor: string | null) {
  if (!valor) return "—";
  const p = valor.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : valor;
}

function situacaoInfo(situacao: string | null) {
  if (situacao === "pago") return { texto: "Pago", cor: "bg-green-100 text-green-700" };
  if (situacao === "em_atraso") return { texto: "Em atraso", cor: "bg-red-100 text-red-700" };
  if (situacao === "isento") return { texto: "Isento", cor: "bg-gray-100 text-gray-600" };
  return { texto: "Em aberto", cor: "bg-yellow-100 text-yellow-700" };
}

export default function MinhasMensalidadesPage() {
  const [nome, setNome] = useState("");
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [pix, setPix] = useState<ConfigPix>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      setErro("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          window.location.href = "/login?redirect=/mensalidades";
          return;
        }

        const r = await fetch("/api/mensalidades/minhas", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Não foi possível carregar suas mensalidades.");

        setNome(d.socio?.nome || "");
        setMensalidades(d.mensalidades || []);

        const rp = await fetch("/api/configuracao-pix", { cache: "no-store" });
        const jp = await rp.json().catch(() => ({}));
        if (rp.ok) setPix(jp.config || null);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar suas mensalidades.");
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, []);

  const pendentes = mensalidades.filter((m) => m.situacao === "em_aberto" || m.situacao === "em_atraso");
  const totalPendente = pendentes.reduce((soma, m) => soma + Number(m.valor || 0), 0);

  function copiarPix() {
    if (!pix?.copia_e_cola) return;
    navigator.clipboard.writeText(pix.copia_e_cola).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          <div>
            <p className="text-sm text-gray-500">Financeiro</p>
            <h1 className="text-3xl font-extrabold text-[#005a3c]">Minhas mensalidades</h1>
            <p className="mt-1 text-sm text-gray-500">{nome ? `Olá, ${nome}.` : "Acompanhe suas mensalidades e pagamentos."}</p>
          </div>

          {erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-800">{erro}</div>}

          {!carregando && pendentes.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 font-black text-amber-900">
                <Clock className="h-5 w-5" />
                Você tem {pendentes.length} mensalidade(s) pendente(s) — total de {formatarMoeda(totalPendente)}
              </div>

              {pix?.copia_e_cola && (
                <div className="mt-4 rounded-xl bg-white p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#005a3c]"><QrCode className="h-4 w-4" /> Pagar via PIX (copia e cola)</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input readOnly value={pix.copia_e_cola} className="w-full rounded-lg border px-3 py-2 text-xs" onFocus={(e) => e.target.select()} />
                    <button onClick={copiarPix} className="shrink-0 rounded-lg bg-[#005a3c] px-4 py-2 text-sm font-bold text-white">
                      {copiado ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Depois de pagar, envie o comprovante para a administração para confirmarem o pagamento.</p>
                </div>
              )}
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="bg-[#e8f3ee] text-xs font-black uppercase text-gray-500">
                  <tr>
                    <th className="p-3 text-left">Competência</th>
                    <th className="p-3 text-left">Vencimento</th>
                    <th className="p-3 text-left">Valor</th>
                    <th className="p-3 text-left">Situação</th>
                    <th className="p-3 text-left">Pagamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {carregando && (
                    <tr><td colSpan={5} className="p-10 text-center text-gray-500">Carregando...</td></tr>
                  )}
                  {!carregando && mensalidades.length === 0 && (
                    <tr><td colSpan={5} className="p-10 text-center text-gray-500">Nenhuma mensalidade lançada ainda.</td></tr>
                  )}
                  {!carregando && mensalidades.map((m) => {
                    const info = situacaoInfo(m.situacao);
                    return (
                      <tr key={m.id}>
                        <td className="p-3 font-semibold">{formatarCompetencia(m.competencia)}</td>
                        <td className="p-3">{formatarData(m.data_vencimento)}</td>
                        <td className="p-3 font-bold text-[#005a3c]">{formatarMoeda(m.valor)}</td>
                        <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${info.cor}`}>{info.texto}</span></td>
                        <td className="p-3 text-sm text-gray-600">
                          {m.situacao === "pago" ? (
                            <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" />{formatarData(m.data_pagamento)}</span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 text-sm text-gray-500 shadow-sm">
            <p className="flex items-center gap-2 font-bold text-[#005a3c]"><Wallet className="h-4 w-4" /> Dúvidas sobre sua mensalidade?</p>
            <p className="mt-1">Fale com a administração da Sociedade Guarani.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

