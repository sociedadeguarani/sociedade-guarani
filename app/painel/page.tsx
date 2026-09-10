"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import MenuLateralPadrao from "../components/MenuLateralPadrao";

const atalhosAdmin = [
  ["👥", "Sócios", "/socios", "Cadastre, edite e consulte associados."],
  ["💰", "Financeiro", "/financeiro", "Mensalidades, recebimentos e despesas."],
  ["📅", "Reservas", "/reservas", "Salões, quiosques e espaços."],
  ["🎉", "Eventos", "/eventos", "Eventos, ingressos e fichas."],
  ["🎫", "Carteirinhas", "/carteirinhas", "Carteirinha digital e QR Code."],
  ["📢", "Avisos", "/avisos", "Comunicados para os associados."],
  ["📦", "Inventário", "/inventario", "Patrimônio e controle de itens."],
  ["🚪", "Acessos", "/acessos", "Controle e consulta de entradas."],
];

const atalhosFuncionario = [
  ["🎫", "Carteirinhas", "/carteirinhas", "Consulte por matrícula ou QR Code."],
  ["📦", "Inventário", "/inventario", "Patrimônio e controle de itens."],
  ["🚪", "Acessos", "/acessos", "Controle e consulta de entradas."],
  ["📅", "Reservas", "/reservas", "Salões, quiosques e espaços."],
  ["🎉", "Eventos", "/eventos", "Eventos e informações."],
  ["📢", "Avisos", "/avisos", "Comunicados da Sociedade."],
];

const atalhosAssociado = [
  ["🎫", "Carteirinhas", "/carteirinhas", "Sua carteirinha e a da sua família."],
  ["📅", "Reservas", "/reservas", "Salões, quiosques e espaços."],
  ["🎉", "Eventos", "/eventos", "Eventos e ingressos."],
  ["📢", "Avisos", "/avisos", "Comunicados da Sociedade."],
];

function MiniIcon({ type }: { type: "users" | "shield" | "building" | "lock" }) {
  const common = { className: "h-7 w-7", fill: "none", stroke: "currentColor", strokeWidth: 1.7, viewBox: "0 0 24 24" };
  if (type === "users") return <svg {...common}><circle cx="8" cy="9" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M2.8 19c.6-3 2.3-4.5 5.2-4.5s4.6 1.5 5.2 4.5M14.5 15c2.8-.1 4.7 1.2 5.2 4" /></svg>;
  if (type === "shield") return <svg {...common}><path d="M12 3l7 3v5c0 4.5-2.8 7.7-7 10-4.2-2.3-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (type === "building") return <svg {...common}><path d="M4 21V6l8-3 8 3v15M2 21h20M8 9h1M15 9h1M8 13h1M15 13h1M8 17h1M15 17h1" /></svg>;
  return <svg {...common}><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

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
      } catch { /* dashboard continua funcionando */ }
    })();
  }, []);

  const perfilNormalizado = perfil.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const admin = perfilNormalizado === "administrador";
  const funcionario = perfilNormalizado === "funcionario";
  const atalhos = funcionario ? atalhosFuncionario : admin ? atalhosAdmin : atalhosAssociado;

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <section className="relative min-w-0 overflow-hidden p-5 sm:p-7 lg:ml-[220px] lg:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[180px] z-0 h-[720px] w-[720px] opacity-[0.075] sm:right-[-70px]">
          <img src="/logo-guarani.png" alt="" className="h-full w-full object-contain" />
        </div>

        <div className="relative z-10 mx-auto max-w-[1400px]">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#005a3c] to-[#003d2b] p-6 text-white shadow-lg sm:p-8">
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
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-sm text-gray-500">Associados cadastrados</div><div className="mt-2 text-3xl font-black text-[#005a3c]">{totalSocios ?? "—"}</div></div><div className="text-[#005a3c]"><MiniIcon type="users" /></div></div></div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-sm text-gray-500">Perfil atual</div><div className="mt-2 text-xl font-black text-[#005a3c]">{perfil || "—"}</div></div><div className="text-[#005a3c]"><MiniIcon type="shield" /></div></div></div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-sm text-gray-500">Área</div><div className="mt-2 text-xl font-black text-[#005a3c]">Sociedade Guarani</div></div><div className="text-[#005a3c]"><MiniIcon type="building" /></div></div></div>
            <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="text-sm text-gray-500">Acesso</div><div className="mt-2 text-xl font-black text-[#005a3c]">{admin ? "Administrador" : "Associado/Funcionário"}</div></div><div className="text-[#005a3c]"><MiniIcon type="lock" /></div></div></div>
          </div>

          <div className="mt-8"><h2 className="text-2xl font-black text-[#005a3c]">Acesso rápido</h2><p className="mt-1 text-sm text-gray-500">Clique em um módulo para abrir sua tela.</p></div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {atalhos.map(([icone, titulo, rota, descricao]) => (
              <button key={rota} type="button" onClick={() => window.location.href=rota} className="group relative overflow-hidden rounded-2xl border border-[#dfe9e3] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#9fcdb9] hover:shadow-md">
                <div className="flex items-start justify-between"><span className="text-3xl">{icone}</span><span className="text-xl text-[#005a3c] transition group-hover:translate-x-1">→</span></div>
                <div className="mt-4 text-lg font-black text-[#173d2e]">{titulo}</div><p className="mt-1 text-sm text-gray-500">{descricao}</p>
              </button>
            ))}
          </div>

          <div className="mt-10 flex flex-col gap-2 border-t border-[#dfe9e3] pt-5 text-xs text-[#8b9b94] sm:flex-row sm:items-center sm:justify-between">
            <span>Sociedade Recreativa Guarani — S.R.G. · Augusto Pestana — RS</span>
            <span>Tradição · Esporte · Lazer · Amizade</span>
          </div>
        </div>
      </section>
    </main>
  );
}
