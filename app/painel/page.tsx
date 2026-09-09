"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CreditCard,
  DoorOpen,
  Megaphone,
  PartyPopper,
  Users,
  Wallet,
} from "lucide-react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import { supabase } from "@/lib/supabaseClient";

type Socio = {
  id: string;
  matricula: number | null;
  nome: string;
  situacao: string | null;
  responsavel_id: string | null;
};

const atalhos = [
  { titulo: "Sócios", descricao: "Cadastre, edite e consulte associados", rota: "/socios", icone: Users },
  { titulo: "Financeiro", descricao: "Mensalidades, pagamentos e recibos", rota: "/financeiro", icone: Wallet },
  { titulo: "Reservas", descricao: "Salões, quiosques e espaços", rota: "/reservas", icone: CalendarDays },
  { titulo: "Eventos", descricao: "Eventos, ingressos e fichas", rota: "/eventos", icone: PartyPopper },
  { titulo: "Carteirinhas", descricao: "Carteirinhas digitais dos associados", rota: "/carteirinhas", icone: CreditCard },
  { titulo: "Acessos", descricao: "Controle de entradas e validação", rota: "/acessos", icone: DoorOpen },
];

export default function PainelPage() {
  const [perfil, setPerfil] = useState("");
  const [nome, setNome] = useState("Usuário");
  const [socios, setSocios] = useState<Socio[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    async function iniciar() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login");
          return;
        }

        const resposta = await fetch("/api/login/perfil", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          cache: "no-store",
        });
        const json = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !json.usuario) {
          window.location.replace("/login");
          return;
        }

        const usuario = json.usuario;
        const perfilAtual = String(usuario.perfil || "").toLowerCase();
        setPerfil(perfilAtual);
        setNome(usuario.nome_exibicao || "Usuário");

        if (["administrador", "funcionario"].includes(perfilAtual)) {
          const sociosResposta = await fetch("/api/socios", {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
            cache: "no-store",
          });
          const sociosJson = await sociosResposta.json().catch(() => ({}));
          if (sociosResposta.ok) setSocios(sociosJson.socios || []);
        }
      } finally {
        setCarregando(false);
      }
    }
    iniciar();
  }, []);

  const ativos = socios.filter((s) => String(s.situacao || "").toLowerCase() === "ativo").length;
  const dependentes = socios.filter((s) => Boolean(s.responsavel_id)).length;

  if (carregando) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f7faf8]"><div className="font-semibold text-[#005a3c]">Carregando painel...</div></main>;
  }

  const associado = perfil === "associado";

  return (
    <main className="min-h-screen bg-[#f7faf8] text-[#173d2e]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />

      <section className="min-w-0 px-4 py-6 sm:px-6 lg:ml-[220px] lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-7 flex flex-col gap-4 rounded-3xl bg-[#063b28] p-6 text-white shadow-lg sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-white/70">Sociedade Recreativa Guarani — S.R.G.</p>
              <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Olá, {nome.split(" ")[0]}! 👋</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/80">
                {associado ? "Acesse seus pagamentos, reservas, eventos e sua carteirinha digital." : "Tenha uma visão rápida da administração da Sociedade Guarani."}
              </p>
            </div>
            <button onClick={() => window.location.href = associado ? "/carteirinhas" : "/socios"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-extrabold text-[#005a3c] hover:bg-[#f5f8f6]">
              {associado ? "Minha carteirinha" : "Cadastrar sócio"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {!associado && (
            <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Resumo titulo="Total de sócios" valor={socios.length} icone="👥" />
              <Resumo titulo="Sócios ativos" valor={ativos} icone="✅" />
              <Resumo titulo="Dependentes" valor={dependentes} icone="👨‍👩‍👧‍👦" />
              <Resumo titulo="Módulos disponíveis" valor={6} icone="⚙️" />
            </div>
          )}

          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-[#005a3c]">Acesso rápido</h2>
              <p className="mt-1 text-sm text-gray-500">Escolha uma área para continuar.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(associado ? atalhos.filter((a) => ["/reservas", "/eventos", "/carteirinhas"].includes(a.rota)) : atalhos).map((item) => {
              const Icone = item.icone;
              return (
                <button key={item.rota} onClick={() => window.location.href = item.rota} className="group rounded-2xl border border-[#dfe9e3] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#9fcdb9] hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e8f3ee] text-[#005a3c]"><Icone className="h-6 w-6" /></div>
                    <ArrowRight className="h-5 w-5 text-gray-300 transition group-hover:translate-x-1 group-hover:text-[#005a3c]" />
                  </div>
                  <h3 className="mt-5 text-lg font-extrabold text-[#173d2e]">{item.titulo}</h3>
                  <p className="mt-1 text-sm text-gray-500">{item.descricao}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <InfoCard icone={<Megaphone className="h-5 w-5" />} titulo="Avisos" texto="Confira as comunicações e novidades da Sociedade." rota="/avisos" />
            <InfoCard icone={<CalendarDays className="h-5 w-5" />} titulo="Reservas" texto="Consulte disponibilidade e faça uma nova reserva." rota="/reservas" />
          </div>
        </div>
      </section>
    </main>
  );
}

function Resumo({ titulo, valor, icone }: { titulo: string; valor: number; icone: string }) {
  return <div className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm"><div className="text-2xl">{icone}</div><p className="mt-3 text-sm text-gray-500">{titulo}</p><p className="mt-1 text-3xl font-extrabold text-[#005a3c]">{valor}</p></div>;
}

function InfoCard({ icone, titulo, texto, rota }: { icone: React.ReactNode; titulo: string; texto: string; rota: string }) {
  return <button onClick={() => window.location.href = rota} className="flex items-center gap-4 rounded-2xl border border-[#dfe9e3] bg-white p-5 text-left shadow-sm hover:border-[#9fcdb9]"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8f3ee] text-[#005a3c]">{icone}</div><div className="min-w-0"><h3 className="font-extrabold text-[#173d2e]">{titulo}</h3><p className="mt-1 text-sm text-gray-500">{texto}</p></div><ArrowRight className="ml-auto h-5 w-5 shrink-0 text-[#005a3c]" /></button>;
}
