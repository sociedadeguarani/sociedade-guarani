"use client";

import { useEffect, useMemo, useState } from "react";
import { IdCard, Printer, Search, ShieldCheck, Smartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

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

function formatarCpf(valor: string | null | undefined) {
  if (!valor) return "—";
  const digits = valor.replace(/\D/g, "");
  if (digits.length !== 11) return valor;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export default function CarteirinhasPage() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<Socio | null>(null);
  const [erro, setErro] = useState("");
  const [digitalAberta, setDigitalAberta] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await import("@/lib/supabaseClient").then((m) => m.supabase.auth.getSession());
      if (!session) {
        location.replace("/login");
        return;
      }
      const r = await fetch("/api/carteirinhas", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) {
        setErro(d.error || "Erro ao carregar carteirinhas.");
        return;
      }
      setSocios(d.socios || []);
      if (d.socios?.length === 1) setSelecionado(d.socios[0]);
    })();
  }, []);

  const lista = useMemo(() => socios.filter((s) => {
    const q = busca.toLowerCase().trim();
    return !q || s.nome.toLowerCase().includes(q) || String(s.matricula || "").includes(q);
  }), [socios, busca]);

  const v = selecionado ? visual(selecionado.tipo_socio) : visual(null);
  const validade = selecionado?.fim_temporada || null;
  const qrValue = selecionado ? `guarani:socio:${selecionado.id}` : "";

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

      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <p className="text-sm text-gray-500">Identificação</p>
            <h1 className="text-3xl font-extrabold text-[#005a3c]">Carteirinhas</h1>
            <p className="mt-1 text-sm text-gray-500">Carteirinha física, carteira digital e QR Code de acesso.</p>
          </div>

          {erro && <div className="rounded-xl bg-red-50 p-4 font-semibold text-red-700">{erro}</div>}

          <div className="grid gap-6 lg:grid-cols-[1fr_430px]">
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 rounded-xl border px-3">
                <Search className="h-4 w-4 text-gray-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou matrícula..." className="w-full py-3 outline-none" />
              </div>
              <div className="mt-4 space-y-2">
                {lista.map((s) => (
                  <button key={s.id} onClick={() => setSelecionado(s)} className={`w-full rounded-xl border p-4 text-left ${selecionado?.id === s.id ? "border-[#005a3c] bg-[#e8f3ee]" : "hover:bg-gray-50"}`}>
                    <b>{s.nome}</b>
                    <div className="text-xs text-gray-500">Matrícula: {s.matricula || "—"} · {visual(s.tipo_socio).nome}</div>
                  </button>
                ))}
              </div>
            </section>

            {selecionado && (
              <section className="space-y-4">
                <div className="print-carteirinha overflow-hidden rounded-3xl border-4 border-[#17382c] bg-white shadow-xl">
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
                      </div>
                      <QRCodeSVG className="card-qr" value={qrValue} size={112} includeMargin />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={imprimirCarteirinha} className="flex items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 font-bold text-white hover:bg-[#003d2b]"><Printer className="h-4 w-4" /> Imprimir</button>
                  <button onClick={() => setDigitalAberta(true)} className="flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-bold hover:bg-gray-50"><Smartphone className="h-4 w-4" /> Carteira digital</button>
                </div>

                <div className="rounded-xl bg-[#e8f3ee] p-4 text-sm"><ShieldCheck className="mr-2 inline h-4 w-4 text-[#005a3c]" /><b>QR Code exclusivo.</b> O funcionário pode escanear este código para registrar a entrada.</div>
              </section>
            )}
          </div>
        </div>
      </main>

      {digitalAberta && selecionado && (
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
    </div>
  );
}
