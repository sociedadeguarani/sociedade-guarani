"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { permissoesPadraoPerfil } from "@/lib/permissoes";
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
  Umbrella,
  BarChart3,
  Boxes,
  UserCog,
  Settings,
  Menu as MenuIcon,
  X,
} from "lucide-react";

type Perfil =
  | "associado"
  | "funcionario"
  | "funcionario_inventario"
  | "administrador"
  | "administrador_master";

type ItemMenu = {
  nome: string;
  rota: string;
  icone: typeof Home;
  perfis: readonly Perfil[];
  permissao?: string;
};

const ITENS_MENU: readonly ItemMenu[] = [
  {
    nome: "Início",
    rota: "/painel",
    icone: Home,
    perfis: [
      "associado",
      "funcionario",
      "funcionario_inventario",
      "administrador",
      "administrador_master",
    ],
  },
  {
    nome: "Avisos",
    permissao: "menu.avisos",
    rota: "/avisos",
    icone: Megaphone,
    perfis: ["associado", "funcionario", "funcionario_inventario", "administrador", "administrador_master"],
  },
  {
    nome: "Minhas mensalidades",
    permissao: "menu.minhas_mensalidades",
    rota: "/minhas-mensalidades",
    icone: Wallet,
    perfis: ["associado"],
  },
  {
    nome: "Reservas",
    permissao: "menu.reservas",
    rota: "/reservas",
    icone: CalendarDays,
    perfis: ["associado", "funcionario", "administrador", "administrador_master"],
  },
  {
    nome: "Eventos",
    permissao: "menu.eventos",
    rota: "/eventos",
    icone: PartyPopper,
    perfis: ["associado", "funcionario", "administrador", "administrador_master"],
  },
  {
    nome: "Convites",
    permissao: "menu.convites",
    rota: "/convites",
    icone: Ticket,
    perfis: ["associado", "funcionario", "administrador", "administrador_master"],
  },
  {
    nome: "Carteirinhas",
    permissao: "menu.carteirinhas",
    rota: "/carteirinhas",
    icone: CreditCard,
    perfis: ["associado", "funcionario", "funcionario_inventario", "administrador", "administrador_master"],
  },
  {
    nome: "Sócios",
    permissao: "menu.socios",
    rota: "/socios",
    icone: Users,
    perfis: ["funcionario", "administrador", "administrador_master"],
  },
  {
    nome: "Dependentes",
    permissao: "menu.dependentes",
    rota: "/dependentes",
    icone: UsersRound,
    perfis: ["funcionario", "administrador", "administrador_master"],
  },
  {
    nome: "Mensalidades",
    permissao: "menu.mensalidades",
    rota: "/mensalidades",
    icone: Wallet,
    perfis: ["administrador", "administrador_master"],
  },
  {
    nome: "Temporada",
    permissao: "menu.temporadas",
    rota: "/temporadas",
    icone: Umbrella,
    perfis: ["administrador", "administrador_master"],
  },
  {
    nome: "Financeiro",
    permissao: "menu.financeiro",
    rota: "/financeiro",
    icone: Wallet,
    perfis: ["administrador", "administrador_master"],
  },
  {
    nome: "Inventário",
    permissao: "menu.inventario",
    rota: "/inventario",
    icone: Boxes,
    perfis: [
      "funcionario",
      "funcionario_inventario",
      "administrador",
      "administrador_master",
    ],
  },
  {
    nome: "Acessos",
    permissao: "menu.acessos",
    rota: "/acessos",
    icone: DoorOpen,
    perfis: ["funcionario", "administrador", "administrador_master"],
  },
  {
    nome: "Relatórios",
    permissao: "menu.relatorios",
    rota: "/relatorios",
    icone: BarChart3,
    perfis: ["administrador", "administrador_master"],
  },
  {
    nome: "Usuários",
    permissao: "menu.usuarios",
    rota: "/usuarios",
    icone: UserCog,
    perfis: ["administrador_master"],
  },
  {
    nome: "Política de acesso",
    permissao: "menu.politica_acesso",
    rota: "/configuracoes/acessos",
    icone: Settings,
    perfis: ["administrador", "administrador_master"],
  },
] as const;

function normalizarPerfil(value: unknown): Perfil {
  const perfil = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (perfil === "administrador_master" || perfil === "master") {
    return "administrador_master";
  }

  if (
    perfil === "administrador" ||
    perfil === "admin" ||
    perfil === "administrador_normal"
  ) {
    return "administrador";
  }

  if (perfil === "funcionario_inventario") {
    return "funcionario_inventario";
  }

  if (perfil === "funcionario") {
    return "funcionario";
  }

  return "associado";
}

const CHAVE_PERFIL_LOCAL = "guarani_usuario_perfil";

function assinarMudancasPerfil(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};

  const aoMudarStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === CHAVE_PERFIL_LOCAL || event.key === "guarani_usuario_permissoes") {
      onStoreChange();
    }
  };

  window.addEventListener("storage", aoMudarStorage);
  window.addEventListener("guarani:perfil-change", onStoreChange);
  window.addEventListener("guarani:permissions-change", onStoreChange);

  return () => {
    window.removeEventListener("storage", aoMudarStorage);
    window.removeEventListener("guarani:perfil-change", onStoreChange);
    window.removeEventListener("guarani:permissions-change", onStoreChange);
  };
}

function obterPerfilArmazenado(): Perfil {
  try {
    return normalizarPerfil(window.localStorage.getItem(CHAVE_PERFIL_LOCAL));
  } catch {
    return "associado";
  }
}

function obterPerfilNoServidor(): Perfil {
  return "associado";
}

function obterPermissoesArmazenadas(): string | null {
  try {
    return window.localStorage.getItem("guarani_usuario_permissoes");
  } catch {
    return null;
  }
}

function obterPermissoesNoServidor(): string | null {
  return null;
}

const CHAVE_VERSAO_PERMISSOES = "guarani_permissoes_schema_v1";

export default function MenuLateralPadrao() {
  const pathname = usePathname();
  const router = useRouter();

  // Atualiza uma vez por sessão as permissões vindas do banco. Isso corrige
  // sessões antigas que ainda guardam permissões locais de versões anteriores.
  useEffect(() => {
    let ativo = true;
    if (window.sessionStorage.getItem(CHAVE_VERSAO_PERMISSOES) === "1") return;

    async function sincronizarPermissoes() {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;

        const resposta = await fetch("/api/login/perfil", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = await resposta.json().catch(() => ({}));
        if (!ativo || !resposta.ok || !payload?.usuario) return;

        window.localStorage.setItem("guarani_usuario_perfil", String(payload.usuario.perfil || "associado"));
        window.localStorage.setItem("guarani_usuario_permissoes", JSON.stringify(Array.isArray(payload.usuario.permissoes) ? payload.usuario.permissoes : []));
        if (payload.usuario.nome_exibicao) window.localStorage.setItem("guarani_usuario_nome", String(payload.usuario.nome_exibicao));
        window.sessionStorage.setItem(CHAVE_VERSAO_PERMISSOES, "1");
        window.dispatchEvent(new Event("guarani:perfil-change"));
        window.dispatchEvent(new Event("guarani:permissions-change"));
      } catch {
        // A navegação permanece disponível se a sincronização temporária falhar.
      }
    }

    void sincronizarPermissoes();
    return () => { ativo = false; };
  }, []);
  const perfil = useSyncExternalStore(
    assinarMudancasPerfil,
    obterPerfilArmazenado,
    obterPerfilNoServidor
  );
  const permissoesRaw = useSyncExternalStore(
    assinarMudancasPerfil,
    obterPermissoesArmazenadas,
    obterPermissoesNoServidor
  );
  const permissoes = useMemo(() => {
    if (permissoesRaw === null) return new Set<string>(permissoesPadraoPerfil(perfil));
    try {
      const valores: unknown = JSON.parse(permissoesRaw);
      return Array.isArray(valores)
        ? new Set<string>(valores.filter((item): item is string => typeof item === "string"))
        : new Set<string>(permissoesPadraoPerfil(perfil));
    } catch {
      return new Set<string>(permissoesPadraoPerfil(perfil));
    }
  }, [perfil, permissoesRaw]);
  const [menuMobileNaRota, setMenuMobileNaRota] = useState<string | null>(null);
  const abertoMobile = menuMobileNaRota !== null && menuMobileNaRota === pathname;

  const itensVisiveis = useMemo(
    () => ITENS_MENU.filter((item) => {
      if (!item.perfis.includes(perfil)) return false;
      if (!item.permissao) return true;
      return permissoes.has(item.permissao);
    }),
    [perfil, permissoes]
  );

  function irPara(rota: string) {
    // Fecha o menu a partir da interação, sem precisar sincronizar estado em useEffect.
    setMenuMobileNaRota(null);
    if (pathname !== rota) {
      router.push(rota);
    }
  }

  const conteudoMenu = (
    <>
      <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#91a099]">
        Menu principal
      </p>

      <nav className="space-y-1.5">
        {itensVisiveis.map((item) => {
          const ativo =
            pathname === item.rota ||
            pathname?.startsWith(`${item.rota}/`);

          const Icone = item.icone;

          return (
            <button
              key={item.rota}
              type="button"
              onClick={() => irPara(item.rota)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-semibold transition ${
                ativo
                  ? "bg-[#005a3c] text-white shadow-sm"
                  : "text-[#50625a] hover:bg-[#e8f3ee] hover:text-[#005a3c]"
              }`}
            >
              <Icone className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 truncate">{item.nome}</span>
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
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuMobileNaRota(pathname ?? "/painel")}
        aria-label="Abrir menu"
        className="fixed left-4 top-[18px] z-50 flex h-10 w-10 items-center justify-center rounded-xl border border-[#d5e0da] bg-white shadow-sm lg:hidden"
      >
        <MenuIcon className="h-5 w-5 text-[#005a3c]" />
      </button>

      <aside className="fixed left-0 top-[76px] z-30 hidden h-[calc(100vh-76px)] w-[220px] overflow-y-auto border-r border-[#dfe9e3] bg-[#f7faf8] px-3 py-4 lg:block">
        {conteudoMenu}
      </aside>

      {abertoMobile && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMenuMobileNaRota(null)}
          />

          <aside className="absolute inset-y-0 left-0 w-[260px] max-w-[80vw] overflow-y-auto bg-[#f7faf8] px-3 py-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setMenuMobileNaRota(null)}
              aria-label="Fechar menu"
              className="mb-4 ml-auto flex h-9 w-9 items-center justify-center rounded-xl border border-[#d5e0da] bg-white"
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
