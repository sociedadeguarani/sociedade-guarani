"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { CheckCircle2, Clock3, ShieldAlert, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type DadosQr = {
  liberado: boolean;
  socio: { nome: string; matricula: string | null; situacao: string | null; foto_url: string | null };
  exame: { cor: string | null; label: string; validade: string | null };
  acesso: { data_hora_entrada: string };
};

export default function ValidarQrPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [dados, setDados] = useState<DadosQr | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    async function validarQr() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!ativo) return;
        if (!session) {
          router.replace(`/login?redirect=/acessos/qr/${encodeURIComponent(params.id)}`);
          return;
        }
        const resposta = await fetch("/api/acessos/qr", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ id: params.id }),
          cache: "no-store",
        });
        const corpo: unknown = await resposta.json();
        if (!resposta.ok) {
          const mensagem = typeof corpo === "object" && corpo !== null && "error" in corpo && typeof corpo.error === "string" ? corpo.error : "Não foi possível validar o QR Code.";
          throw new Error(mensagem);
        }
        if (ativo) setDados(corpo as DadosQr);
      } catch (erroValidacao) {
        if (ativo) setErro(erroValidacao instanceof Error ? erroValidacao.message : "Erro ao validar QR Code.");
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void validarQr();
    return () => { ativo = false; };
  }, [params.id, router]);

  const corExame = dados?.exame.cor === "verde"
    ? "bg-green-50 border-green-300 text-green-800"
    : dados?.exame.cor === "amarelo"
      ? "bg-yellow-50 border-yellow-300 text-yellow-800"
      : dados?.exame.cor === "vermelho"
        ? "bg-red-50 border-red-300 text-red-800"
        : "bg-gray-50 border-gray-300 text-gray-700";

  return (
    <main className="min-h-screen bg-[#f4f8f6] p-5 text-[#17382c]">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <div className="text-center">
          <Image src="/logo-guarani.png" alt="" aria-hidden="true" width={64} height={64} className="mx-auto h-16 w-16 object-contain" priority />
          <h1 className="mt-3 text-2xl font-black text-[#005a3c]">Validação de acesso</h1>
          <p className="text-sm text-gray-500">Sociedade Recreativa Guarani</p>
        </div>
        {carregando && <div className="py-16 text-center"><Clock3 className="mx-auto h-10 w-10 animate-pulse" /><p className="mt-3 font-semibold">Validando QR Code...</p></div>}
        {erro && <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-5 font-bold text-red-700">{erro}</div>}
        {dados && (
          <div className="mt-6 space-y-4">
            <div className={`rounded-2xl p-5 ${dados.liberado ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {dados.liberado ? <CheckCircle2 className="h-10 w-10" /> : <XCircle className="h-10 w-10" />}
              <div className="mt-2 text-2xl font-black">{dados.liberado ? "ENTRADA LIBERADA" : "ACESSO BLOQUEADO"}</div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl border p-4">
              {dados.socio.foto_url ? <Image src={dados.socio.foto_url} alt={`Foto de ${dados.socio.nome}`} width={64} height={80} unoptimized className="h-20 w-16 rounded-xl object-cover" /> : <div aria-label="Sem foto cadastrada" className="grid h-20 w-16 place-items-center rounded-xl bg-gray-100 text-3xl">👤</div>}
              <div><div className="text-xl font-black">{dados.socio.nome}</div><div className="text-sm text-gray-500">Matrícula: {dados.socio.matricula || "—"}</div><div className="text-sm text-gray-500">Situação: {dados.socio.situacao || "Não informada"}</div></div>
            </div>
            <div className={`rounded-2xl border p-5 ${corExame}`}>
              <div className="flex items-center gap-2 font-black"><ShieldAlert className="h-5 w-5" /> EXAME MÉDICO</div>
              <div className="mt-2 text-xl font-black">{dados.exame.label}</div>
              <div className="mt-1 text-sm">Validade: {dados.exame.validade ? new Date(`${dados.exame.validade}T12:00:00`).toLocaleDateString("pt-BR") : "Não cadastrada"}</div>
            </div>
            <div className="rounded-xl bg-[#e8f3ee] p-3 text-center text-xs font-semibold text-[#005a3c]">A entrada foi registrada automaticamente em {new Date(dados.acesso.data_hora_entrada).toLocaleString("pt-BR")}.</div>
          </div>
        )}
      </div>
    </main>
  );
}
