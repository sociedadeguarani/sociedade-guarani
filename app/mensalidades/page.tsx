"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, QrCode, Wallet, Upload } from "lucide-react";
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
  comprovante_url?: string | null;
  comprovante_status?: string | null;
  motivo_recusa?: string | null;
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
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const [mensagemPagamento, setMensagemPagamento] = useState("");
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [arquivoLote, setArquivoLote] = useState<File | null>(null);
  const [abrindoUploadLote, setAbrindoUploadLote] = useState(false);

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

  async function enviarComprovanteLote(arquivo: File | null) {
    if (!arquivo || selecionadas.length === 0) return;
    setEnviandoId("lote");
    setMensagemPagamento("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Entre novamente.");
      const form = new FormData();
      form.append("origem_tipo", "mensalidade");
      form.append("origem_ids", JSON.stringify(selecionadas));
      form.append("arquivo", arquivo);
      const r = await fetch("/api/comprovantes/pagamentos", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` }, body: form, cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível enviar o comprovante.");
      setMensagemPagamento(`Comprovante enviado para ${selecionadas.length} mensalidade(s). A administração irá analisar o pagamento.`);
      setMensalidades((lista) => lista.map((m) => selecionadas.includes(m.id) ? { ...m, comprovante_url: d.url, comprovante_status: "pendente" } : m));
      setSelecionadas([]);
      setArquivoLote(null);
      setAbrindoUploadLote(false);
    } catch (e) {
      setMensagemPagamento(e instanceof Error ? e.message : "Erro ao enviar comprovante.");
    } finally {
      setEnviandoId(null);
    }
  }

  const pendentesSemComprovante = useMemo(
    () => pendentes.filter((m) => m.comprovante_status !== "pendente"),
    [pendentes]
  );

  const totalSelecionado = useMemo(
    () => pendentes.filter((m) => selecionadas.includes(m.id)).reduce((soma, m) => soma + Number(m.valor || 0), 0),
    [pendentes, selecionadas]
  );

  function alternarSelecionada(id: string) {
    setSelecionadas((lista) => lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  }

  function selecionarTodasPendentes() {
    setSelecionadas(pendentesSemComprovante.map((m) => m.id));
  }

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
          {mensagemPagamento && <div className="rounded-2xl border border-[#cfe3d8] bg-[#eef7f2] p-4 text-sm font-semibold text-[#005a3c]">{mensagemPagamento}</div>}

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
                  <p className="mt-2 text-xs text-gray-500">Marque as mensalidades que deseja quitar juntas. Faça <strong>um único PIX</strong> com o valor total e depois envie <strong>um único comprovante</strong>.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={selecionarTodasPendentes} disabled={pendentesSemComprovante.length === 0} className="rounded-lg border border-[#005a3c] px-3 py-2 text-xs font-bold text-[#005a3c] disabled:cursor-not-allowed disabled:opacity-40">Selecionar todas</button>
                    <button type="button" onClick={() => setSelecionadas([])} disabled={selecionadas.length === 0} className="rounded-lg border px-3 py-2 text-xs font-bold text-gray-600 disabled:cursor-not-allowed disabled:opacity-40">Limpar seleção</button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {pendentes.map((m) => (
                      <label key={m.id} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${m.comprovante_status === "pendente" ? "cursor-default border-gray-200 bg-gray-50 opacity-60" : selecionadas.includes(m.id) ? "cursor-pointer border-[#005a3c] bg-[#eef7f2]" : "cursor-pointer border-gray-200 bg-white"}`}>
                        <span className="flex items-center gap-3">
                          <input type="checkbox" checked={selecionadas.includes(m.id)} disabled={m.comprovante_status === "pendente"} onChange={() => alternarSelecionada(m.id)} className="h-4 w-4 accent-[#005a3c]" />
                          <span><strong>{formatarCompetencia(m.competencia)}</strong> · venc. {formatarData(m.data_vencimento)}</span>
                        </span>
                        <span className="font-extrabold text-[#005a3c]">{formatarMoeda(m.valor)}</span>
                      </label>
                    ))}
                  </div>
                  {selecionadas.length > 0 && (
                    <div className="mt-3 rounded-lg bg-[#e8f3ee] p-3 text-sm font-bold text-[#005a3c]">
                      {selecionadas.length} mensalidade(s) selecionada(s) · total do PIX: {formatarMoeda(totalSelecionado)}
                    </div>
                  )}
                  {selecionadas.length > 0 && !abrindoUploadLote && (
                    <button type="button" onClick={() => setAbrindoUploadLote(true)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#005a3c] px-4 py-2 text-sm font-bold text-white">
                      <Upload className="h-4 w-4" /> Pagar total e enviar 1 comprovante
                    </button>
                  )}
                  {selecionadas.length > 0 && abrindoUploadLote && (
                    <div className="mt-3 rounded-xl border border-[#b9d8c8] bg-[#f7fbf9] p-3">
                      <p className="text-sm font-bold text-[#005a3c]">Valor do PIX: {formatarMoeda(totalSelecionado)}</p>
                      <p className="mt-1 text-xs text-gray-500">Após realizar o PIX nesse valor, selecione o comprovante. Ele será vinculado a todas as mensalidades selecionadas.</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#005a3c] px-3 py-2 text-xs font-bold text-[#005a3c]">
                          <Upload className="h-4 w-4" /> {arquivoLote ? arquivoLote.name : "Selecionar comprovante"}
                          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={enviandoId !== null} onChange={(e) => setArquivoLote(e.target.files?.[0] || null)} />
                        </label>
                        <button type="button" disabled={!arquivoLote || enviandoId !== null} onClick={() => void enviarComprovanteLote(arquivoLote)} className="rounded-lg bg-[#005a3c] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{enviandoId === "lote" ? "Enviando..." : "Enviar comprovante"}</button>
                        <button type="button" onClick={() => { setAbrindoUploadLote(false); setArquivoLote(null); }} className="rounded-lg border px-3 py-2 text-xs font-bold text-gray-600">Cancelar</button>
                      </div>
                    </div>
                  )}
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
                            <span className="inline-flex items-center gap-1 text-green-700"><CheckCircle2 className="h-4 w-4" />{formatarData(m.data_pagamento)} · {m.tipo_pagamento || "Pagamento"}</span>
                          ) : m.comprovante_status === "pendente" ? (
                            <span className="font-bold text-amber-700">Comprovante enviado — aguardando aprovação</span>
                          ) : m.comprovante_status === "recusado" ? (
                            <span className="font-bold text-red-700">Comprovante recusado{m.motivo_recusa ? ` — ${m.motivo_recusa}` : ""}</span>
                          ) : selecionadas.includes(m.id) ? (
                            <span className="font-semibold text-[#005a3c]">Selecionada para pagamento em conjunto</span>
                          ) : (
                            <button type="button" onClick={() => alternarSelecionada(m.id)} className="rounded-lg border border-[#005a3c] px-3 py-2 text-xs font-bold text-[#005a3c]">Selecionar para PIX</button>
                          )}
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

