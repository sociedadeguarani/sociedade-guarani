"use client";

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
} from "lucide-react";

const ITENS_MENU = [
  { nome: "Início", rota: "/painel", icone: Home },
  { nome: "Sócios", rota: "/socios", icone: Users },
  { nome: "Dependentes", rota: "/dependentes", icone: UsersRound },
  { nome: "Reservas", rota: "/reservas", icone: CalendarDays },
  { nome: "Eventos", rota: "/eventos", icone: PartyPopper },
  { nome: "Convites", rota: "/convites", icone: Ticket },
  { nome: "Avisos", rota: "/avisos", icone: Megaphone },
  { nome: "Carteirinhas", rota: "/carteirinhas", icone: CreditCard },
  { nome: "Acessos", rota: "/acessos", icone: DoorOpen },
  { nome: "Financeiro", rota: "/financeiro", icone: Wallet },
  { nome: "Relatórios", rota: "/relatorios", icone: BarChart3 },
  { nome: "Inventário", rota: "/inventario", icone: Boxes },
  { nome: "Usuários", rota: "/usuarios", icone: UserCog },
];

export default function MenuLateralPadrao() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-[76px] z-30 hidden h-[calc(100vh-76px)] w-[220px] overflow-y-auto border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-4 lg:block">
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
                if (pathname !== item.rota) window.location.href = item.rota;
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${
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

      <div className="mt-6 border-t border-[#dfe9e3] pt-4">
        <div className="rounded-2xl bg-[#f7edbd] px-4 py-3">
          <p className="text-[11px] font-bold text-[#705c00]">
            SOCIEDADE GUARANI
          </p>
          <p className="mt-1 text-xs text-[#574900]">
            Tradição que une pessoas!
          </p>
        </div>
      </div>
    </aside>
  );
}
