"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Bell, CircleUserRound } from "lucide-react";

type Perfil =
  | "associado"
  | "funcionario"
  | "funcionario_inventario"
  | "administrador"
  | "administrador_master";

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

function nomePerfil(perfil: Perfil) {
  switch (perfil) {
    case "administrador_master":
      return "Administrador Master";
    case "administrador":
      return "Administrador";
    case "funcionario":
      return "Funcionário";
    case "funcionario_inventario":
      return "Funcionário — Inventário";
    case "associado":
      return "Associado";
  }
}

export default function CabecalhoPadrao() {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("associado");
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    try {
      setEmail(
        window.localStorage.getItem("guarani_usuario_email") || ""
      );

      setNome(
        window.localStorage.getItem("guarani_usuario_nome") || ""
      );

      setPerfil(
        normalizarPerfil(
          window.localStorage.getItem("guarani_usuario_perfil")
        )
      );
    } catch {
      // Ignora bloqueio do localStorage.
    }
  }, []);

  async function sair() {
    if (saindo) return;

    setSaindo(true);

    try {
      await supabase.auth.signOut();
    } catch {
      // Mesmo se o signOut falhar, limpamos os dados locais
      // para não deixar uma sessão visualmente presa.
    } finally {
      try {
        const chaves = [
          "guarani_usuario_email",
          "guarani_usuario_id",
          "guarani_usuario_perfil",
          "guarani_usuario_socio_id",
          "guarani_usuario_nome",
        ];

        chaves.forEach((chave) =>
          window.localStorage.removeItem(chave)
        );
      } catch {
        // Ignora bloqueio do localStorage.
      }

      window.location.href = "/login";
    }
  }

  const nomeExibicao =
    nome.trim() ||
    email.split("@")[0] ||
    "Usuário";

  return (
    <header className="sticky top-0 z-40 border-b border-[#dfe7e2] bg-white/95 shadow-sm backdrop-blur">
      <div className="flex min-h-[76px] items-center justify-between gap-3 px-3 sm:px-5 lg:px-6 lg:pl-[245px]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#005a3c] p-1 shadow-sm lg:hidden">
            <img
              src="/logo-guarani.png"
              alt="Sociedade Guarani"
              className="h-full w-full object-contain"
            />
          </div>

          <div className="min-w-0">
            <div className="truncate text-base font-extrabold text-[#005a3c] sm:text-lg">
              SOCIEDADE GUARANI
            </div>

            <div className="hidden truncate text-xs text-gray-500 sm:block">
              Sociedade Recreativa Guarani — S.R.G.
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Avisos"
            className="hidden h-10 w-10 items-center justify-center rounded-xl text-[#426258] transition hover:bg-[#e8f3ee] hover:text-[#005a3c] sm:flex"
          >
            <Bell className="h-[19px] w-[19px]" />
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f3ee] text-[#005a3c]">
              <CircleUserRound className="h-5 w-5" />
            </div>

            <div className="max-w-[190px] text-right">
              <div className="truncate text-xs font-semibold text-[#314b41]">
                {nomeExibicao}
              </div>

              <div className="truncate text-[11px] font-bold text-[#005a3c]">
                {nomePerfil(perfil)}
              </div>

              {email && (
                <div className="truncate text-[10px] text-gray-400">
                  {email}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={sair}
            disabled={saindo}
            className="rounded-xl border border-[#c9d9d1] bg-white px-3 py-2 text-sm font-bold text-[#005a3c] shadow-sm transition hover:bg-[#f0f7f3] disabled:cursor-wait disabled:opacity-60 sm:px-4"
          >
            {saindo ? "Saindo..." : "Sair"}
          </button>
        </div>
      </div>
    </header>
  );
}
