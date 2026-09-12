"use client";

import { useEffect, useState } from "react";
import { Bell, Instagram, MessageCircle, UserCircle2 } from "lucide-react";

export default function CabecalhoPadrao() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("guarani_usuario_email");
      if (raw) setEmail(raw);
    } catch {
      // Ignora bloqueio do localStorage.
    }
  }, []);

  function sair() {
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-40 h-[76px] border-b border-[#dfe7e2] bg-white shadow-sm">
      <div className="flex h-full items-center justify-between px-5 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-[#005a3c] p-1 shadow-sm">
            <img
              src="/logo-guarani.png"
              alt="Sociedade Guarani"
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <div className="text-lg font-extrabold tracking-tight text-[#005a3c]">
              SOCIEDADE GUARANI
            </div>
            <div className="text-xs font-medium text-[#6b7d74]">
              Sociedade Recreativa Guarani — S.R.G.
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[#005a3c]">
              <Instagram className="h-3.5 w-3.5" />
              <MessageCircle className="h-3.5 w-3.5" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Notificações"
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
              <div className="text-sm font-bold text-[#173d2e]">Administrador</div>
              <div className="text-[10px] text-[#718078]">
                {email || "Administrador"}
              </div>
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
