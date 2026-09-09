"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function CabecalhoPadrao() {
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState("");
  useEffect(() => {
    setNome(localStorage.getItem("guarani_usuario_nome") || localStorage.getItem("guarani_usuario_email") || "Usuário");
    setPerfil((localStorage.getItem("guarani_usuario_perfil") || "").toLowerCase());
  }, []);
  async function sair() {
    await supabase.auth.signOut();
    ["guarani_usuario_email","guarani_usuario_id","guarani_usuario_perfil","guarani_usuario_socio_id","guarani_usuario_nome"].forEach((k) => localStorage.removeItem(k));
    window.location.replace("/login");
  }
  const titulo = perfil === "administrador" ? "Administrador" : perfil === "associado" ? "Área do Associado" : perfil === "funcionario" ? "Área do Funcionário" : "Sistema de Gestão";
  return (
    <header className="sticky top-0 z-40 border-b border-[#dfe7e2] bg-white/95 shadow-sm backdrop-blur">
      <div className="flex min-h-[76px] items-center justify-between px-5 pl-16 lg:px-6 lg:pl-[245px]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#003d2b] p-1.5 sm:flex">
            <img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-extrabold text-[#005a3c] sm:text-lg">SOCIEDADE GUARANI</div>
            <div className="truncate text-xs text-gray-500">Sociedade Recreativa Guarani — S.R.G.</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block"><div className="text-sm font-bold text-[#173d2e]">{nome}</div><div className="text-xs text-[#005a3c]">{titulo}</div></div>
          <button type="button" onClick={sair} className="rounded-xl border border-[#d5e0da] bg-white px-4 py-2 text-sm font-bold text-[#174133] hover:bg-[#f2f7f4]">Sair</button>
        </div>
      </div>
    </header>
  );
}
