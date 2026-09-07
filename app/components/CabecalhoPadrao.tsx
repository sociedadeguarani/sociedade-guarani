"use client";

import { useEffect, useState } from "react";

export default function CabecalhoPadrao() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("guarani_usuario_email");
      if (raw) setEmail(raw);
    } catch {
      // Sem problema se o navegador não permitir localStorage.
    }
  }, []);

  function sair() {
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[#dfe7e2] bg-white">
      <div className="flex min-h-[76px] items-center justify-between px-5 lg:px-6">
        <div className="flex items-center gap-3 lg:ml-[220px]">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#005a3c] text-xl lg:hidden">
            🏛️
          </div>
          <div className="hidden lg:block" />
          <div>
            <div className="text-lg font-extrabold text-[#005a3c]">
              SOCIEDADE GUARANI
            </div>
            <div className="text-xs text-gray-500">
              Sociedade Recreativa Guarani — S.R.G.
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <div className="text-xs text-gray-400">
              {email || "Sistema de Gestão"}
            </div>
            <div className="text-sm font-bold text-[#005a3c]">
              Área Administrativa
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

