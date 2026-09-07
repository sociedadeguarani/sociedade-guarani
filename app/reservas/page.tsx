"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  Copy,
  CreditCard,
  Settings,
  ShieldCheck,
  UserCheck,
  Building2,
  Users,
  Trash2,
  Pencil,
  Plus,
  ArrowLeft,
} from "lucide-react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

interface Espaco {
  id: string;
  nome: string;
  categoria: "esporte" | "lazer" | "eventos";
  cobranca: "hora" | "diaria";
  precoSocio: number;
  precoNaoSocio: number;
  capacidade?: string;
}

interface Reserva {
  id: string;
  espacoId: string;
  data: string;
  horario: string;
  nome: string;
  tipoPessoa: "socio" | "nao_socio";
  valor: number;
  status: "confirmada" | "pendente" | "cancelada";
  pagamento: "pix" | "dinheiro" | "transferencia" | "pendente";
}

const ESPACOS_INICIAIS: Espaco[] = [
  { id: "fut", nome: "Quadra de Futebol", categoria: "esporte", cobranca: "hora", precoSocio: 50, precoNaoSocio: 100 },
  { id: "volei", nome: "Quadra de Vôlei", categoria: "esporte", cobranca: "hora", precoSocio: 30, precoNaoSocio: 60 },
  { id: "areia", nome: "Quadra de Areia", categoria: "esporte", cobranca: "hora", precoSocio: 30, precoNaoSocio: 60 },
  { id: "q48", nome: "Quadra 48", categoria: "esporte", cobranca: "hora", precoSocio: 20, precoNaoSocio: 40 },
  { id: "q1", nome: "Quiosque 1", categoria: "lazer", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 160 },
  { id: "q2", nome: "Quiosque 2", categoria: "lazer", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 160 },
  { id: "q3", nome: "Quiosque 3", categoria: "lazer", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 160 },
  { id: "salao_p", nome: "Salão Pequeno de Vidro", categoria: "eventos", cobranca: "diaria", precoSocio: 300, precoNaoSocio: 600, capacidade: "50 pessoas" },
  { id: "salao_g", nome: "Salão Social Grande", categoria: "eventos", cobranca: "diaria", precoSocio: 800, precoNaoSocio: 1500, capacidade: "300 pessoas" },
  { id: "ctg", nome: "Salão CTG", categoria: "eventos", cobranca: "diaria", precoSocio: 500, precoNaoSocio: 1000, capacidade: "150 pessoas" },
];

const HORARIOS = ["08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "18:00 - 19:00", "19:00 - 20:00", "20:00 - 21:00", "21:00 - 22:00"];

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBR(data: string) {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default function ReservasPage() {
  const [aba, setAba] = useState<"reservar" | "reservas" | "admin">("reservar");
  const [espacos, setEspacos] = useState<Espaco[]>(ESPACOS_INICIAIS);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [espacoId, setEspacoId] = useState(ESPACOS_INICIAIS[0].id);
  const [data, setData] = useState("");
  const [horario, setHorario] = useState(HORARIOS[0]);
  const [nome, setNome] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState<"socio" | "nao_socio">("socio");
  const [etapa, setEtapa] = useState<"selecao" | "confirmacao">("selecao");
  const [copiado, setCopiado] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    try {
      const espacosSalvos = localStorage.getItem("guarani_espacos_reservas");
      const reservasSalvas = localStorage.getItem("guarani_reservas");
      if (espacosSalvos) setEspacos(JSON.parse(espacosSalvos));
      if (reservasSalvas) setReservas(JSON.parse(reservasSalvas));
    } catch {
      // Se houver dados inválidos no navegador, mantém os valores iniciais.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("guarani_espacos_reservas", JSON.stringify(espacos));
  }, [espacos]);

  useEffect(() => {
    localStorage.setItem("guarani_reservas", JSON.stringify(reservas));
  }, [reservas]);

  const espacoSelecionado = espacos.find((item) => item.id === espacoId) ?? espacos[0];
  const valor = espacoSelecionado
    ? tipoPessoa === "socio"
      ? espacoSelecionado.precoSocio
      : espacoSelecionado.precoNaoSocio
    : 0;

  const ocupados = useMemo(
    () =>
      reservas
        .filter(
          (reserva) =>
            reserva.status !== "cancelada" &&
            reserva.espacoId === espacoId &&
            reserva.data === data,
        )
        .map((reserva) => reserva.horario),
    [reservas, espacoId, data],
  );

  const reservasFiltradas = reservas.filter((reserva) => {
    const espaco = espacos.find((item) => item.id === reserva.espacoId);
    const texto = `${reserva.nome} ${espaco?.nome ?? ""}`.toLowerCase();
    return texto.includes(busca.toLowerCase());
  });

  function iniciarReserva() {
    if (!data) {
      alert("Selecione a data da reserva.");
      return;
    }
    if (!nome.trim()) {
      alert("Informe o nome do responsável pela reserva.");
      return;
    }
    if (ocupados.includes(horario)) {
      alert("Este horário já está reservado para este espaço.");
      return;
    }
    setEtapa("confirmacao");
  }

  function confirmarReserva() {
    if (!espacoSelecionado) return;
    const nova: Reserva = {
      id: crypto.randomUUID(),
      espacoId,
      data,
      horario,
      nome: nome.trim(),
      tipoPessoa,
      valor,
      status: "confirmada",
      pagamento: "pendente",
    };
    setReservas((atual) => [nova, ...atual]);
    setEtapa("selecao");
    setAba("reservas");
    setNome("");
    setData("");
    setHorario(HORARIOS[0]);
    alert("Reserva registrada com sucesso. O pagamento poderá ser lançado no Financeiro após a confirmação.");
  }

  function cancelarReserva(id: string) {
    if (!confirm("Deseja realmente cancelar esta reserva?")) return;
    setReservas((atual) =>
      atual.map((reserva) => (reserva.id === id ? { ...reserva, status: "cancelada" } : reserva)),
    );
  }

  function copiarResumo() {
    if (!espacoSelecionado) return;
    const texto = `Sociedade Guarani\nReserva: ${espacoSelecionado.nome}\nData: ${dataBR(data)}\nHorário: ${horario}\nResponsável: ${nome}\nValor: ${moeda(valor)}`;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  function alterarPreco(id: string, campo: "precoSocio" | "precoNaoSocio", valorNovo: number) {
    setEspacos((atual) =>
      atual.map((item) => (item.id === id ? { ...item, [campo]: Math.max(0, valorNovo) } : item)),
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />

      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-[1400px] space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-gray-500">Administração</p>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#005a3c]">Reservas</h1>
              <p className="mt-1 text-sm text-gray-500">Agendamento de quadras, quiosques e salões da Sociedade Guarani.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setAba("reservar")} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${aba === "reservar" ? "bg-[#005a3c] text-white" : "bg-white text-[#275044] shadow-sm"}`}>
                <CalendarDays className="mr-2 inline h-4 w-4" /> Nova reserva
              </button>
              <button onClick={() => setAba("reservas")} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${aba === "reservas" ? "bg-[#005a3c] text-white" : "bg-white text-[#275044] shadow-sm"}`}>
                Minhas reservas
              </button>
              <button onClick={() => setAba("admin")} className={`rounded-xl px-4 py-2.5 text-sm font-bold ${aba === "admin" ? "bg-[#005a3c] text-white" : "bg-white text-[#275044] shadow-sm"}`}>
                <Settings className="mr-2 inline h-4 w-4" /> Configurar espaços
              </button>
            </div>
          </div>

          {aba === "reservar" && (
            <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-extrabold text-[#005a3c]">1. Escolha o espaço</h2>
                      <p className="text-sm text-gray-500">Selecione o local que deseja reservar.</p>
                    </div>
                    <Building2 className="h-7 w-7 text-[#005a3c]" />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {espacos.map((item) => {
                      const selecionado = item.id === espacoId;
                      const preco = tipoPessoa === "socio" ? item.precoSocio : item.precoNaoSocio;
                      return (
                        <button key={item.id} type="button" onClick={() => setEspacoId(item.id)} className={`rounded-2xl border p-4 text-left transition ${selecionado ? "border-[#005a3c] bg-[#e8f3ee] ring-2 ring-[#005a3c]/20" : "border-[#dfe7e2] bg-white hover:border-[#8bb8a5]"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="rounded-full bg-[#e8f3ee] px-2 py-1 text-[10px] font-extrabold uppercase text-[#005a3c]">{item.categoria}</span>
                              <h3 className="mt-2 font-extrabold text-gray-800">{item.nome}</h3>
                            </div>
                            {selecionado && <Check className="h-5 w-5 text-[#005a3c]" />}
                          </div>
                          <div className="mt-4 flex items-end justify-between border-t pt-3">
                            <div className="text-xs text-gray-500">{item.cobranca === "hora" ? "Por hora" : "Por diária"}{item.capacidade ? ` · ${item.capacidade}` : ""}</div>
                            <div className="font-extrabold text-[#005a3c]">{moeda(preco)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#005a3c]">2. Responsável e público</h2>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-extrabold uppercase text-gray-500">Responsável</span>
                      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do responsável" className="w-full rounded-xl border border-gray-300 px-3 py-3 outline-none focus:border-[#005a3c]" />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-xs font-extrabold uppercase text-gray-500">Tipo</span>
                      <select value={tipoPessoa} onChange={(e) => setTipoPessoa(e.target.value as "socio" | "nao_socio")} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 outline-none focus:border-[#005a3c]">
                        <option value="socio">Sócio</option>
                        <option value="nao_socio">Não sócio / convidado</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <aside className="h-fit rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm lg:sticky lg:top-24">
                <h2 className="text-xl font-extrabold text-[#005a3c]">3. Data e horário</h2>
                <div className="mt-4 space-y-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-extrabold uppercase text-gray-500">Data</span>
                    <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-3 outline-none focus:border-[#005a3c]" />
                  </label>
                  {espacoSelecionado?.cobranca === "hora" && (
                    <label className="block">
                      <span className="mb-1 block text-xs font-extrabold uppercase text-gray-500">Horário</span>
                      <select value={horario} onChange={(e) => setHorario(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 outline-none focus:border-[#005a3c]">
                        {HORARIOS.map((item) => <option key={item} value={item} disabled={ocupados.includes(item)}>{item}{ocupados.includes(item) ? " — ocupado" : ""}</option>)}
                      </select>
                    </label>
                  )}

                  <div className="rounded-xl bg-[#e8f3ee] p-4">
                    <div className="text-xs text-gray-500">Espaço</div>
                    <div className="font-extrabold text-[#005a3c]">{espacoSelecionado?.nome}</div>
                    <div className="mt-3 flex justify-between text-sm"><span>Data</span><strong>{dataBR(data)}</strong></div>
                    <div className="flex justify-between text-sm"><span>Horário</span><strong>{horario}</strong></div>
                    <div className="mt-3 flex justify-between border-t border-[#cfe1d7] pt-3 text-lg"><span className="font-bold">Total</span><strong className="text-[#005a3c]">{moeda(valor)}</strong></div>
                  </div>

                  <button onClick={iniciarReserva} className="w-full rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white hover:bg-[#003d2b]">Continuar</button>
                </div>
              </aside>
            </section>
          )}

          {aba === "reservar" && etapa === "confirmacao" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <button onClick={() => setEtapa("selecao")} className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#005a3c]"><ArrowLeft className="h-4 w-4" /> Voltar</button>
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f3ee] text-[#005a3c]"><ShieldCheck /></div>
                <h2 className="text-2xl font-extrabold text-[#005a3c]">Confirmar reserva</h2>
                <p className="mt-1 text-sm text-gray-500">Confira os dados antes de registrar.</p>
                <div className="mt-5 space-y-3 rounded-xl bg-[#f8faf9] p-4 text-sm">
                  <div className="flex justify-between"><span>Espaço</span><strong>{espacoSelecionado?.nome}</strong></div>
                  <div className="flex justify-between"><span>Data</span><strong>{dataBR(data)}</strong></div>
                  <div className="flex justify-between"><span>Horário</span><strong>{horario}</strong></div>
                  <div className="flex justify-between"><span>Responsável</span><strong>{nome}</strong></div>
                  <div className="flex justify-between"><span>Valor</span><strong className="text-[#005a3c]">{moeda(valor)}</strong></div>
                </div>
                <div className="mt-5 flex gap-2">
                  <button onClick={copiarResumo} className="flex-1 rounded-xl border border-[#d5e0da] px-4 py-3 font-bold text-[#174133]">{copiado ? <><Check className="mr-2 inline h-4 w-4" /> Copiado</> : <><Copy className="mr-2 inline h-4 w-4" /> Copiar resumo</>}</button>
                  <button onClick={confirmarReserva} className="flex-1 rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white">Confirmar</button>
                </div>
              </div>
            </div>
          )}

          {aba === "reservas" && (
            <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div><h2 className="text-xl font-extrabold text-[#005a3c]">Reservas cadastradas</h2><p className="text-sm text-gray-500">Histórico das reservas registradas neste navegador.</p></div>
                <div className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2"><Users className="h-4 w-4 text-gray-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." className="w-52 outline-none text-sm" /></div>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-[#e8f3ee] text-xs font-extrabold uppercase text-[#275044]"><tr><th className="p-3">Data</th><th className="p-3">Espaço</th><th className="p-3">Horário</th><th className="p-3">Responsável</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Ações</th></tr></thead>
                  <tbody className="divide-y divide-[#e5ece8]">
                    {reservasFiltradas.map((reserva) => {
                      const espaco = espacos.find((item) => item.id === reserva.espacoId);
                      return <tr key={reserva.id}><td className="p-3 font-semibold">{dataBR(reserva.data)}</td><td className="p-3">{espaco?.nome ?? "—"}</td><td className="p-3">{reserva.horario}</td><td className="p-3">{reserva.nome}</td><td className="p-3 font-bold text-[#005a3c]">{moeda(reserva.valor)}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${reserva.status === "confirmada" ? "bg-green-100 text-green-700" : reserva.status === "cancelada" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{reserva.status}</span></td><td className="p-3">{reserva.status !== "cancelada" && <button onClick={() => cancelarReserva(reserva.id)} className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100" title="Cancelar"><Trash2 className="h-4 w-4" /></button>}</td></tr>;
                    })}
                  </tbody>
                </table>
                {reservasFiltradas.length === 0 && <div className="py-12 text-center text-sm text-gray-500">Nenhuma reserva encontrada.</div>}
              </div>
            </section>
          )}

          {aba === "admin" && (
            <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-extrabold text-[#005a3c]">Configuração dos espaços</h2><p className="text-sm text-gray-500">Defina os valores para sócios e não sócios. Esta etapa salva localmente; a próxima integração levará esses dados ao Supabase.</p></div><CreditCard className="h-7 w-7 text-[#005a3c]" /></div>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-[#e8f3ee] text-xs font-extrabold uppercase"><tr><th className="p-3">Espaço</th><th className="p-3">Categoria</th><th className="p-3">Cobrança</th><th className="p-3">Sócio</th><th className="p-3">Não sócio</th></tr></thead><tbody className="divide-y divide-[#e5ece8]">{espacos.map((item) => <tr key={item.id}><td className="p-3 font-bold">{item.nome}</td><td className="p-3 capitalize">{item.categoria}</td><td className="p-3">{item.cobranca === "hora" ? "Por hora" : "Diária"}</td><td className="p-3"><input type="number" min="0" value={item.precoSocio} onChange={(e) => alterarPreco(item.id, "precoSocio", Number(e.target.value))} className="w-28 rounded-lg border border-gray-300 px-2 py-2" /></td><td className="p-3"><input type="number" min="0" value={item.precoNaoSocio} onChange={(e) => alterarPreco(item.id, "precoNaoSocio", Number(e.target.value))} className="w-28 rounded-lg border border-gray-300 px-2 py-2" /></td></tr>)}</tbody></table></div>
            </section>
          )}

          <div className="rounded-2xl bg-[#003d2b] p-5 text-white shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div><div className="font-extrabold">Próxima integração: Supabase + Financeiro</div><div className="mt-1 text-sm text-white/75">As reservas confirmadas serão gravadas no banco e os valores recebidos poderão alimentar automaticamente as entradas de aluguel no Financeiro.</div></div>
              <div className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold"><Clock3 className="mr-2 inline h-4 w-4" /> Controle de disponibilidade</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

