"use client";

import { useEffect, useState } from "react";
import { Bell, Instagram, MessageCircle, UserCircle2 } from "lucide-react";

const ROTULO_PERFIL: Record<string, string> = {
  administrador: "Administrador",
  funcionario: "Funcionário",
  associado: "Associado",
};

export default function CabecalhoPadrao() {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState("");

  useEffect(() => {
    try {
      setEmail(window.localStorage.getItem("guarani_usuario_email") || "");
      setNome(window.localStorage.getItem("guarani_usuario_nome") || "");
      setPerfil((window.localStorage.getItem("guarani_usuario_perfil") || "").trim().toLowerCase());
    } catch {
      // Ignora bloqueio do localStorage.
    }
  }, []);

  function sair() {
    try {
      window.localStorage.removeItem("guarani_usuario_email");
      window.localStorage.removeItem("guarani_usuario_nome");
      window.localStorage.removeItem("guarani_usuario_perfil");
      window.localStorage.removeItem("guarani_usuario_id");
      window.localStorage.removeItem("guarani_usuario_socio_id");
    } catch {
      // Ignora bloqueio do localStorage.
    }
    window.location.href = "/login";
  }

  const rotuloPerfil = ROTULO_PERFIL[perfil] || "Usuário";

  return (
    <header className="sticky top-0 z-40 h-[76px] border-b border-[#dfe7e2] bg-white shadow-sm">
      <div className="flex h-full items-center justify-between pl-16 pr-5 lg:pl-6 lg:pr-6">
        <div className="flex items-center gap-3">
          <div className="hidden h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-[#005a3c] p-1 shadow-sm sm:flex">
            <img
              src="/logo-guarani.png"
              alt="Sociedade Guarani"
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <div className="text-base font-extrabold tracking-tight text-[#005a3c] sm:text-lg">
              SOCIEDADE GUARANI
            </div>
            <div className="hidden text-xs font-medium text-[#6b7d74] sm:block">
              Sociedade Recreativa Guarani — S.R.G.
            </div>
            <div className="mt-0.5 hidden items-center gap-2 text-[#005a3c] sm:flex">
              <Instagram className="h-3.5 w-3.5" />
              <MessageCircle className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => { window.location.href = "/avisos"; }}
            aria-label="Ver avisos"
            title="Ver avisos"
            className="relative hidden rounded-full p-2 text-[#005a3c] hover:bg-[#eef5f1] sm:block"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f3ee] text-[#005a3c]">
              <UserCircle2 className="h-5 w-5" />
            </div>
            <div className="text-right leading-tight">
              <div className="text-sm font-bold text-[#173d2e]">{nome || rotuloPerfil}</div>
              <div className="text-[10px] text-[#718078]">{email || rotuloPerfil}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={sair}
            className="rounded-xl border border-[#d5e0da] bg-white px-4 py-2 text-sm font-bold text-[#174133] hover:bg-[#f2f7f4]"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
