"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { nome: "Início", icone: "🏠", href: "/painel" },
  { nome: "Sócios", icone: "👥", href: "/socios" },
  { nome: "Dependentes", icone: "👨‍👩‍👧‍👦", href: "/dependentes" },
  { nome: "Reservas", icone: "📅", href: "/reservas" },
  { nome: "Eventos", icone: "🎉", href: "/eventos" },
  { nome: "Financeiro", icone: "💰", href: "/financeiro" },
  { nome: "Espaços", icone: "🏛️", href: "/espacos" },
  { nome: "Relatórios", icone: "📊", href: "/relatorios" },
  { nome: "Usuários", icone: "🔐", href: "/usuarios" },
] as const;

function Item({ nome, icone, href }: (typeof MENU)[number]) {
  const pathname = usePathname();
  const ativo =
    pathname === href || (href !== "/painel" && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
        ativo
          ? "bg-[#005a3c] font-bold text-white shadow-sm"
          : "text-[#274338] hover:bg-[#e8f3ee]"
      }`}
    >
      <span className="w-6 text-center text-lg leading-none">{icone}</span>
      <span>{nome}</span>
    </Link>
  );
}

export default function MenuLateralPadrao() {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[220px] border-r border-[#dfe7e2] bg-[#f8faf9] lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-[#dfe7e2] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#005a3c] p-1 shadow-sm">
                <img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[17px] font-extrabold leading-5 text-[#003d2b]">
                  SOCIEDADE GUARANI
                </div>
                <div className="mt-1 text-[11px] leading-4 text-gray-500">
                  Sociedade Recreativa Guarani — S.R.G.
                </div>
              </div>
            </div>
          </div>

          <div className="px-3 pb-3 pt-5">
            <div className="px-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-gray-400">
              MENU PRINCIPAL
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-2">
            {MENU.map((item) => (
              <Item key={item.href} {...item} />
            ))}
          </nav>

          <div className="p-3">
            <div className="rounded-2xl bg-[#fff2b8] px-4 py-4">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-[#7b6400]">
                SOCIEDADE GUARANI
              </div>
              <div className="mt-1 text-xs text-[#6f6125]">
                Sistema integrado de gestão
              </div>
            </div>
          </div>
        </div>
      </aside>

      <nav className="sticky top-[76px] z-20 grid grid-cols-3 gap-2 border-b border-[#dfe7e2] bg-[#f8faf9] p-2 lg:hidden">
        {MENU.map((item) => {
          const pathname = usePathname();
          const ativo =
            pathname === item.href ||
            (item.href !== "/painel" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-2 py-2 text-center text-[11px] font-bold ${
                ativo ? "bg-[#005a3c] text-white" : "bg-white text-[#274338] shadow-sm"
              }`}
            >
              <span className="block text-lg">{item.icone}</span>
              {item.nome}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
