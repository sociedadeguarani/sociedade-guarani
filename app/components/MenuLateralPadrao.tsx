"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  UsersRound,
  CalendarDays,
  PartyPopper,
  Wallet,
  BarChart3,
  Boxes,
  UserCog,
  Megaphone,
  CreditCard,
  DoorOpen,
  Menu as MenuIcon,
  X,
} from "lucide-react";

// "minimo" define o nível mínimo de perfil que enxerga o item:
// associado < funcionario < administrador
const NIVEL: Record<string, number> = {
  associado: 1,
  funcionario: 2,
  administrador: 3,
};

const ITENS = [
  { nome: "Início", rota: "/painel", icone: Home, minimo: "associado" },
  { nome: "Avisos", rota: "/avisos", icone: Megaphone, minimo: "associado" },
  { nome: "Reservas", rota: "/reservas", icone: CalendarDays, minimo: "associado" },
  { nome: "Eventos", rota: "/eventos", icone: PartyPopper, minimo: "associado" },
  { nome: "Carteirinhas", rota: "/carteirinhas", icone: CreditCard, minimo: "associado" },
  { nome: "Sócios", rota: "/socios", icone: Users, minimo: "funcionario" },
  { nome: "Dependentes", rota: "/dependentes", icone: UsersRound, minimo: "funcionario" },
  { nome: "Financeiro", rota: "/financeiro", icone: Wallet, minimo: "funcionario" },
  { nome: "Inventário", rota: "/inventario", icone: Boxes, minimo: "funcionario" },
  { nome: "Acessos", rota: "/acessos", icone: DoorOpen, minimo: "administrador" },
  { nome: "Relatórios", rota: "/relatorios", icone: BarChart3, minimo: "administrador" },
  { nome: "Usuários", rota: "/usuarios", icone: UserCog, minimo: "administrador" },
] as const;

export default function MenuLateralPadrao() {
  const pathname = usePathname();
  const [perfil, setPerfil] = useState("");
  const [abertoMobile, setAbertoMobile] = useState(false);

  useEffect(() => {
    setPerfil((localStorage.getItem("guarani_usuario_perfil") || "").trim().toLowerCase());
  }, []);

  // Fecha a gaveta automaticamente sempre que a rota muda.
  useEffect(() => {
    setAbertoMobile(false);
  }, [pathname]);

  const nivelUsuario = NIVEL[perfil] ?? NIVEL.associado;
  const itensVisiveis = ITENS.filter((item) => nivelUsuario >= NIVEL[item.minimo]);

  function irPara(rota: string) {
    window.location.href = rota;
  }

  const conteudoMenu = (
    <>
      <div className="mb-5 flex justify-center">
        <img
          src="/logo-guarani.png"
          alt="Sociedade Guarani"
          className="h-16 w-16 rounded-2xl bg-white object-contain p-2 shadow-sm"
        />
      </div>
      <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">
        Menu principal
      </p>
      <nav className="space-y-1.5">
        {itensVisiveis.map((item) => {
          const ativo = pathname === item.rota || pathname?.startsWith(`${item.rota}/`);
          const Icone = item.icone;
          return (
            <button
              key={item.rota}
              type="button"
              onClick={() => irPara(item.rota)}
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
    </>
  );

  return (
    <>
      {/* Botão hambúrguer — só aparece em telas menores que "lg" */}
      <button
        type="button"
        onClick={() => setAbertoMobile(true)}
        aria-label="Abrir menu"
        className="fixed left-4 top-[18px] z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-[#d5e0da] bg-white shadow-sm lg:hidden"
      >
        <MenuIcon className="h-5 w-5 text-[#005a3c]" />
      </button>

      {/* Menu fixo em telas grandes */}
      <aside className="fixed left-0 top-[76px] bottom-0 z-30 hidden w-[220px] overflow-y-auto border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-5 lg:block">
        {conteudoMenu}
      </aside>

      {/* Gaveta deslizante em telas pequenas */}
      {abertoMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAbertoMobile(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[260px] max-w-[80vw] overflow-y-auto bg-[#f7faf8] px-3 py-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setAbertoMobile(false)}
              aria-label="Fechar menu"
              className="mb-3 ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-[#d5e0da] bg-white"
            >
              <X className="h-4 w-4 text-[#005a3c]" />
            </button>
            {conteudoMenu}
          </aside>
        </div>
      )}
    </>
  );
}
