"use client";

import { useEffect, useState } from "react";
import { Bell, Instagram, MessageCircle, CircleUserRound } from "lucide-react";

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
    <header className="sticky top-0 z-40 border-b border-[#dfe9e3] bg-white/95 shadow-sm backdrop-blur">
      <div className="flex min-h-[76px] items-center justify-between px-5 sm:px-7">
        <div className="flex min-w-0 items-center gap-3 lg:pl-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#005a3c] p-1.5 shadow-sm">
            <img
              src="/logo-guarani.png"
              alt="Sociedade Guarani"
              className="h-full w-full object-contain"
            />
          </div>

          <div className="min-w-0">
            <div className="truncate text-base font-extrabold tracking-tight text-[#005a3c] sm:text-lg">
              SOCIEDADE GUARANI
            </div>
            <div className="text-xs font-medium text-[#6b7d74]">
              Sociedade Recreativa Guarani — S.R.G.
            </div>
            <div className="mt-1 flex items-center gap-2 text-[#005a3c]">
              <Instagram className="h-4 w-4" />
              <MessageCircle className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Notificações"
            className="relative rounded-full p-2 text-[#005a3c] hover:bg-[#e8f3ee]"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e8f3ee] text-[#005a3c]">
              <CircleUserRound className="h-5 w-5" />
            </div>
            <div className="text-right leading-tight">
              <div className="text-sm font-bold text-[#174133]">Administrador</div>
              <div className="text-[11px] text-[#6b7d74]">
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
