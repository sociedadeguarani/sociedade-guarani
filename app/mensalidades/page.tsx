"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, QrCode, Wallet, Upload, Copy } from "lucide-react";
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

const CNPJ_PIX = "89.649.164/0001-58";

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
  const [mensagemPagamento, setMensagemPagamento] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [arquivoLote, setArquivoLote] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

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
    void carregar();
  }, []);

  const pendentes = useMemo(
    () => mensalidades.filter((m) => m.situacao === "em_aberto" || m.situacao === "em_atraso"),
    [mensalidades]
  );
  const selecionaveis = useMemo(
    () => pendentes.filter((m) => m.comprovante_status !== "pendente"),
    [pendentes]
  );
  const totalPendente = pendentes.reduce((soma, m) => soma + Number(m.valor || 0), 0);
  const totalSelecionado = pendentes
    .filter((m) => selecionadas.includes(m.id))
    .reduce((soma, m) => soma + Number(m.valor || 0), 0);

  function alternar(id: string) {
    setSelecionadas((lista) => lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
    setMensagemPagamento("");
  }

  function selecionarTodas() {
    setSelecionadas(selecionaveis.map((m) => m.id));
    setMensagemPagamento("");
  }

  function limparSelecao() {
    setSelecionadas([]);
    setArquivoLote(null);
    setMensagemPagamento("");
  }

  async function copiar(texto: string, mensagem: string) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopiado(true);
    setMensagemPagamento(mensagem);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function enviarComprovante() {
    if (!arquivoLote || selecionadas.length === 0) return;
    setEnviando(true);
    setErro("");
    setMensagemPagamento("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Entre novamente.");
      const form = new FormData();
      form.append("origem_tipo", "mensalidade");
      form.append("origem_ids", JSON.stringify(selecionadas));
      form.append("arquivo", arquivoLote);
      const r = await fetch("/api/comprovantes/pagamentos", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível enviar o comprovante.");
      setMensalidades((lista) => lista.map((m) =>
        selecionadas.includes(m.id)
          ? { ...m, comprovante_url: d.url, comprovante_status: "pendente" }
          : m
      ));
      setMensagemPagamento("Comprovante enviado com sucesso. A administração foi avisada e irá conferir o pagamento.");
      setSelecionadas([]);
      setArquivoLote(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar comprovante.");
    } finally {
      setEnviando(false);
    }
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
              <p className="mt-2 text-sm text-amber-900">Marque na tabela as mensalidades que deseja pagar juntas. Você fará <strong>um único PIX</strong> e enviará <strong>um único comprovante</strong>.</p>
            </div>
          )}

          {selecionadas.length > 0 && (
            <div className="rounded-2xl border-2 border-[#005a3c] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-500">Pagamento selecionado</p>
                  <p className="text-xl font-extrabold text-[#005a3c]">{selecionadas.length} mensalidade(s) · {formatarMoeda(totalSelecionado)}</p>
                </div>
                <button type="button" onClick={limparSelecao} className="rounded-lg border px-3 py-2 text-xs font-bold text-gray-600">Limpar</button>
              </div>

              <div className="mt-4 rounded-xl bg-[#eef7f2] p-4">
                <p className="flex items-center gap-2 text-sm font-extrabold text-[#005a3c]"><QrCode className="h-4 w-4" /> Pague via PIX</p>
                <p className="mt-2 text-sm"><strong>CNPJ PIX:</strong> {CNPJ_PIX}</p>
                <button type="button" onClick={() => void copiar((pix?.chave_pix || CNPJ_PIX).replace(/\D/g, ""), "Chave PIX copiada.")} className="mt-2 inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-bold text-[#005a3c]">
                  <Copy className="h-4 w-4" /> {copiado ? "Copiado!" : "Copiar chave PIX"}
                </button>
                {pix?.copia_e_cola && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-bold text-gray-600">PIX copia e cola</p>
                    <div className="flex gap-2">
                      <input readOnly value={pix.copia_e_cola} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-xs" />
                      <button type="button" onClick={() => void copiar(pix.copia_e_cola || "", "PIX copia e cola copiado.")} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold text-[#005a3c]">Copiar</button>
                    </div>
                  </div>
                )}
                <p className="mt-3 text-xs text-gray-500">Faça o PIX exatamente no valor de <strong>{formatarMoeda(totalSelecionado)}</strong>. Depois, envie um único comprovante abaixo.</p>
              </div>

              <div className="mt-4 rounded-xl border border-[#b9d8c8] bg-[#f7fbf9] p-4">
                <p className="flex items-center gap-2 text-sm font-extrabold text-[#005a3c]"><Upload className="h-4 w-4" /> Comprovante do pagamento</p>
                <p className="mt-1 text-xs text-gray-500">JPG, PNG, WEBP ou PDF — máximo de 8 MB.</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#005a3c] px-3 py-2 text-xs font-bold text-[#005a3c]">
                    <Upload className="h-4 w-4" /> {arquivoLote ? arquivoLote.name : "Selecionar comprovante"}
                    <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" disabled={enviando} onChange={(e) => setArquivoLote(e.target.files?.[0] || null)} />
                  </label>
                  <button type="button" disabled={!arquivoLote || enviando} onClick={() => void enviarComprovante()} className="rounded-lg bg-[#005a3c] px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    {enviando ? "Enviando..." : "Enviar comprovante"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-[#e8f3ee] text-xs font-black uppercase text-gray-500">
                  <tr>
                    <th className="w-12 p-3 text-center">Pagar</th>
                    <th className="p-3 text-left">Competência</th>
                    <th className="p-3 text-left">Vencimento</th>
                    <th className="p-3 text-left">Valor</th>
                    <th className="p-3 text-left">Situação</th>
                    <th className="p-3 text-left">Pagamento</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {carregando && <tr><td colSpan={6} className="p-10 text-center text-gray-500">Carregando...</td></tr>}
                  {!carregando && mensalidades.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-gray-500">Nenhuma mensalidade lançada ainda.</td></tr>}
                  {!carregando && mensalidades.map((m) => {
                    const info = situacaoInfo(m.situacao);
                    const podeSelecionar = (m.situacao === "em_aberto" || m.situacao === "em_atraso") && m.comprovante_status !== "pendente";
                    return (
                      <tr key={m.id} className={selecionadas.includes(m.id) ? "bg-[#eef7f2]" : ""}>
                        <td className="p-3 text-center">
                          {podeSelecionar ? (
                            <input aria-label={`Selecionar mensalidade ${formatarCompetencia(m.competencia)}`} type="checkbox" checked={selecionadas.includes(m.id)} onChange={() => alternar(m.id)} className="h-5 w-5 cursor-pointer accent-[#005a3c]" />
                          ) : m.comprovante_status === "pendente" ? (
                            <span className="text-xs text-amber-600">⏳</span>
                          ) : <span className="text-xs text-gray-300">—</span>}
                        </td>
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
