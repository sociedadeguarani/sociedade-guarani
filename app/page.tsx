"use client";

import { useState } from "react";

const menus = [
  { nome: "Início", icone: "🏠" },
  { nome: "Sócios", icone: "👥" },
  { nome: "Reservas", icone: "📅" },
  { nome: "Eventos", icone: "🎉" },
  { nome: "Financeiro", icone: "💰" },
  { nome: "Espaços", icone: "🏛️" },
];

export default function Home() {
  const [menu, setMenu] = useState("Início");

  return (
    <main className="min-h-screen bg-[#f4f6f3] text-[#123c2b]">
      {/* CABEÇALHO */}
      <header className="bg-[#063b28] text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white p-1 shadow-lg overflow-hidden">
  <img
    src="/logo-guarani.png"
    alt="Sociedade Guarani"
    className="h-full w-full object-contain"
            <div>
             <div>
  <h1 className="text-xl font-bold tracking-wide">
    SOCIEDADE GUARANI
  </h1>

  <p className="text-sm text-[#f5d76e]">
    Sociedade Recreativa Guarani — S.R.G.
  </p>
</div>
          </div>

          <div className="hidden text-right sm:block">
            <p className="text-sm text-gray-200">Sistema de Gestão</p>
            <p className="font-semibold text-[#f5d76e]">
              Área Administrativa
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">
        {/* MENU LATERAL */}
        <aside className="hidden min-h-[calc(100vh-96px)] w-64 border-r bg-white p-4 shadow-sm md:block">
          <p className="mb-4 px-3 text-xs font-bold uppercase tracking-wider text-gray-400">
            Menu principal
          </p>

          <nav className="space-y-2">
            {menus.map((item) => (
              <button
                key={item.nome}
                onClick={() => setMenu(item.nome)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition ${
                  menu === item.nome
                    ? "bg-[#063b28] text-white shadow"
                    : "text-gray-700 hover:bg-[#eef3ef]"
                }`}
              >
                <span className="text-xl">{item.icone}</span>
                {item.nome}
              </button>
            ))}
          </nav>

          <div className="mt-10 rounded-2xl bg-[#f7edbd] p-4">
            <p className="text-xs font-bold text-[#705c00]">
              SOCIEDADE GUARANI
            </p>
            <p className="mt-1 text-sm text-[#574900]">
              Sistema integrado de gestão
            </p>
          </div>
        </aside>

        {/* CONTEÚDO */}
        <section className="flex-1 p-5 sm:p-8">
          {/* MENU MOBILE */}
          <div className="mb-6 grid grid-cols-3 gap-2 md:hidden">
            {menus.map((item) => (
              <button
                key={item.nome}
                onClick={() => setMenu(item.nome)}
                className={`rounded-xl p-3 text-xs font-semibold ${
                  menu === item.nome
                    ? "bg-[#063b28] text-white"
                    : "bg-white text-gray-700 shadow-sm"
                }`}
              >
                <div className="mb-1 text-xl">{item.icone}</div>
                {item.nome}
              </button>
            ))}
          </div>

          {menu === "Início" && (
            <>
              <div className="mb-8">
                <p className="text-sm font-medium text-gray-500">
                  Bem-vindo ao sistema
                </p>

                <h2 className="mt-1 text-3xl font-bold text-[#063b28]">
                  Painel da Sociedade Guarani
                </h2>

                <p className="mt-2 text-gray-600">
                  Gerencie sócios, reservas, eventos, espaços e financeiro em
                  um único lugar.
                </p>
              </div>

              {/* CARDS */}
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                <DashboardCard
                  titulo="Sócios"
                  valor="0"
                  descricao="Sócios cadastrados"
                  icone="👥"
                />

                <DashboardCard
                  titulo="Reservas"
                  valor="0"
                  descricao="Reservas este mês"
                  icone="📅"
                />

                <DashboardCard
                  titulo="Eventos"
                  valor="0"
                  descricao="Eventos cadastrados"
                  icone="🎉"
                />

                <DashboardCard
                  titulo="Espaços"
                  valor="4"
                  descricao="Espaços disponíveis"
                  icone="🏛️"
                />
              </div>

              {/* ESPAÇOS */}
              <div className="mt-8">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-[#063b28]">
                      Espaços da Sociedade
                    </h3>
                    <p className="text-sm text-gray-500">
                      Consulte os espaços disponíveis para reserva.
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <SpaceCard
                    nome="Salão Social"
                    capacidade="350 pessoas"
                    descricao="Salão principal da Sociedade Guarani"
                  />

                  <SpaceCard
                    nome="Churrasqueira 1"
                    capacidade="30 pessoas"
                    descricao="Espaço com churrasqueira"
                  />

                  <SpaceCard
                    nome="Churrasqueira 2"
                    capacidade="30 pessoas"
                    descricao="Espaço com churrasqueira"
                  />

                  <SpaceCard
                    nome="Quadra"
                    capacidade="30 pessoas"
                    descricao="Quadra esportiva"
                  />
                </div>
              </div>

              {/* ATALHOS */}
              <div className="mt-8 rounded-2xl bg-[#063b28] p-6 text-white shadow-lg">
                <h3 className="text-xl font-bold">
                  Acesso rápido
                </h3>

                <p className="mt-1 text-sm text-gray-200">
                  Comece uma nova operação no sistema.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <QuickButton texto="Cadastrar sócio" icone="👤" />
                  <QuickButton texto="Nova reserva" icone="📅" />
                  <QuickButton texto="Criar evento" icone="🎉" />
                </div>
              </div>
            </>
          )}

          {menu !== "Início" && (
            <div className="flex min-h-[500px] items-center justify-center">
              <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
                <div className="text-5xl">
                  {menus.find((x) => x.nome === menu)?.icone}
                </div>

                <h2 className="mt-4 text-2xl font-bold text-[#063b28]">
                  {menu}
                </h2>

                <p className="mt-2 text-gray-500">
                  Este módulo será configurado na próxima etapa.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function DashboardCard({
  titulo,
  valor,
  descricao,
  icone,
}: {
  titulo: string;
  valor: string;
  descricao: string;
  icone: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <span className="text-3xl">{icone}</span>
        <span className="rounded-full bg-[#eef3ef] px-3 py-1 text-xs font-semibold text-[#063b28]">
          Ativo
        </span>
      </div>

      <p className="mt-5 text-sm font-medium text-gray-500">{titulo}</p>
      <p className="mt-1 text-3xl font-bold text-[#063b28]">{valor}</p>
      <p className="mt-1 text-xs text-gray-500">{descricao}</p>
    </div>
  );
}

function SpaceCard({
  nome,
  capacidade,
  descricao,
}: {
  nome: string;
  capacidade: string;
  descricao: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-lg font-bold text-[#063b28]">{nome}</h4>
          <p className="mt-1 text-sm text-gray-500">{descricao}</p>
        </div>

        <span className="text-2xl">🏛️</span>
      </div>

      <div className="mt-5 flex items-center justify-between border-t pt-4">
        <span className="text-sm text-gray-600">
          👥 {capacidade}
        </span>

        <button className="rounded-lg bg-[#063b28] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a5138]">
          Reservar
        </button>
      </div>
    </div>
  );
}

function QuickButton({
  texto,
  icone,
}: {
  texto: string;
  icone: string;
}) {
  return (
    <button className="rounded-xl bg-white/10 px-4 py-3 text-left transition hover:bg-white/20">
      <span className="mr-2">{icone}</span>
      <span className="text-sm font-semibold">{texto}</span>
    </button>
  );
}
