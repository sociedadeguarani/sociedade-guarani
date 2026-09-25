"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  UsersRound,
  CalendarDays,
  PartyPopper,
  Ticket,
  Megaphone,
  CreditCard,
  DoorOpen,
  Wallet,
  BarChart3,
  Boxes,
  UserCog,
  Menu as MenuIcon,
  X,
} from "lucide-react";

type Perfil = "associado" | "funcionario" | "funcionario_inventario" | "administrador_normal" | "administrador_master";
const ITENS_MENU = [
  { nome: "Início", rota: "/painel", icone: Home, perfis: ["associado", "funcionario", "funcionario_inventario", "administrador_normal", "administrador_master"] },
  { nome: "Avisos", rota: "/avisos", icone: Megaphone, perfis: ["associado", "funcionario", "administrador_normal", "administrador_master", ] },
  { nome: "Minhas mensalidades", rota: "/minhas-mensalidades", icone: Wallet, perfis: ["associado"] },
  { nome: "Reservas", rota: "/reservas", icone: CalendarDays, perfis: ["associado", "funcionario", "administrador_normal", "administrador_master", ] },
  { nome: "Eventos", rota: "/eventos", icone: PartyPopper, perfis: ["associado", "funcionario", "administrador_normal", "administrador_master", ] },
  { nome: "Convites", rota: "/convites", icone: Ticket, perfis: ["associado", "funcionario", "administrador_normal", "administrador_master", ] },
  { nome: "Carteirinhas", rota: "/carteirinhas", icone: CreditCard, perfis: ["associado", "funcionario", "administrador_normal", "administrador_master", ] },
  { nome: "Sócios", rota: "/socios", icone: Users, perfis: ["funcionario", "administrador_normal", "administrador_master", ] },
  { nome: "Dependentes", rota: "/dependentes", icone: UsersRound, perfis: ["funcionario", "administrador_normal", "administrador_master", ] },
  { nome: "Mensalidades", rota: "/mensalidades", icone: Wallet, perfis: ["administrador_normal", "administrador_master", ] },
  { nome: "Financeiro", rota: "/financeiro", icone: Wallet, perfis: ["administrador_normal", "administrador_master", ] },
  { nome: "Inventário", rota: "/inventario", icone: Boxes, perfis: ["funcionario", "funcionario_inventario", "administrador_normal", "administrador_master", ] },
  { nome: "Acessos", rota: "/acessos", icone: DoorOpen, perfis: ["funcionario", "administrador_normal", "administrador_master", ] },
  { nome: "Relatórios", rota: "/relatorios", icone: BarChart3, perfis: ["administrador_normal", "administrador_master", ] },
  { nome: "Usuários", rota: "/usuarios", icone: UserCog, perfis: ["administrador_master"] },
] as const;

export default function MenuLateralPadrao() {
  const pathname = usePathname();
  const [perfil, setPerfil] = useState("");
  const [abertoMobile, setAbertoMobile] = useState(false);

  useEffect(() => {
    try {
      setPerfil((window.localStorage.getItem("guarani_usuario_perfil") || "").trim().toLowerCase());
    } catch {}
  }, []);

  useEffect(() => {
    setAbertoMobile(false);
  }, [pathname]);

  const perfilNormalizado: Perfil =
    perfil === "administrador" ? "administrador_normal" :
    perfil === "admin" ? "administrador_normal" :
    perfil === "master" ? "administrador_master" :
    perfil === "administrador_master" ? "administrador_master" :
    perfil === "administrador_normal" ? "administrador_normal" :
    perfil === "funcionario_inventario" ? "funcionario_inventario" :
    perfil === "funcionario" ? "funcionario" : "associado";

  const itensVisiveis = ITENS_MENU.filter((item) =>
    (item.perfis as readonly string[]).includes(perfilNormalizado)
  );

  function irPara(rota: string) {
    if (pathname !== rota) window.location.href = rota;
  }

  const conteudoMenu = (
    <>
      <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">Menu principal</p>
      <nav className="space-y-1.5">
        {itensVisiveis.map((item) => {
          const ativo = pathname === item.rota || pathname?.startsWith(`${item.rota}/`);
          const Icone = item.icone;
          return (
            <button
              key={item.rota}
              type="button"
              onClick={() => irPara(item.rota)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${ativo ? "bg-[#005a3c] text-white shadow-sm" : "text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"}`}
            >
              <Icone className="h-[18px] w-[18px] shrink-0" />
              {item.nome}
            </button>
          );
        })}
      </nav>
      <div className="mt-6 border-t border-[#dfe9e3] pt-4">
        <div className="rounded-2xl bg-[#f7edbd] px-4 py-3">
          <p className="text-[11px] font-bold text-[#705c00]">SOCIEDADE GUARANI</p>
          <p className="mt-1 text-xs text-[#574900]">Tradição que une pessoas!</p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button type="button" onClick={() => setAbertoMobile(true)} aria-label="Abrir menu" className="fixed left-4 top-[18px] z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-[#d5e0da] bg-white shadow-sm lg:hidden">
        <MenuIcon className="h-5 w-5 text-[#005a3c]" />
      </button>
      <aside className="fixed left-0 top-[76px] z-30 hidden h-[calc(100vh-76px)] w-[220px] overflow-y-auto border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-4 lg:block">
        {conteudoMenu}
      </aside>
      {abertoMobile && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbertoMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] max-w-[80vw] overflow-y-auto bg-[#f7faf8] px-3 py-5 shadow-2xl">
            <button type="button" onClick={() => setAbertoMobile(false)} aria-label="Fechar menu" className="mb-4 ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-[#d5e0da] bg-white">
              <X className="h-4 w-4 text-[#005a3c]" />
            </button>
            {conteudoMenu}
          </aside>
        </div>
      )}
    </>
  );
}
