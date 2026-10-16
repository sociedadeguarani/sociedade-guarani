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
    perfil === "admin"
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
  const [avisosAtivos, setAvisosAtivos] = useState(0);

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

  useEffect(() => {
    let ativo = true;
    let carregando = false;
    let intervalo: number | undefined;

    async function carregarContagemAvisos() {
      // Não consulta o servidor em abas ocultas e evita requisições sobrepostas.
      if (!ativo || document.visibilityState === "hidden" || carregando) return;
      carregando = true;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (ativo) setAvisosAtivos(0);
          return;
        }
        const resposta = await fetch("/api/avisos/contador", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const payload = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok) {
          setAvisosAtivos(Math.max(0, Number(payload?.total) || 0));
        }
      } catch {
        // O cabeçalho continua disponível mesmo se a contagem falhar.
      } finally {
        carregando = false;
      }
    }

    function iniciarIntervalo() {
      if (ativo && document.visibilityState !== "hidden" && intervalo === undefined) {
        intervalo = window.setInterval(() => void carregarContagemAvisos(), 20_000);
      }
    }

    function pararIntervalo() {
      if (intervalo !== undefined) {
        window.clearInterval(intervalo);
        intervalo = undefined;
      }
    }

    function aoMudarVisibilidade() {
      if (document.visibilityState === "hidden") {
        pararIntervalo();
      } else {
        void carregarContagemAvisos();
        iniciarIntervalo();
      }
    }

    void carregarContagemAvisos();
    iniciarIntervalo();
    window.addEventListener("focus", carregarContagemAvisos);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);

    return () => {
      ativo = false;
      pararIntervalo();
      window.removeEventListener("focus", carregarContagemAvisos);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [perfil]);

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
              src="/logo-guarani-header.webp"
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
            onClick={() => (window.location.href = "/avisos")}
            aria-label={avisosAtivos > 0 ? `Avisos ativos: ${avisosAtivos}` : "Avisos"}
            title={avisosAtivos > 0 ? `${avisosAtivos} aviso(s) ativo(s)` : "Abrir avisos"}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[#426258] transition hover:bg-[#e8f3ee] hover:text-[#005a3c]"
          >
            <Bell className="h-[19px] w-[19px]" />
            {avisosAtivos > 0 && (
              <span className="absolute -right-1 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-extrabold leading-none text-white shadow-sm">
                {avisosAtivos > 99 ? "99+" : avisosAtivos}
              </span>
            )}
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
