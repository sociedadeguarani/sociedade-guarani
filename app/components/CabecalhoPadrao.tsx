"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function CabecalhoPadrao() {
  const [nome, setNome] = useState(""); const [perfil, setPerfil] = useState("");
  useEffect(() => { setNome(localStorage.getItem("guarani_usuario_nome") || localStorage.getItem("guarani_usuario_email") || "Usuário"); setPerfil((localStorage.getItem("guarani_usuario_perfil") || "").toLowerCase()); }, []);
  async function sair() { await supabase.auth.signOut(); localStorage.removeItem("guarani_usuario_email"); localStorage.removeItem("guarani_usuario_id"); localStorage.removeItem("guarani_usuario_perfil"); localStorage.removeItem("guarani_usuario_socio_id"); localStorage.removeItem("guarani_usuario_nome"); window.location.replace("/login"); }
  const titulo = perfil === "administrador" ? "Administrador" : perfil === "associado" ? "Área do Associado" : perfil === "funcionario" ? "Área do Funcionário" : "Sistema de Gestão";
  return <header className="sticky top-0 z-40 border-b border-[#dfe7e2] bg-white/95 shadow-sm backdrop-blur"><div className="flex min-h-[76px] items-center justify-between px-5 pl-[68px] lg:px-6 lg:pl-[245px]"><div className="flex items-center gap-3"><div className="lg:hidden flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-[#005a3c] p-1"><img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-full w-full object-contain" /></div><div><div className="text-lg font-extrabold text-[#005a3c]">SOCIEDADE GUARANI</div><div className="text-xs text-gray-500">Sociedade Recreativa Guarani — S.R.G.</div></div></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><div className="text-sm font-bold text-[#17382c]">{nome}</div><div className="text-xs text-[#005a3c]">{titulo}</div></div><button type="button" onClick={sair} className="rounded-xl border border-[#d5e0da] bg-white px-4 py-2 text-sm font-bold text-[#174133] hover:bg-[#f2f7f4]">Sair</button></div></div></header>;
}
