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
  ["📢", "Avisos", "/avisos", "Comunicados para os associados."],
  ["📦", "Inventário", "/inventario", "Patrimônio e controle de itens."],
  ["🚪", "Acessos", "/acessos", "Controle e consulta de entradas."],
];
const atalhosMaster = [
  ...atalhosAdmin,
  ["👤", "Usuários", "/usuarios", "Crie, edite, ative ou desative usuários e defina seus perfis."],
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
  const [reservasPendentes, setReservasPendentes] = useState<number | null>(null);
  const [pixPendentes, setPixPendentes] = useState<number | null>(null);
  const [notificacoesPendentes, setNotificacoesPendentes] = useState<any[]>([]);

  useEffect(() => {
    setNome(localStorage.getItem("guarani_usuario_nome") || "Usuário");
    setPerfil(localStorage.getItem("guarani_usuario_perfil") || "");

    (async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) session = (await supabase.auth.refreshSession()).data.session;
        if (!session?.access_token) return;
        const r = await fetch("/api/socios", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          const lista = Array.isArray(j.socios) ? j.socios : [];

          // Sócios oficiais = titulares + dependentes com mensalidade própria.
          // Dependentes familiares sem mensalidade ficam exclusivamente no módulo Dependentes.
          const sociosOficiais = lista.filter(
            (s: any) => !s.responsavel_id || s.possui_mensalidade === true
          );

          setTotalSocios(sociosOficiais.length);
          setSociosAtivos(
            sociosOficiais.filter(
              (s: any) =>
                s.ativo !== false &&
                String(s.situacao || "ativo").toLowerCase() !== "inativo"
            ).length
          );
          setSociosInativos(
            sociosOficiais.filter(
              (s: any) =>
                s.ativo === false ||
                String(s.situacao || "").toLowerCase() === "inativo"
            ).length
          );

          // Os dependentes da tela própria são a fonte oficial do contador.
          const rd = await fetch("/api/dependentes/migrar", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
          });
          const jd = await rd.json().catch(() => ({}));
          if (rd.ok) {
            setTotalDependentes(
              Array.isArray(jd.dependentes) ? jd.dependentes.length : 0
            );
          }

          if (master || admin) {
            const [rr, rn] = await Promise.all([
              fetch("/api/reservas?status=pendente", {
                headers: { Authorization: `Bearer ${session.access_token}` },
                cache: "no-store",
              }),
              fetch("/api/notificacoes/admin?nao_lidas=true&limite=50", {
                headers: { Authorization: `Bearer ${session.access_token}` },
                cache: "no-store",
              }),
            ]);

            const jr = await rr.json().catch(() => ({}));
            if (rr.ok) {
              setReservasPendentes(
                Array.isArray(jr.reservas) ? jr.reservas.length : 0
              );
            }

            const jn = await rn.json().catch(() => ({}));
            if (rn.ok) {
              const listaNotificacoes = Array.isArray(jn.notificacoes)
                ? jn.notificacoes
                : [];
              setNotificacoesPendentes(listaNotificacoes);
              setPixPendentes(
                listaNotificacoes.filter(
                  (n: any) =>
                    Boolean(n.comprovante_url) &&
                    String(n.comprovante_status || "pendente").toLowerCase() !== "aprovado"
                ).length
              );
            }
          }
        }
      } catch {}
    })();
  }, []);

  const p = perfil.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const master = p === "administrador_master" || p === "master";
  const admin = p === "administrador" || p === "administrador_normal" || p === "admin";
  const funcionario = p === "funcionario" || p === "funcionario_inventario";
  const atalhos = master || admin
    ? (master ? atalhosMaster : atalhosAdmin)
      : p === "funcionario_inventario"
        ? atalhosInventario
        : funcionario
          ? atalhosFuncionario
          : atalhosAssociado;

  const nomeDoPerfil = master
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
        <div aria-hidden="true" className="pointer-events-none absolute right-[-120px] top-[180px] z-0 h-[720px] w-[720px] opacity-[0.075] sm:right-[-70px]">
          <img src="/logo-guarani.png" alt="" className="h-full w-full object-contain" />
        </div>

        <div className="relative z-10 mx-auto max-w-[1400px]">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#005a3c] to-[#003d2b] p-6 text-white shadow-lg sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white/70">Painel de gestão</p>
                <h1 className="mt-1 text-3xl font-black sm:text-4xl">Olá, {nome}!</h1>
                <p className="mt-2 text-sm text-white/80">
                  {"Tudo da Sociedade Recreativa Guarani em um só lugar. Use os atalhos abaixo para acessar os módulos."}
                </p>
              </div>
              {(admin || master) && (
                <a href="/socios" className="rounded-xl bg-white px-5 py-3 text-center text-sm font-black text-[#005a3c]">
                  + Novo sócio
                </a>
              )}
              {master && (
                <a href="/usuarios" className="rounded-xl bg-white px-5 py-3 text-center text-sm font-black text-[#005a3c]">
                  + Novo usuário
                </a>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <a
              href="/socios"
              className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">Sócios</p>
              <p className="mt-1 text-3xl font-black text-[#005a3c]">
                {totalSocios === null ? "—" : totalSocios}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {sociosAtivos === null ? "Carregando..." : `${sociosAtivos} ativos`}
              </p>
            </a>

            <a
              href="/dependentes"
              className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">Dependentes</p>
              <p className="mt-1 text-3xl font-black text-[#005a3c]">
                {totalDependentes === null ? "—" : totalDependentes}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Famílias e dependentes cadastrados
              </p>
            </a>

            <a
              href="/reservas"
              className="rounded-2xl border border-[#dceee4] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">Reservas pendentes</p>
              <p className="mt-1 text-3xl font-black text-[#16834f]">
                {reservasPendentes === null ? "—" : reservasPendentes}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Aguardando conferência
              </p>
            </a>

            <a
              href="/avisos"
              className="rounded-2xl border border-[#f0e3cf] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="text-sm text-slate-500">
                {master || admin ? "PIX pendentes" : "Avisos pendentes"}
              </p>
              <p className="mt-1 text-3xl font-black text-[#b56a12]">
                {master || admin
                  ? pixPendentes === null
                    ? "—"
                    : pixPendentes
                  : notificacoesPendentes.length}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {master || admin
                  ? "Comprovantes aguardando conferência"
                  : "Notificações para consultar"}
              </p>
            </a>
          </div>

          {(master || admin) && (
            <section className="mt-6 rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-black text-[#005a3c]">🔔 Atenção</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    O que precisa de conferência ou ação agora.
                  </p>
                </div>
                <a
                  href="/avisos"
                  className="rounded-xl border border-[#b9d8c7] px-4 py-2 text-center text-sm font-bold text-[#005a3c]"
                >
                  Ver avisos
                </a>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <a
                  href="/reservas"
                  className="rounded-xl border border-[#e7eee9] bg-[#f8fbf9] p-4"
                >
                  <p className="font-black text-[#003d2b]">📅 Reservas</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {reservasPendentes === null
                      ? "Carregando..."
                      : reservasPendentes === 0
                        ? "Nenhuma reserva pendente."
                        : `${reservasPendentes} aguardando confirmação.`}
                  </p>
                </a>

                <a
                  href="/avisos"
                  className="rounded-xl border border-[#e7eee9] bg-[#f8fbf9] p-4"
                >
                  <p className="font-black text-[#003d2b]">💠 Pagamentos PIX</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {pixPendentes === null
                      ? "Carregando..."
                      : pixPendentes === 0
                        ? "Nenhum PIX pendente."
                        : `${pixPendentes} comprovante(s) aguardando conferência.`}
                  </p>
                </a>

                <a
                  href="/socios"
                  className="rounded-xl border border-[#e7eee9] bg-[#f8fbf9] p-4"
                >
                  <p className="font-black text-[#003d2b]">⚠️ Cadastro</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {sociosInativos === null
                      ? "Carregando..."
                      : sociosInativos === 0
                        ? "Nenhum sócio inativo."
                        : `${sociosInativos} sócio(s) inativo(s).`}
                  </p>
                </a>
              </div>
            </section>
          )}

          <div className="mt-8">
            <h2 className="text-2xl font-black text-[#005a3c]">Acesso rápido</h2>
            <p className="mt-1 text-sm text-slate-500">
              Clique em um módulo para abrir sua tela.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {atalhos.map(([icone, titulo, rota, descricao]) => (
                <a key={rota} href={rota} className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <div className="text-2xl">{icone}</div>
                  <div className="mt-3 text-lg font-black text-[#003d2b]">{titulo}</div>
                  <p className="mt-1 text-sm text-slate-500">{descricao}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
