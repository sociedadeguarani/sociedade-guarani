"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import MenuLateralPadrao from "../components/MenuLateralPadrao";

const atalhos = [
  ["👥", "Sócios", "/socios", "Cadastre, edite e consulte associados."],
  ["💰", "Financeiro", "/financeiro", "Mensalidades, recebimentos e despesas."],
  ["📅", "Reservas", "/reservas", "Salões, quiosques e espaços."],
  ["🎉", "Eventos", "/eventos", "Eventos, ingressos e fichas."],
  ["🎫", "Carteirinhas", "/carteirinhas", "Carteirinha digital e QR Code."],
  ["📢", "Avisos", "/avisos", "Comunicados para os associados."],
];

export default function PainelPage() {
  const [nome, setNome] = useState("Usuário");
  const [perfil, setPerfil] = useState("");
  const [totalSocios, setTotalSocios] = useState<number | null>(null);

  useEffect(() => {
    setNome(localStorage.getItem("guarani_usuario_nome") || "Usuário");
    setPerfil(localStorage.getItem("guarani_usuario_perfil") || "");
    (async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) session = (await supabase.auth.refreshSession()).data.session;
        if (!session?.access_token) return;
        const r = await fetch("/api/socios", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const j = await r.json().catch(() => ({}));
        if (r.ok) setTotalSocios(Array.isArray(j.socios) ? j.socios.length : 0);
      } catch { /* dashboard continua funcionando mesmo sem a estatística */ }
    })();
  }, []);

  const admin = perfil.toLowerCase() === "administrador";

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <section className="min-w-0 p-5 sm:p-7 lg:ml-[220px] lg:p-8">
        <div className="mx-auto max-w-[1400px]">
          <div className="rounded-3xl bg-gradient-to-br from-[#005a3c] to-[#003d2b] p-6 text-white shadow-lg sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white/70">Painel de gestão</p>
                <h1 className="mt-1 text-3xl font-black sm:text-4xl">Olá, {nome}!</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/80">Tudo da Sociedade Recreativa Guarani em um só lugar. Use os atalhos abaixo para acessar os módulos.</p>
              </div>
              {admin && <button onClick={() => window.location.href="/socios"} className="rounded-xl bg-white px-5 py-3 font-extrabold text-[#005a3c] shadow-sm hover:bg-[#f1f7f4]">+ Novo sócio</button>}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Associados cadastrados</div><div className="mt-2 text-3xl font-black text-[#005a3c]">{totalSocios ?? "—"}</div></div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Perfil atual</div><div className="mt-2 text-xl font-black text-[#005a3c]">{perfil || "—"}</div></div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Área</div><div className="mt-2 text-xl font-black text-[#005a3c]">Sociedade Guarani</div></div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"><div className="text-sm text-gray-500">Acesso</div><div className="mt-2 text-xl font-black text-[#005a3c]">{admin ? "Administrador" : "Associado/Funcionário"}</div></div>
          </div>

          <div className="mt-8"><h2 className="text-2xl font-black text-[#005a3c]">Acesso rápido</h2><p className="mt-1 text-sm text-gray-500">Clique em um módulo para abrir sua tela.</p></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {atalhos.map(([icone, titulo, rota, descricao]) => (
              <button key={rota} type="button" onClick={() => window.location.href=rota} className="group rounded-2xl border border-[#dfe9e3] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#9fcdb9] hover:shadow-md">
                <div className="flex items-start justify-between"><span className="text-3xl">{icone}</span><span className="text-xl text-[#005a3c] transition group-hover:translate-x-1">→</span></div>
                <div className="mt-4 text-lg font-black text-[#173d2e]">{titulo}</div><p className="mt-1 text-sm text-gray-500">{descricao}</p>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
