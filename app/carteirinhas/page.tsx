"use client";

import { useEffect, useMemo, useState } from "react";
import { IdCard, Printer, Search, ShieldCheck, Smartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Dependente = {
  id: string;
  socio_id: string;
  nome: string;
  cpf?: string | null;
  parentesco?: string | null;
  ativo?: boolean | null;
  titular_nome?: string | null;
  titular_matricula?: number | string | null;
  foto_url?: string | null;
  situacao?: string | null;
  financeiro_status?: "em_dia" | "atrasado" | "muito_atrasado";
  dias_atraso?: number;
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
  exame_medico_validade: string | null;
  financeiro_status?: "em_dia" | "atrasado" | "muito_atrasado";
  dias_atraso?: number;
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
  const data = new Date(valor);
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

export default function CarteirinhasPage() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "inativos" | "exame_vencido">("todos");
  const [selecionado, setSelecionado] = useState<Socio | null>(null);
  const [dependenteSelecionado, setDependenteSelecionado] = useState<Dependente | null>(null);
  const [erro, setErro] = useState("");
  const [digitalAberta, setDigitalAberta] = useState(false);
  const [modoQr, setModoQr] = useState(false);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams(window.location.search);
      const idQr = params.get("id") || "";
      const dependenteQr = params.get("dependente_id") || "";

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
      if (ativo) {
        setSocios(listaSocios);
        setDependentes(d.dependentes || []);
        const socioQr = idQr ? listaSocios.find((s) => String(s.id) === String(idQr)) : null;
        const dependenteQrObj = dependenteQr ? (d.dependentes || []).find((dep: Dependente) => String(dep.id) === String(dependenteQr)) : null;
        if (socioQr) {
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

  const lista = useMemo(() => socios.filter((s) => {
    const q = busca.toLowerCase().trim();
    const correspondeBusca = !q || s.nome.toLowerCase().includes(q) || String(s.matricula || "").includes(q) || String(s.cpf || "").replace(/\D/g, "").includes(q.replace(/\D/g, ""));
    if (!correspondeBusca) return false;
    const ativo = String(s.situacao || "").toLowerCase() !== "inativo";
    if (filtroStatus === "ativos") return ativo;
    if (filtroStatus === "inativos") return !ativo;
    if (filtroStatus === "exame_vencido") return Boolean(s.exame_medico_validade) && new Date(`${String(s.exame_medico_validade).slice(0,10)}T00:00:00`) < new Date(new Date().toISOString().slice(0,10) + "T00:00:00");
    return true;
  }), [socios, busca, filtroStatus]);

  const dependentesLista = useMemo(() => dependentes.filter((d) => {
    const q = busca.toLowerCase().trim();
    return !q || d.nome.toLowerCase().includes(q) || String(d.titular_matricula || "").includes(q) || String(d.titular_nome || "").toLowerCase().includes(q);
  }), [dependentes, busca]);

  const v = selecionado ? visual(selecionado.tipo_socio) : visual(null);
  const validade = selecionado?.fim_temporada || null;
  const statusFinanceiro = selecionado?.financeiro_status || "em_dia";
  const statusFinanceiroLabel = statusFinanceiro === "em_dia" ? "EM DIA" : statusFinanceiro === "atrasado" ? "ATRASADO" : "MUITO ATRASADO";
  const statusFinanceiroClass = statusFinanceiro === "em_dia" ? "bg-emerald-500" : statusFinanceiro === "atrasado" ? "bg-yellow-400" : "bg-red-500";
  const statusFinanceiroText = statusFinanceiro === "atrasado" ? "3–4 meses em atraso" : statusFinanceiro === "muito_atrasado" ? "5 meses ou mais em atraso" : "Até 2 meses em dia";
  const qrValue = selecionado ? `${typeof window !== "undefined" ? window.location.origin : ""}/acessos/validar?id=${encodeURIComponent(selecionado.id)}` : "";
  const exame = statusExame(selecionado?.exame_medico_validade);

  function imprimirCarteirinha() {
    if (!selecionado) return;
    window.print();
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <style jsx global>{`
        @media print {
          @page {
            size: auto;
            margin: 0;
          }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .print-carteirinha,
          .print-carteirinha * {
            visibility: visible !important;
          }

          .print-carteirinha {
            position: absolute !important;
            left: 50% !important;
            top: 12mm !important;
            transform: translateX(-50%) !important;
            width: 85.60mm !important;
            height: 53.98mm !important;
            margin: 0 !important;
            border-width: 0.6mm !important;
            border-radius: 4mm !important;
            box-shadow: none !important;
            overflow: hidden !important;
            page-break-inside: avoid !important;
            font-size: 7px !important;
          }

          .print-carteirinha .card-top {
            padding: 3mm !important;
          }

          .print-carteirinha .card-logo {
            width: 8mm !important;
            height: 8mm !important;
          }

          .print-carteirinha .card-title {
            font-size: 7px !important;
          }

          .print-carteirinha .card-subtitle {
            margin-top: 0.5mm !important;
            font-size: 5px !important;
          }

          .print-carteirinha .card-body {
            padding: 3mm !important;
          }

          .print-carteirinha .card-photo {
            width: 16mm !important;
            height: 20mm !important;
          }

          .print-carteirinha .card-name {
            font-size: 9px !important;
          }

          .print-carteirinha .card-info {
            font-size: 5.5px !important;
          }

          .print-carteirinha .card-badge {
            margin-top: 1mm !important;
            padding: 1mm 2mm !important;
            font-size: 5px !important;
          }

          .print-carteirinha .card-bottom {
            margin-top: 2mm !important;
          }

          .print-carteirinha .card-qr {
            width: 22mm !important;
            height: 22mm !important;
          }

          .print-hide {
            display: none !important;
          }
        }
      `}</style>

      <div className="print-hide"><CabecalhoPadrao /><MenuLateralPadrao /></div>

      <main className={`${modoQr ? "min-h-screen px-3 py-4" : "min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8"}`}>
        <div className={`${modoQr ? "mx-auto max-w-md" : "mx-auto max-w-7xl space-y-6"}`}>
          {!modoQr && <div>
            <p className="text-sm text-gray-500">Identificação</p>
            <h1 className="text-3xl font-extrabold text-[#005a3c]">Carteirinhas</h1>
            <p className="mt-1 text-sm text-gray-500">Carteirinha física, carteira digital e QR Code de acesso. Ao ler o QR, esta carteirinha é aberta e o acesso é contabilizado automaticamente.</p>
          </div>}

          {!modoQr && erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">{erro}</div>}

          <div className={`${modoQr ? "" : "grid gap-6 lg:grid-cols-[1fr_430px]"}`}>
            {!modoQr && <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 rounded-xl border px-3">
                <Search className="h-4 w-4 text-gray-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, matrícula ou CPF..." className="w-full py-3 outline-none" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["todos", `Todos (${socios.length})`],
                  ["ativos", `Ativos (${socios.filter((s) => String(s.situacao || "").toLowerCase() !== "inativo").length})`],
                  ["inativos", `Inativos (${socios.filter((s) => String(s.situacao || "").toLowerCase() === "inativo").length})`],
                  ["exame_vencido", `Exame vencido (${socios.filter((s) => { if (!s.exame_medico_validade) return false; const d = new Date(`${String(s.exame_medico_validade).slice(0,10)}T00:00:00`); return !Number.isNaN(d.getTime()) && d < new Date(new Date().toISOString().slice(0,10) + "T00:00:00"); }).length})`],
                ].map(([valor, rotulo]) => (
                  <button key={valor} type="button" onClick={() => setFiltroStatus(valor as typeof filtroStatus)} className={`rounded-lg border px-2 py-2 text-xs font-bold ${filtroStatus === valor ? "border-[#005a3c] bg-[#e8f3ee] text-[#005a3c]" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
              <div className="mt-3 text-xs font-semibold text-gray-500">{lista.length} associado(s) encontrado(s)</div>
              <div className="mt-4 space-y-2">
                {lista.map((s) => (
                  <button key={s.id} onClick={() => { setSelecionado(s); setDependenteSelecionado(null); }} className={`w-full rounded-xl border p-4 text-left ${selecionado?.id === s.id ? "border-[#005a3c] bg-[#e8f3ee]" : "hover:bg-gray-50"}`}>
                    <b>{s.nome}</b>
                    <div className="text-xs text-gray-500">Matrícula: {s.matricula || "—"} · {visual(s.tipo_socio).nome}</div>
                  </button>
                ))}

                {dependentesLista.length > 0 && (
                  <div className="pt-3">
                    <div className="mb-2 text-xs font-black uppercase tracking-wide text-gray-400">Dependentes da família</div>
                    <div className="space-y-2">
                      {dependentesLista.map((d) => (
                        <button key={d.id} onClick={() => { setSelecionado(null); setDependenteSelecionado(d); }} className={`w-full rounded-xl border p-4 text-left ${dependenteSelecionado?.id === d.id ? "border-[#005a3c] bg-[#e8f3ee]" : "hover:bg-gray-50"}`}>
                          <b>{d.nome}</b>
                          <div className="text-xs text-gray-500">Dependente · {d.parentesco || "Família"} · Titular: {d.titular_nome || "—"}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>}

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
                      </div><div className="min-w-0"><h2 className="card-name text-xl font-black leading-tight">{dependenteSelecionado.nome}</h2><p className="card-info mt-1 text-sm text-gray-500">Dependente · <b>{dependenteSelecionado.parentesco || "Família"}</b></p><p className="card-info text-sm text-gray-500">Titular <b>{dependenteSelecionado.titular_nome || "—"}</b></p><p className="card-info text-sm text-gray-500">Matrícula do titular <b>{dependenteSelecionado.titular_matricula || "—"}</b></p><span className="card-badge mt-2 inline-block rounded-full bg-[#005a3c] px-3 py-1 text-xs font-black text-white">Dependente</span></div></div>
                    <div className="card-bottom mt-6 flex items-end justify-between gap-4"><div className="space-y-2 text-sm"><div><div className="text-[10px] font-bold uppercase text-gray-400">Situação</div><div className="font-black text-[#005a3c]">{dependenteSelecionado.situacao || "Não informada"}</div></div><div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${dependenteSelecionado.financeiro_status === "em_dia" ? "bg-emerald-500" : dependenteSelecionado.financeiro_status === "atrasado" ? "bg-yellow-400" : "bg-red-500"}`} /><div><div className="text-[10px] font-bold uppercase text-gray-400">Mensalidade</div><div className="font-black">{dependenteSelecionado.financeiro_status === "em_dia" ? "EM DIA" : dependenteSelecionado.financeiro_status === "atrasado" ? "3–4 MESES" : "5+ MESES"}</div></div></div></div><QRCodeSVG className="card-qr" value={`${typeof window !== "undefined" ? window.location.origin : ""}/acessos/validar?id=${encodeURIComponent(dependenteSelecionado.id)}`} size={112} includeMargin /></div>
                  </div>
                </div>
                <div className={`${modoQr ? "hidden" : "grid grid-cols-2 gap-2"}`}><button onClick={imprimirCarteirinha} className="flex items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 font-bold text-white hover:bg-[#003d2b]"><Printer className="h-4 w-4" /> Imprimir</button><button onClick={() => setDigitalAberta(true)} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-gray-50"><Smartphone className="h-4 w-4" /> Carteira digital</button></div>
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
                        <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${statusFinanceiroClass}`} /><div><div className="text-[10px] font-bold uppercase text-gray-400">Mensalidade</div><div className="font-black">{statusFinanceiroLabel}</div></div></div>
                        <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${exame.ponto}`} /><div><div className="text-[10px] font-bold uppercase text-gray-400">Exame médico</div><div className={`font-black text-xs ${exame.textoClasse}`}>{exame.texto}</div></div></div>
                      </div>
                      <QRCodeSVG className="card-qr" value={qrValue} size={112} includeMargin />
                    </div>
                  </div>
                </div>

                <div className={`${modoQr ? "hidden" : "grid grid-cols-2 gap-2"}`}>
                  <button onClick={imprimirCarteirinha} className="flex items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 font-bold text-white hover:bg-[#003d2b]"><Printer className="h-4 w-4" /> Imprimir</button>
                  <button onClick={() => setDigitalAberta(true)} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-gray-50"><Smartphone className="h-4 w-4" /> Carteira digital</button>
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
                      <div className="mt-5 rounded-2xl bg-[#f4f7f5] p-4">
                        <div className="flex items-center gap-3"><span className={`h-5 w-5 rounded-full ${statusFinanceiroClass} ring-4 ring-white shadow`} /><div><div className="text-xs font-bold uppercase text-gray-400">Situação financeira</div><div className="text-lg font-black">{statusFinanceiroLabel}</div><div className="text-xs text-gray-500">{statusFinanceiroText}</div></div></div>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl border p-3"><div className="text-[10px] font-bold uppercase text-gray-400">Situação</div><b>{selecionado.situacao || "Não informada"}</b></div><div className="rounded-xl border p-3"><div className="text-[10px] font-bold uppercase text-gray-400">Validade</div><b>{validade ? formatarData(validade) : "Conforme cadastro"}</b></div></div>
                      {erro && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{erro}</div>}
                      <div className="mt-5 rounded-xl bg-[#e8f3ee] p-3 text-center text-xs font-semibold text-[#005a3c]">Acesso contabilizado automaticamente na leitura do QR Code.</div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </main>

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
            <div className="overflow-hidden rounded-[22px] border-4 border-[#17382c] bg-white"><div className="p-5" style={{ background: "#005a3c", color: "#ffffff" }}><div className="flex items-center gap-3"><img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="h-12 w-12 rounded-xl object-contain" /><div><div className="text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div><div className="text-xl font-black">CARTEIRA DIGITAL</div></div></div></div><div className="p-6"><div className="flex items-center gap-4"><div className="grid h-24 w-20 place-items-center rounded-xl bg-gray-100 text-3xl">👤</div><div><h2 className="text-xl font-black">{dependenteSelecionado.nome}</h2><p className="text-sm text-gray-500">Dependente: <b>{dependenteSelecionado.parentesco || "Família"}</b></p><p className="text-sm text-gray-500">Titular: <b>{dependenteSelecionado.titular_nome || "—"}</b></p><span className="mt-2 inline-block rounded-full bg-[#005a3c] px-3 py-1 text-xs font-black text-white">Dependente</span></div></div><div className="mt-6 rounded-2xl bg-[#f4f7f5] p-4"><div className="text-xs font-bold uppercase text-gray-400">Situação financeira</div><div className="text-lg font-black text-[#005a3c]">{dependenteSelecionado.financeiro_status === "em_dia" ? "EM DIA" : dependenteSelecionado.financeiro_status === "atrasado" ? "3–4 MESES" : "5+ MESES"}</div></div><div className="mt-6 flex justify-center"><QRCodeSVG value={`${typeof window !== "undefined" ? window.location.origin : ""}/acessos/validar?id=${encodeURIComponent(dependenteSelecionado.id)}`} size={210} includeMargin /></div><div className="mt-4 rounded-xl bg-[#e8f3ee] p-3 text-center text-xs font-semibold text-[#005a3c]">Apresente este QR Code para identificação na portaria.</div></div></div>
          </div>
        </div>
      )}

    </div>
  );
}
