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
  const [carregandoPainel, setCarregandoPainel] = useState(true);

  useEffect(() => {
    setNome(localStorage.getItem("guarani_usuario_nome") || "Usuário");
    setPerfil(localStorage.getItem("guarani_usuario_perfil") || "");

    let ativo = true;

    (async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession();
        if (!session) session = (await supabase.auth.refreshSession()).data.session;
        if (!session?.access_token) return;

        const headers = { Authorization: `Bearer ${session.access_token}` };

        // Consultas independentes em paralelo: o painel não espera uma tela
        // terminar para começar a próxima.
        const [sociosResponse, dependentesResponse, reservasResponse, notificacoesResponse] =
          await Promise.all([
            fetch("/api/socios", { headers, cache: "no-store" }),
            fetch("/api/dependentes/migrar", { headers, cache: "no-store" }),
            fetch("/api/reservas?status=pendente", { headers, cache: "no-store" }),
            fetch("/api/notificacoes/admin?nao_lidas=true&limite=50", { headers, cache: "no-store" }),
          ]);

        const [sociosJson, dependentesJson, reservasJson, notificacoesJson] = await Promise.all([
          sociosResponse.json().catch(() => ({})),
          dependentesResponse.json().catch(() => ({})),
          reservasResponse.json().catch(() => ({})),
          notificacoesResponse.json().catch(() => ({})),
        ]);

        if (!ativo) return;

        if (sociosResponse.ok) {
          const todosSocios = Array.isArray(sociosJson.socios) ? sociosJson.socios : [];

          // A tela /socios usa exatamente esta regra: entram somente
          // os cadastros com mensalidade própria. Dependentes familiares
          // comuns não entram na contagem de Sócios.
          const sociosOficiais = todosSocios.filter((s: any) =>
            s?.possui_mensalidade === true
          );

          setTotalSocios(sociosOficiais.length);
          setSociosAtivos(
            sociosOficiais.filter((s: any) =>
              String(s?.situacao || "").toLowerCase() === "ativo"
            ).length
          );
          setSociosInativos(
            sociosOficiais.filter((s: any) =>
              String(s?.situacao || "").toLowerCase() === "inativo"
            ).length
          );

          // Dependentes antigos ainda podem existir em `socios`. Eles precisam
          // ser somados aos já migrados para `dependentes`, mas sem duplicar.
          const dependentesAntigos = todosSocios
            .filter((s: any) => Boolean(s?.responsavel_id) && s?.possui_mensalidade !== true)
            .map((s: any) => ({
              socio_id: String(s.responsavel_id),
              nome: String(s.nome || ""),
              cpf: String(s.cpf || ""),
            }));

          const dependentesMigrados = Array.isArray(dependentesJson.dependentes)
            ? dependentesJson.dependentes
            : [];

          const chaveDependente = (d: any) => {
            const responsavel = String(d?.socio_id || "");
            const cpf = String(d?.cpf || "").replace(/\D/g, "");
            const nome = String(d?.nome || "").trim().toLowerCase().replace(/\s+/g, " ");
            return `${responsavel}|${cpf}|${nome}`;
          };

          const unicos = new Set<string>();
          for (const d of [...dependentesMigrados, ...dependentesAntigos]) {
            unicos.add(chaveDependente(d));
          }
          setTotalDependentes(unicos.size);
        }

        if (reservasResponse.ok) {
          const lista = Array.isArray(reservasJson.reservas)
            ? reservasJson.reservas
            : [];
          setReservasPendentes(lista.filter((r: any) => r.status === "pendente").length);
        }

        if (notificacoesResponse.ok) {
          const lista = Array.isArray(notificacoesJson.notificacoes)
            ? notificacoesJson.notificacoes
            : [];
          const pendentes = lista.filter((n: any) =>
            String(n.comprovante_status || "").toLowerCase() === "pendente" ||
            String(n.origem_tipo || "").toLowerCase() === "pagamento"
          );
          setPixPendentes(pendentes.length);
        }
      } catch {
        // Os cards individuais permanecem com “—” quando uma fonte falhar.
      } finally {
        if (ativo) setCarregandoPainel(false);
      }
    })();

    return () => {
      ativo = false;
    };
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
            <a href="/socios" className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-sm text-slate-500">Sócios</p>
              <p className="mt-1 text-3xl font-black text-[#005a3c]">{carregandoPainel ? "—" : totalSocios ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-400">{sociosAtivos ?? "—"} ativos · {sociosInativos ?? "—"} inativos</p>
            </a>
            <a href="/dependentes" className="rounded-2xl border border-[#dceee4] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-sm text-slate-500">Dependentes</p>
              <p className="mt-1 text-3xl font-black text-[#005a3c]">{carregandoPainel ? "—" : totalDependentes ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-400">Cadastros familiares unificados</p>
            </a>
            <a href="/reservas?status=pendente" className="rounded-2xl border border-[#f0e3cf] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-sm text-slate-500">Reservas pendentes</p>
              <p className="mt-1 text-3xl font-black text-[#b56a12]">{carregandoPainel ? "—" : reservasPendentes ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-400">Aguardando conferência</p>
            </a>
            <a href="/avisos" className="rounded-2xl border border-[#e2ebe6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="text-sm text-slate-500">PIX pendentes</p>
              <p className="mt-1 text-3xl font-black text-[#b56a12]">{carregandoPainel ? "—" : pixPendentes ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-400">Comprovantes aguardando conferência</p>
            </a>
          </div>

          {(master || admin) && ((sociosInativos ?? 0) > 0 || (reservasPendentes ?? 0) > 0 || (pixPendentes ?? 0) > 0) && (
            <div className="mt-5 rounded-2xl border border-[#f1dfbd] bg-[#fffaf0] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-black text-[#7b4b0b]">🔔 Atenção</p>
                  <p className="mt-1 text-sm text-[#8c6a35]">Há itens que podem precisar de ação da administração. Clique em uma pendência para conferir.</p>
                </div>
                <a href="/avisos" className="rounded-xl border border-[#d9c18f] bg-white px-4 py-2 text-center text-sm font-bold text-[#7b4b0b]">Conferir pendências</a>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <a href="/avisos" className="rounded-xl border border-white bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <p className="font-black text-[#173d2e]">📅 Reservas</p>
                  <p className="mt-1 text-sm text-slate-500">{reservasPendentes === null ? "Carregando..." : `${reservasPendentes} pendente(s) — conferir agora`}</p>
                </a>
                <a href="/avisos" className="rounded-xl border border-white bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <p className="font-black text-[#173d2e]">💠 Pagamentos PIX</p>
                  <p className="mt-1 text-sm text-slate-500">{pixPendentes === null ? "Carregando..." : `${pixPendentes} pendente(s) — conferir agora`}</p>
                </a>
                <a href="/socios" className="rounded-xl border border-white bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                  <p className="font-black text-[#173d2e]">⚠️ Cadastro</p>
                  <p className="mt-1 text-sm text-slate-500">{sociosInativos ?? "—"} sócio(s) inativo(s)</p>
                </a>
              </div>
            </div>
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
