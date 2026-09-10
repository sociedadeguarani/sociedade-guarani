"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, ShieldAlert, UserRound, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

function corExame(cor: string) {
  if (cor === "verde") return "bg-green-50 border-green-200 text-green-800";
  if (cor === "amarelo") return "bg-yellow-50 border-yellow-200 text-yellow-900";
  if (cor === "vermelho") return "bg-red-50 border-red-200 text-red-800";
  return "bg-gray-50 border-gray-200 text-gray-700";
}

export default function ValidarCarteiraPage() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<any>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const params = new URLSearchParams(window.location.search);
        const id = params.get("id") || "";
        if (!id) throw new Error("QR Code sem identificação do associado.");
        if (!session) {
          const destino = `/acessos/validar?id=${encodeURIComponent(id)}`;
          window.location.replace(`/login?redirect=${encodeURIComponent(destino)}`);
          return;
        }

        const r = await fetch("/api/acessos", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ socio_id: id, local: "Portaria" }),
          cache: "no-store",
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Não foi possível registrar o acesso. Confira se o usuário do celular é Administrador ou Funcionário e tente novamente.");
        if (!cancelado) setResultado(d);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Erro ao validar carteirinha.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const exame = resultado?.exame;
  const liberado = Boolean(resultado?.liberado);

  return (
    <main className="min-h-screen bg-[#f4f7f5] px-4 py-8 text-[#17382c]">
      <div className="mx-auto max-w-md">
        <div className="overflow-hidden rounded-[28px] bg-white shadow-xl ring-1 ring-black/5">
          <div className="bg-[#005a3c] px-6 py-5 text-white">
            <div className="flex items-center gap-3">
              <img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="h-12 w-12 rounded-xl object-contain" />
              <div>
                <div className="text-[10px] font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div>
                <h1 className="text-xl font-black">Validação de acesso</h1>
              </div>
            </div>
          </div>

          <div className="p-6">
            {carregando && <div className="py-12 text-center"><Clock3 className="mx-auto h-10 w-10 animate-pulse text-[#005a3c]" /><p className="mt-3 font-bold">Validando carteirinha...</p></div>}

            {!carregando && erro && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
                <XCircle className="h-10 w-10" />
                <h2 className="mt-3 text-xl font-black">Não foi possível validar</h2>
                <p className="mt-1 text-sm font-medium">{erro}</p>
              </div>
            )}

            {!carregando && !erro && resultado && (
              <div className="space-y-4">
                <div className={`rounded-2xl p-5 ${liberado ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  {liberado ? <CheckCircle2 className="h-12 w-12" /> : <ShieldAlert className="h-12 w-12" />}
                  <div className="mt-3 text-2xl font-black">{liberado ? "ENTRADA LIBERADA" : "ACESSO BLOQUEADO"}</div>
                  <div className="mt-1 text-sm font-semibold">A entrada foi registrada na portaria.</div>
                </div>

                <div className="rounded-2xl border bg-white p-4">
                  <div className="flex gap-4">
                    <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                      {resultado.socio?.foto_url ? <img src={resultado.socio.foto_url} alt={resultado.socio.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><UserRound className="h-8 w-8 text-gray-400" /></div>}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-xl font-black leading-tight">{resultado.socio?.nome}</h2>
                      <p className="mt-1 text-sm text-gray-500">Matrícula: <b>{resultado.socio?.matricula || "—"}</b></p>
                      <p className="text-sm text-gray-500">Situação: <b>{resultado.socio?.situacao || "Não informada"}</b></p>
                    </div>
                  </div>
                </div>

                <div className={`rounded-2xl border p-4 ${corExame(exame?.status?.cor)}`}>
                  <div className="text-xs font-black uppercase tracking-wide">Exame</div>
                  <div className="mt-1 text-lg font-black">{exame?.status?.texto || "Exame não informado"}</div>
                  <div className="mt-1 text-sm font-medium">Validade: {exame?.validade ? new Date(exame.validade).toLocaleDateString("pt-BR") : "—"}</div>
                  <div className="mt-1 text-xs font-semibold">Verificado: {exame?.verificado ? "Sim" : "Não informado"}</div>
                </div>

                <div className="rounded-xl bg-[#e8f3ee] p-3 text-center text-xs font-semibold text-[#005a3c]">
                  Registro efetuado em {resultado.acesso?.entrada_em ? new Date(resultado.acesso.entrada_em).toLocaleString("pt-BR") : "agora"}.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
