"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Home, Users, UsersRound, CalendarDays, PartyPopper, Wallet, BarChart3, Boxes, UserCog, Megaphone, CreditCard, DoorOpen, X, Menu } from "lucide-react";

const ITENS = [
  { nome: "Início", rota: "/painel", icone: Home, perfis: ["administrador", "associado"] },
  { nome: "Sócios", rota: "/socios", icone: Users, perfis: ["administrador"] },
  { nome: "Dependentes", rota: "/dependentes", icone: UsersRound, perfis: ["administrador", "associado"] },
  { nome: "Reservas", rota: "/reservas", icone: CalendarDays, perfis: ["administrador", "funcionario", "associado"] },
  { nome: "Eventos", rota: "/eventos", icone: PartyPopper, perfis: ["administrador", "associado"] },
  { nome: "Avisos", rota: "/avisos", icone: Megaphone, perfis: ["administrador", "funcionario", "associado"] },
  { nome: "Carteirinhas", rota: "/carteirinhas", icone: CreditCard, perfis: ["administrador", "funcionario", "associado"] },
  { nome: "Acessos", rota: "/acessos", icone: DoorOpen, perfis: ["administrador", "funcionario"] },
  { nome: "Financeiro", rota: "/financeiro", icone: Wallet, perfis: ["administrador"] },
  { nome: "Relatórios", rota: "/relatorios", icone: BarChart3, perfis: ["administrador"] },
  { nome: "Inventário", rota: "/inventario", icone: Boxes, perfis: ["administrador", "funcionario"] },
  { nome: "Usuários", rota: "/usuarios", icone: UserCog, perfis: ["administrador"] },
];

export default function MenuLateralPadrao() {
  const pathname = usePathname();
  const [perfil, setPerfil] = useState("");
  const [mobileAberto, setMobileAberto] = useState(false);

  useEffect(() => {
    const atualizar = () => setPerfil((localStorage.getItem("guarani_usuario_perfil") || "").trim().toLowerCase());
    atualizar();
    window.addEventListener("guarani-perfil-atualizado", atualizar);
    return () => window.removeEventListener("guarani-perfil-atualizado", atualizar);
  }, []);

  const itensVisiveis = useMemo(() => {
    const p = perfil || "administrador";
    return ITENS.filter((item) => item.perfis.includes(p));
  }, [perfil]);

  function navegar(rota: string) {
    setMobileAberto(false);
    window.location.href = rota;
  }

  return (
    <>
      {/* Botão mobile */}
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => setMobileAberto(true)}
        className="fixed left-4 top-[92px] z-50 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#dfe9e3] bg-white text-[#005a3c] shadow-lg lg:hidden"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Menu desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] overflow-y-auto border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-5 lg:block">
        <div className="mb-5 flex justify-center">
          <img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-16 w-16 rounded-2xl bg-white p-2 shadow-sm object-contain" />
        </div>
        <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">Menu principal</p>
        <nav className="space-y-1.5">
          {itensVisiveis.map((item) => {
            const ativo = pathname === item.rota || pathname?.startsWith(`${item.rota}/`);
            const Icone = item.icone;
            return (
              <button key={item.rota} type="button" onClick={() => navegar(item.rota)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${ativo ? "bg-[#005a3c] text-white shadow-sm" : "text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"}`}>
                <Icone className="h-[18px] w-[18px] shrink-0" />{item.nome}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Menu mobile */}
      {mobileAberto && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" aria-label="Fechar menu" onClick={() => setMobileAberto(false)} className="absolute inset-0 bg-black/35" />
          <aside className="absolute inset-y-0 left-0 w-[min(88vw,410px)] overflow-y-auto border-r border-[#dfe9e3] bg-[#f7faf8] px-5 py-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-sm">
                <img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-full w-full object-contain" />
              </div>
              <button type="button" onClick={() => setMobileAberto(false)} aria-label="Fechar menu" className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#005a3c] bg-white text-[#005a3c]"><X className="h-7 w-7" /></button>
            </div>
            <p className="mb-4 mt-8 px-2 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#91a099]">Menu principal</p>
            <nav className="space-y-2">
              {itensVisiveis.map((item) => {
                const ativo = pathname === item.rota || pathname?.startsWith(`${item.rota}/`);
                const Icone = item.icone;
                return (
                  <button key={item.rota} type="button" onClick={() => navegar(item.rota)} className={`flex w-full items-center gap-4 rounded-2xl px-5 py-4 text-left text-base font-bold transition ${ativo ? "bg-[#005a3c] text-white shadow-sm" : "text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"}`}>
                    <Icone className="h-6 w-6 shrink-0" />{item.nome}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
