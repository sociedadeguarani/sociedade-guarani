"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Home, Users, UsersRound, CalendarDays, PartyPopper, Wallet, BarChart3, Boxes, UserCog, Megaphone, CreditCard, DoorOpen } from "lucide-react";

const ITENS = [
  { nome: "Início", rota: "/painel", icone: Home, admin: false },
  { nome: "Sócios", rota: "/socios", icone: Users, admin: true },
  { nome: "Dependentes", rota: "/dependentes", icone: UsersRound, admin: false },
  { nome: "Reservas", rota: "/reservas", icone: CalendarDays, admin: false },
  { nome: "Eventos", rota: "/eventos", icone: PartyPopper, admin: false },
  { nome: "Avisos", rota: "/avisos", icone: Megaphone, admin: false },
  { nome: "Carteirinhas", rota: "/carteirinhas", icone: CreditCard, admin: false },
  { nome: "Acessos", rota: "/acessos", icone: DoorOpen, admin: true },
  { nome: "Financeiro", rota: "/financeiro", icone: Wallet, admin: true },
  { nome: "Relatórios", rota: "/relatorios", icone: BarChart3, admin: true },
  { nome: "Inventário", rota: "/inventario", icone: Boxes, admin: true },
  { nome: "Usuários", rota: "/usuarios", icone: UserCog, admin: true },
];

export default function MenuLateralPadrao() {
  const pathname = usePathname();
  const [perfil, setPerfil] = useState("");
  useEffect(() => setPerfil((localStorage.getItem("guarani_usuario_perfil") || "").trim().toLowerCase()), []);
  const administrador = perfil === "administrador";

  return <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] overflow-y-auto border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-5 lg:block">
    <div className="mb-5 flex justify-center"><img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-16 w-16 rounded-2xl bg-white p-2 shadow-sm object-contain" /></div>
    <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">Menu principal</p>
    <nav className="space-y-1.5">{ITENS.filter(item => administrador || !item.admin).map(item => { const ativo = pathname === item.rota || pathname?.startsWith(`${item.rota}/`); const Icone = item.icone; return <button key={item.rota} type="button" onClick={() => window.location.href = item.rota} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${ativo ? "bg-[#005a3c] text-white shadow-sm" : "text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"}`}><Icone className="h-[18px] w-[18px] shrink-0" />{item.nome}</button>; })}</nav>
  </aside>;
}
