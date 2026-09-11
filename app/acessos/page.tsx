"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock3, Search, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Resultado = {
  socio?: { id: string; matricula: number | string | null; nome: string; situacao: string | null; categoria?: string | null; foto_url?: string | null };
  liberado?: boolean;
  acesso?: { entrada_em?: string; resultado?: string };
  mensalidade?: { texto: string; cor: string } | null;
  exame?: { status?: { texto: string; cor: string }; validade?: string | null; verificado?: boolean } | null;
  inadimplencia?: { atrasado: boolean; quantidade: number; valorTotal: number } | null;
};

export default function AcessosPage() {
  const [matricula, setMatricula] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [suportaLeituraQr, setSuportaLeituraQr] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    setSuportaLeituraQr("BarcodeDetector" in window);
  }, []);

  async function validar(dados: { matricula?: string; qr?: string; socio_id?: string }) {
    setErro("");
    setResultado(null);
    setCarregando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = "/login?redirect=/acessos";
        return;
      }
      const r = await fetch("/api/acessos", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(dados),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível registrar o acesso.");
      setResultado(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao validar carteirinha.");
    } finally {
      setCarregando(false);
    }
  }

  function pararCamera() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraAberta(false);
  }

  async function iniciarCamera() {
    setErro("");
    setResultado(null);
    if (!("BarcodeDetector" in window)) {
      setErro("Seu navegador não oferece leitura automática de QR Code. Use a matrícula ou abra a câmera do celular e leia o QR Code da carteirinha.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setCameraAberta(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });

      // BarcodeDetector é suportado nos navegadores modernos. O QR retorna a URL
      // /acessos/validar?id=... e a API também aceita diretamente essa URL.
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ["qr_code"] });
      const ler = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const valor = codes?.[0]?.rawValue;
          if (valor) {
            pararCamera();
            await validar({ qr: valor });
            return;
          }
        } catch {}
        animationRef.current = requestAnimationFrame(ler);
      };
      animationRef.current = requestAnimationFrame(ler);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível acessar a câmera.");
      pararCamera();
    }
  }

  useEffect(() => () => pararCamera(), []);

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-gray-500">Portaria</p>
              <h1 className="text-3xl font-extrabold text-[#005a3c]">Acessos</h1>
              <p className="mt-1 text-sm text-gray-500">Consulte a carteirinha por matrícula ou leia o QR Code para validar e registrar a entrada.</p>
            </div>
            <a href="/acessos/relatorio" className="inline-flex shrink-0 items-center gap-2 rounded-xl border-2 border-[#005a3c] px-4 py-3 font-black text-[#005a3c] hover:bg-[#e8f3ee]">
              📊 Relatório de acessos
            </a>
          </div>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ee] text-[#005a3c]"><Search /></div>
                <div><h2 className="text-xl font-black">Consultar por matrícula</h2><p className="text-sm text-gray-500">Digite o número da carteirinha.</p></div>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); if (matricula.trim()) validar({ matricula }); }} className="mt-5 flex gap-2">
                <input value={matricula} onChange={(e) => setMatricula(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Ex.: 00125" className="min-w-0 flex-1 rounded-xl border px-4 py-3 outline-none focus:border-[#005a3c]" />
                <button disabled={carregando || !matricula.trim()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-black text-white disabled:opacity-50">Consultar</button>
              </form>
            </div>

            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ee] text-[#005a3c]"><Camera /></div>
                <div><h2 className="text-xl font-black">Ler QR Code</h2><p className="text-sm text-gray-500">Use a câmera traseira do celular.</p></div>
              </div>
              {!suportaLeituraQr ? (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                  Este navegador (comum em iPhone) não permite ler QR Code direto no site.
                  Abra o <b>app de Câmera do celular</b> e aponte para o QR Code da carteirinha —
                  ele vai abrir esta página automaticamente e já registrar o acesso.
                </div>
              ) : !cameraAberta ? (
                <button onClick={iniciarCamera} className="mt-5 w-full rounded-xl border-2 border-[#005a3c] px-4 py-3 font-black text-[#005a3c]">📷 Abrir câmera e ler QR Code</button>
              ) : (
                <div className="mt-5">
                  <div className="overflow-hidden rounded-2xl bg-black"><video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" /></div>
                  <p className="mt-2 text-center text-xs font-semibold text-gray-500">Aponte para o QR Code da carteirinha.</p>
                  <button onClick={pararCamera} className="mt-3 w-full rounded-xl border px-4 py-3 font-bold">Fechar câmera</button>
                </div>
              )}
            </div>
          </section>

          {carregando && <div className="rounded-2xl border bg-white p-8 text-center shadow-sm"><Clock3 className="mx-auto h-9 w-9 animate-pulse text-[#005a3c]" /><p className="mt-3 font-bold">Validando carteirinha...</p></div>}
          {erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><XCircle className="h-8 w-8" /><p className="mt-2 font-black">Não foi possível validar</p><p className="text-sm font-medium">{erro}</p></div>}

          {resultado?.socio && (
            <section className={`rounded-2xl border p-6 shadow-sm ${resultado.liberado ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-16 overflow-hidden rounded-xl bg-white">
                    {resultado.socio.foto_url ? <img src={resultado.socio.foto_url} alt={resultado.socio.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><UserRound className="text-gray-400" /></div>}
                  </div>
                  <div><p className="text-xs font-black uppercase tracking-wide text-gray-500">Carteirinha</p><h2 className="text-2xl font-black">{resultado.socio.nome}</h2><p className="text-sm text-gray-600">Matrícula: <b>{resultado.socio.matricula || "—"}</b> · Situação: <b>{resultado.socio.situacao || "Não informada"}</b></p></div>
                </div>
                <div className="flex items-center gap-3">
                  {resultado.liberado ? <CheckCircle2 className="h-12 w-12 text-green-700" /> : <XCircle className="h-12 w-12 text-red-700" />}
                  <div><div className={`text-2xl font-black ${resultado.liberado ? "text-green-800" : "text-red-800"}`}>{resultado.liberado ? "ENTRADA LIBERADA" : "ACESSO BLOQUEADO"}</div><p className="text-sm font-semibold">{resultado.acesso?.entrada_em ? `Registrado em ${new Date(resultado.acesso.entrada_em).toLocaleString("pt-BR")}` : ""}</p></div>
                </div>
              </div>
              <div className="mt-5 rounded-xl bg-white/70 p-4 text-sm font-semibold"><ShieldCheck className="mr-2 inline h-4 w-4" />A consulta registra automaticamente o acesso na portaria.</div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">Mensalidade</p>
                  <p className="mt-1 font-black">{resultado.mensalidade?.texto || "Não informado"}</p>
                  {resultado.inadimplencia?.atrasado && (
                    <p className="mt-1 text-xs font-semibold text-red-700">
                      {resultado.inadimplencia.quantidade} em atraso ·{" "}
                      {Number(resultado.inadimplencia.valorTotal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">Exame médico</p>
                  <p className="mt-1 font-black">{resultado.exame?.status?.texto || "Não informado"}</p>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
