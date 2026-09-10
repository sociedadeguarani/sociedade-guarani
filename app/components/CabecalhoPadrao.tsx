"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const INSTAGRAM_URL = "https://www.instagram.com/sociedaderguarani/";
const WHATSAPP_URL = "https://wa.me/5555991817619";

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.9">
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" />
      <circle cx="12" cy="12" r="4.1" />
      <circle cx="17.5" cy="6.7" r="1" className="fill-current stroke-none" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
      <path d="M20.5 3.5A11.9 11.9 0 0 0 12.03 0C5.43 0 .06 5.36.06 11.96c0 2.11.55 4.17 1.6 5.99L0 24l6.2-1.62a11.93 11.93 0 0 0 5.83 1.51h.01c6.6 0 11.96-5.36 11.96-11.96 0-3.19-1.24-6.18-3.5-8.43ZM12.04 21.9h-.01a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.68.96.98-3.59-.23-.37a9.88 9.88 0 0 1-1.52-5.35C2.17 6.5 6.6 2.08 12.04 2.08c2.64 0 5.12 1.03 6.99 2.9a9.82 9.82 0 0 1 2.89 7c0 5.44-4.43 9.92-9.88 9.92Zm5.42-7.43c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.74-1.65-2.04-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.03-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.13 3.25 5.17 4.56.72.31 1.28.5 1.72.64.72.23 1.37.2 1.89.12.58-.09 1.76-.72 2.01-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

function UserCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="9" r="2.6" />
      <path d="M7.5 18c.9-2.2 2.4-3.3 4.5-3.3s3.6 1.1 4.5 3.3" />
    </svg>
  );
}

export default function CabecalhoPadrao() {
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState("");

  useEffect(() => {
    setNome(localStorage.getItem("guarani_usuario_nome") || localStorage.getItem("guarani_usuario_email") || "Usuário");
    setPerfil((localStorage.getItem("guarani_usuario_perfil") || "").toLowerCase());
  }, []);

  async function sair() {
    await supabase.auth.signOut();
    localStorage.removeItem("guarani_usuario_email");
    localStorage.removeItem("guarani_usuario_id");
    localStorage.removeItem("guarani_usuario_perfil");
    localStorage.removeItem("guarani_usuario_socio_id");
    localStorage.removeItem("guarani_usuario_nome");
    window.location.replace("/login");
  }

  const titulo = perfil === "administrador" ? "Administrador" : perfil === "associado" ? "Área do Associado" : perfil === "funcionario" ? "Área do Funcionário" : "Sistema de Gestão";

  return (
    <header className="sticky top-0 z-40 border-b border-[#dfe7e2] bg-white/95 shadow-sm backdrop-blur">
      <div className="flex min-h-[76px] items-center justify-between px-4 sm:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-sm ring-1 ring-[#e4ebe7]">
            <img src="/logo-guarani.png" alt="Sociedade Guarani" className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-extrabold tracking-tight text-[#005a3c] sm:text-lg">SOCIEDADE GUARANI</div>
            <div className="hidden text-xs text-gray-500 sm:block">Sociedade Recreativa Guarani — S.R.G.</div>
            <div className="mt-1 flex items-center gap-1">
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram da Sociedade Recreativa Guarani" title="Instagram" className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#005a3c] transition hover:bg-[#e8f3ee]"><InstagramIcon /></a>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp da Sociedade Recreativa Guarani" title="WhatsApp" className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#005a3c] transition hover:bg-[#e8f3ee]"><WhatsAppIcon /></a>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button type="button" aria-label="Notificações" title="Notificações" className="relative hidden h-10 w-10 items-center justify-center rounded-full text-[#005a3c] hover:bg-[#e8f3ee] sm:flex">
            <BellIcon />
            <span className="absolute right-2 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
          <div className="hidden h-10 w-10 items-center justify-center rounded-full bg-[#005a3c] text-white sm:flex"><UserCircleIcon /></div>
          <div className="hidden text-right sm:block">
            <div className="text-sm font-bold text-[#17382c]">{nome}</div>
            <div className="text-xs text-[#005a3c]">{titulo}</div>
          </div>
          <button type="button" onClick={sair} className="rounded-xl border border-[#d5e0da] bg-white px-4 py-2 text-sm font-bold text-[#174133] hover:bg-[#f2f7f4]">Sair</button>
        </div>
      </div>
    </header>
  );
}
