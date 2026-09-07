"use client";

import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  UsersRound,
  CalendarDays,
  PartyPopper,
  Wallet,
  Building2,
  BarChart3,
  Boxes,
  UserCog,
} from "lucide-react";

// Menu lateral padrão do sistema.
//
// IMPORTANTE: este arquivo antes continha, por engano, o código inteiro
// da página de login (formulário de e-mail/senha). Isso fazia com que
// qualquer página que importasse <MenuLateralPadrao /> — como /painel,
// /inventario, /reservas e /usuarios — exibisse a tela de login por
// cima do conteúdo, em vez de um menu de navegação lateral.
//
// Este arquivo agora é apenas o menu, como o nome sempre indicou.

const ITENS_MENU = [
  { nome: "Início", rota: "/painel", icone: Home },
  { nome: "Sócios", rota: "/socios", icone: Users },
  { nome: "Dependentes", rota: "/dependentes", icone: UsersRound },
  { nome: "Reservas", rota: "/reservas", icone: CalendarDays },
  { nome: "Eventos", rota: "/eventos", icone: PartyPopper },
  { nome: "Financeiro", rota: "/financeiro", icone: Wallet },
  { nome: "Espaços", rota: "/espacos", icone: Building2 },
  { nome: "Relatórios", rota: "/relatorios", icone: BarChart3 },
  { nome: "Inventário", rota: "/inventario", icone: Boxes },
  { nome: "Usuários", rota: "/usuarios", icone: UserCog },
];

export default function MenuLateralPadrao() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] shrink-0 overflow-y-auto border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-5 lg:block">
      <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">
        Menu principal
      </p>

      <nav className="space-y-1.5">
        {ITENS_MENU.map((item) => {
          const ativo =
            pathname === item.rota || pathname?.startsWith(`${item.rota}/`);
          const Icone = item.icone;

          return (
            <button
              key={item.rota}
              type="button"
              onClick={() => {
                window.location.href = item.rota;
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                ativo
                  ? "bg-[#005a3c] text-white shadow-sm"
                  : "text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"
              }`}
            >
              <Icone className="h-[18px] w-[18px] shrink-0" />
              {item.nome}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
