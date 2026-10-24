"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import MenuLateralPadrao from "../components/MenuLateralPadrao";

const atalhosAdmin = [
  ["👥", "Sócios", "/socios", "Cadastre, edite e consulte associados."],
  ["💰", "Financeiro", "/financeiro", "Mensalidades, recebimentos e despesas."],
  ["📅", "Reservas", "/reservas", "Salões, quiosques e espaços."],
  ["🎉", "Eventos", "/eventos", "Eventos, ingressos e fichas."],
  ["🎫", "Carteirinhas", "/carteirinhas", "Carteirinha digital e QR Code."],
  ["🏖️", "Temporada", "/temporadas", "Venda e gerenciamento de temporadas."],
  ["📢", "Avisos", "/avisos", "Comunicados para os associados."],
  ["📦", "Inventário", "/inventario", "Patrimônio e controle de itens."],
  ["🚪", "Acessos", "/acessos", "Controle e consulta de entradas."],
];

const atalhosMaster = [
  ...atalhosAdmin,
  [
    "👤",
    "Usuários",
    "/usuarios",
    "Crie, edite, ative ou desative usuários e defina seus perfis.",
  ],
];

const atalhosFuncionario = [
  ["🎫", "Carteirinhas", "/carteirinhas", "Consulte por matrícula ou QR Code."],
  ["📦", "Inventário", "/inventario", "Patrimônio e controle de itens."],
  ["🚪", "Acessos", "/acessos", "Controle e consulta de entradas."],
  ["📅", "Reservas", "/reservas", "Salões, quiosques e espaços."],
  ["📢", "Avisos", "/avisos", "Comunicados da Sociedade."],
];

const atalhosInventario = [
  ["📦", "Inventário", "/inventario", "Cadastro de itens e controle de empréstimos."],
  ["🎫", "Carteirinhas", "/carteirinhas", "Consulta de associados e carteirinhas."],
  ["📢", "Avisos", "/avisos", "Comunicados da Sociedade."],
];

const atalhosAssociado = [
  ["🎫", "Carteirinhas", "/carteirinhas", "Sua carteirinha e a da sua família."],
  ["💰", "Minhas mensalidades", "/mensalidades", "Veja suas mensalidades e pague pendências."],
  ["📅", "Reservas", "/reservas", "Salões, quiosques e espaços."],
  ["🎉", "Eventos", "/eventos", "Eventos e ingressos."],
  ["📢", "Avisos", "/avisos", "Comunicados da Sociedade."],
];

export default function PainelPage() {
  const [nome, setNome] = useState("Usuário");
  const [perfil, setPerfil] = useState("");

  const [totalSocios, setTotalSocios] = useState<number | null>(null);
  const [sociosAtivos, setSociosAtivos] = useState<number | null>(null);
  const [sociosInativos, setSociosInativos] = useState<number | null>(null);

  const [totalDependentes, setTotalDependentes] = useState<number | null>(null);

  const [totalTemporadas, setTotalTemporadas] = useState<number | null>(null);

  const [reservasPendentes, setReservasPendentes] = useState<number | null>(null);
  const [pixPendentes, setPixPendentes] = useState<number | null>(null);


  useEffect(() => {
    setNome(localStorage.getItem("guarani_usuario_nome") || "Usuário");
    setPerfil(localStorage.getItem("guarani_usuario_perfil") || "");

    let ativo = true;

    async function carregarResumo() {
      let {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        session = (await supabase.auth.refreshSession()).data.session;
      }
      if (!session?.access_token || !ativo) return;

      const headers = { Authorization: `Bearer ${session.access_token}` };

      // Cada card é atualizado assim que sua própria consulta termina.
      // Uma API lenta não segura os resultados das outras consultas.
      const tarefas = [
        (async () => {
          const response = await fetch("/api/socios?resumo=1", { headers, cache: "no-store" });
          const json = await response.json().catch(() => ({}));
          if (!ativo || !response.ok) return;
          const total = Number(json.total);
          const ativos = Number(json.ativos);
          const inativos = Number(json.inativos);
          if (Number.isFinite(total)) setTotalSocios(total);
          if (Number.isFinite(ativos)) setSociosAtivos(ativos);
          if (Number.isFinite(inativos)) setSociosInativos(inativos);
        })(),
        (async () => {
          const response = await fetch("/api/carteirinhas?modo=dependentes", { headers, cache: "no-store" });
          const json = await response.json().catch(() => ({}));
          if (!ativo || !response.ok) return;
          const sociosParaDependentes = Array.isArray(json.socios) ? json.socios : [];
          const dependentesCadastrados = Array.isArray(json.dependentes) ? json.dependentes : [];
          const normalizarTextoDependente = (valor: unknown) => String(valor || "")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
          const ehDependenteFamiliarSocio = (socio: any) => {
            if (!socio?.responsavel_id) return false;
            const tipo = normalizarTextoDependente(socio.tipo_socio);
            const categoria = normalizarTextoDependente(socio.categoria);
            return tipo === "dependente_patrimonial_familiar" ||
              tipo === "dependente_patrimonial_familiar_mensalidade" ||
              tipo === "dependente_contribuinte_familiar" ||
              tipo === "dependente_contribuinte_familiar_mensalidade" ||
              categoria.includes("dependente patrimonial familiar") ||
              categoria.includes("dependente contribuinte familiar");
          };
          const chavesExistentes = new Set(
            dependentesCadastrados.flatMap((dependente: any) => [
              normalizarTextoDependente(dependente.nome),
              normalizarTextoDependente(dependente.matricula),
            ]).filter(Boolean)
          );
          const dependentesLegados = sociosParaDependentes
            .filter(ehDependenteFamiliarSocio)
            .filter((socio: any) =>
              !chavesExistentes.has(normalizarTextoDependente(socio.nome)) &&
              !chavesExistentes.has(normalizarTextoDependente(socio.matricula))
            );
          setTotalDependentes(dependentesCadastrados.length + dependentesLegados.length);
        })(),
        (async () => {
          const response = await fetch("/api/reservas?status=pendente", { headers, cache: "no-store" });
          const json = await response.json().catch(() => ({}));
          if (!ativo || !response.ok) return;
          const lista = Array.isArray(json.reservas) ? json.reservas : [];
          setReservasPendentes(lista.filter((r: any) => r.status === "pendente").length);
        })(),
        (async () => {
          const response = await fetch("/api/notificacoes/admin?nao_lidas=true&limite=50", { headers, cache: "no-store" });
          const json = await response.json().catch(() => ({}));
          if (!ativo || !response.ok) return;
          const lista = Array.isArray(json.notificacoes) ? json.notificacoes : [];
          const pendentes = lista.filter((n: any) =>
            String(n.comprovante_status || "").toLowerCase() === "pendente" ||
            String(n.origem_tipo || "").toLowerCase() === "pagamento"
          );
          setPixPendentes(pendentes.length);
        })(),
        (async () => {
          const response = await fetch("/api/temporadas?resumo=1", { headers, cache: "no-store" });
          const json = await response.json().catch(() => ({}));
          if (!ativo || !response.ok) return;
          const total = Number(json.total);
          if (Number.isFinite(total)) setTotalTemporadas(total);
        })(),
      ];

      // Cada tarefa trata seu próprio erro para que uma falha não impeça os outros cards.
      await Promise.allSettled(tarefas);
    }

    void carregarResumo().catch(() => {
      // O painel continua utilizável mesmo se a sessão ou uma consulta falhar.
    });

    return () => {
      ativo = false;
    };
  }, []);

  /* =========================
     PERFIL
  ========================= */

  const p = perfil
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const master =
    p === "administrador_master" ||
    p === "master";

  const admin =
    p === "administrador" ||
    p === "admin";

  const funcionario =
    p === "funcionario" ||
    p === "funcionario_inventario";

  const atalhos =
    master || admin
      ? master
        ? atalhosMaster
        : atalhosAdmin
      : p === "funcionario_inventario"
        ? atalhosInventario
        : funcionario
          ? atalhosFuncionario
          : atalhosAssociado;

  const nomeDoPerfil =
    master
      ? "Administrador Master"
      : admin
        ? "Administrador"
        : p === "funcionario_inventario"
          ? "Funcionário - Inventário"
          : p === "funcionario"
            ? "Funcionário"
            : "Associado";

  return (
    <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">

      <CabecalhoPadrao />

      <MenuLateralPadrao />

      <section className="relative min-w-0 overflow-hidden p-5 sm:p-7 lg:ml-[220px] lg:p-8">

        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-[-120px] top-[180px] z-0 h-[720px] w-[720px] opacity-[0.075] sm:right-[-70px]"
        >
          <img
            src="/logo-guarani.png"
            alt=""
            className="h-full w-full object-contain"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-[1400px]">

          {/* =========================
             CABEÇALHO
          ========================= */}

          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#005a3c] to-[#003d2b] p-6 text-white shadow-lg sm:p-8">

            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <p className="text-sm font-semibold text-white/70">
                  Painel de gestão
                </p>

                <h1 className="mt-1 text-3xl font-black sm:text-4xl">
                  Olá, {nome}!
                </h1>

                <p className="mt-2 text-sm text-white/80">
                  Tudo da Sociedade Recreativa Guarani em um só lugar.
                  Use os atalhos abaixo para acessar os módulos.
                </p>

              </div>

              {(admin || master) && (
                <a
                  href="/socios"
                  className="rounded-xl bg-white px-5 py-3 text-center text-sm font-black text-[#005a3c]"
                >
                  + Novo sócio
                </a>
              )}

              {master && (
                <a
                  href="/usuarios"
                  className="rounded-xl bg-white px-5 py-3 text-center text-sm font-black text-[#005a3c]"
                >
                  + Novo usuário
                </a>
              )}

            </div>

          </div>

          {/* =========================
             CARDS PRINCIPAIS
          ========================= */}

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">

            {/* SÓCIOS */}

            <a
              href="/socios"
              className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">
                Sócios
              </p>

              <p className="mt-1 text-3xl font-black text-[#005a3c]">
                {totalSocios ?? "—"}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {sociosAtivos ?? "—"} ativos ·{" "}
                {sociosInativos ?? "—"} inativos
              </p>
            </a>

            {/* DEPENDENTES */}

            <a
              href="/dependentes"
              className="rounded-2xl border border-[#dceee4] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">
                Dependentes
              </p>

              <p className="mt-1 text-3xl font-black text-[#005a3c]">
                {totalDependentes ?? "—"}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Cadastros familiares unificados
              </p>
            </a>

            {/* TEMPORADAS */}

            <a
              href="/temporadas"
              className="rounded-2xl border border-[#f2bb91] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">
                Temporadas
              </p>

              <p className="mt-1 text-3xl font-black text-[#b65308]">
                {totalTemporadas ?? "—"}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Temporadas cadastradas
              </p>
            </a>

            {/* RESERVAS */}

            <a
              href="/reservas?status=pendente"
              className="rounded-2xl border border-[#f0e3cf] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">
                Reservas pendentes
              </p>

              <p className="mt-1 text-3xl font-black text-[#b56a12]">
                {reservasPendentes ?? "—"}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Aguardando conferência
              </p>
            </a>

            {/* PIX */}

            <a
              href="/avisos"
              className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">
                PIX pendentes
              </p>

              <p className="mt-1 text-3xl font-black text-[#b56a12]">
                {pixPendentes ?? "—"}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Comprovantes aguardando conferência
              </p>
            </a>

          </div>

          {/* =========================
             ALERTAS
          ========================= */}

          {(master || admin) &&
            (
              (sociosInativos ?? 0) > 0 ||
              (reservasPendentes ?? 0) > 0 ||
              (pixPendentes ?? 0) > 0
            ) && (

              <div className="mt-5 rounded-2xl border border-[#f1dfbd] bg-[#fffaf0] p-5">

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                  <div>

                    <p className="font-black text-[#7b4b0b]">
                      🔔 Atenção
                    </p>

                    <p className="mt-1 text-sm text-[#8c6a35]">
                      Há itens que podem precisar de ação da administração.
                      Clique em uma pendência para conferir.
                    </p>

                  </div>

                  <a
                    href="/avisos"
                    className="rounded-xl border border-[#d9c18f] bg-white px-4 py-2 text-center text-sm font-bold text-[#7b4b0b]"
                  >
                    Conferir pendências
                  </a>

                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">

                  <a
                    href="/reservas?status=pendente"
                    className="rounded-xl border border-white bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <p className="font-black text-[#173d2e]">
                      📅 Reservas
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {reservasPendentes === null
                        ? "Carregando..."
                        : `${reservasPendentes} pendente(s) — conferir agora`}
                    </p>
                  </a>

                  <a
                    href="/avisos"
                    className="rounded-xl border border-white bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <p className="font-black text-[#173d2e]">
                      💠 Pagamentos PIX
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {pixPendentes === null
                        ? "Carregando..."
                        : `${pixPendentes} pendente(s) — conferir agora`}
                    </p>
                  </a>

                  <a
                    href="/socios"
                    className="rounded-xl border border-white bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <p className="font-black text-[#173d2e]">
                      ⚠️ Cadastro
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      {sociosInativos ?? "—"} sócio(s) inativo(s)
                    </p>
                  </a>

                </div>

              </div>
            )}

          {/* =========================
             ACESSO RÁPIDO
          ========================= */}

          <div className="mt-8">

            <h2 className="text-2xl font-black text-[#005a3c]">
              Acesso rápido
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Clique em um módulo para abrir sua tela.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">

              {atalhos.map(
                ([icone, titulo, rota, descricao]) => (
                  <a
                    key={rota}
                    href={rota}
                    className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >

                    <div className="text-2xl">
                      {icone}
                    </div>

                    <div className="mt-3 text-lg font-black text-[#003d2b]">
                      {titulo}
                    </div>

                    <p className="mt-1 text-sm text-slate-500">
                      {descricao}
                    </p>

                  </a>
                )
              )}

            </div>

          </div>

        </div>

      </section>

    </main>
  );
}
