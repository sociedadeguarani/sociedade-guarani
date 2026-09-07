"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  UserRoundCheck,
  Users,
} from "lucide-react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type TipoPessoa = "socio" | "nao_socio";
type Categoria = "esporte" | "lazer" | "eventos";

type Espaco = {
  id: string;
  nome: string;
  categoria: Categoria;
  cobranca: "hora" | "diaria";
  precoSocio: number;
  precoNaoSocio: number;
  permiteNaoSocio: boolean;
  capacidade?: string;
};

type Reserva = {
  id: string;
  espacoId: string;
  data: string;
  horario: string;
  nome: string;
  tipoPessoa: TipoPessoa;
  valor: number;
  status: "confirmada" | "pendente" | "cancelada";
  pagamento: "pix" | "dinheiro" | "transferencia" | "pendente";
};

const INICIAIS: Espaco[] = [
  { id: "fut", nome: "Quadra de Futebol", categoria: "esporte", cobranca: "hora", precoSocio: 100, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "volei", nome: "Quadra de Vôlei", categoria: "esporte", cobranca: "hora", precoSocio: 50, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "areia", nome: "Quadra de Areia", categoria: "esporte", cobranca: "hora", precoSocio: 30, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "q48", nome: "Quadra 48", categoria: "esporte", cobranca: "hora", precoSocio: 20, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "q1", nome: "Quiosque 1", categoria: "lazer", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "q2", nome: "Quiosque 2", categoria: "lazer", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "q3", nome: "Quiosque 3", categoria: "lazer", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "salao_p", nome: "Salão Pequeno de Vidro", categoria: "eventos", cobranca: "diaria", precoSocio: 300, precoNaoSocio: 600, permiteNaoSocio: true, capacidade: "50 pessoas" },
  { id: "salao_g", nome: "Salão Social Grande", categoria: "eventos", cobranca: "diaria", precoSocio: 900, precoNaoSocio: 1800, permiteNaoSocio: true, capacidade: "300 pessoas" },
  { id: "ctg", nome: "Salão CTG", categoria: "eventos", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 0, permiteNaoSocio: false, capacidade: "150 pessoas" },
];

const HORARIOS = [
  "08:00 - 09:00",
  "09:00 - 10:00",
  "10:00 - 11:00",
  "18:00 - 19:00",
  "19:00 - 20:00",
  "20:00 - 21:00",
  "21:00 - 22:00",
];

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (v: string) => (v ? v.split("-").reverse().join("/") : "—");

function normalizarEspacos(lista: Espaco[]): Espaco[] {
  return lista.map((e) => ({
    ...e,
    permiteNaoSocio: e.permiteNaoSocio ?? e.precoNaoSocio > 0,
  }));
}

export default function ReservasPage() {
  const [publico, setPublico] = useState(false);
  const [aba, setAba] = useState<"reservar" | "reservas" | "admin">("reservar");
  const [espacos, setEspacos] = useState<Espaco[]>(INICIAIS);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [espacoId, setEspacoId] = useState(INICIAIS[0].id);
  const [data, setData] = useState("");
  const [horario, setHorario] = useState(HORARIOS[0]);
  const [nome, setNome] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa>("socio");
  const [etapa, setEtapa] = useState<"selecao" | "confirmacao">("selecao");
  const [busca, setBusca] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const modoPublico = p.get("publico") === "1";
    setPublico(modoPublico);
    if (modoPublico) setTipoPessoa("nao_socio");

    try {
      const e = localStorage.getItem("guarani_espacos_reservas");
      const r = localStorage.getItem("guarani_reservas");
      if (e) setEspacos(normalizarEspacos(JSON.parse(e)));
      if (r) setReservas(JSON.parse(r));
    } catch {
      // Mantém os valores iniciais.
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("guarani_espacos_reservas", JSON.stringify(espacos));
  }, [espacos]);

  useEffect(() => {
    localStorage.setItem("guarani_reservas", JSON.stringify(reservas));
  }, [reservas]);

  const espacosDisponiveis = useMemo(
    () =>
      tipoPessoa === "nao_socio"
        ? espacos.filter((e) => e.permiteNaoSocio && e.precoNaoSocio > 0)
        : espacos,
    [espacos, tipoPessoa],
  );

  useEffect(() => {
    if (!espacosDisponiveis.some((e) => e.id === espacoId) && espacosDisponiveis[0]) {
      setEspacoId(espacosDisponiveis[0].id);
    }
  }, [espacosDisponiveis, espacoId]);

  const espaco = espacos.find((x) => x.id === espacoId);
  const bloqueadoNaoSocio = !!espaco && (espaco.precoNaoSocio <= 0 || !espaco.permiteNaoSocio);
  const valor = espaco ? (tipoPessoa === "socio" ? espaco.precoSocio : espaco.precoNaoSocio) : 0;

  const ocupados = useMemo(
    () =>
      reservas
        .filter(
          (r) =>
            r.status !== "cancelada" &&
            r.espacoId === espacoId &&
            r.data === data,
        )
        .map((r) => r.horario),
    [reservas, espacoId, data],
  );

  const filtradas = reservas.filter((r) =>
    `${r.nome} ${espacos.find((e) => e.id === r.espacoId)?.nome || ""}`
      .toLowerCase()
      .includes(busca.toLowerCase()),
  );

  function mudarTipo(tipo: TipoPessoa) {
    setTipoPessoa(tipo);
    setEtapa("selecao");
  }

  function continuar() {
    if (!espaco) return alert("Selecione um espaço disponível.");
    if (tipoPessoa === "nao_socio" && bloqueadoNaoSocio) {
      return alert("Este espaço não pode ser alugado por não sócios.");
    }
    if (!data) return alert("Selecione a data da reserva.");
    if (!nome.trim()) return alert("Informe o nome do responsável pela reserva.");
    if (ocupados.includes(horario)) return alert("Este horário já está reservado para este espaço.");
    setEtapa("confirmacao");
  }

  function confirmar() {
    if (!espaco) return;
    if (tipoPessoa === "nao_socio" && (espaco.precoNaoSocio <= 0 || !espaco.permiteNaoSocio)) {
      return alert("Este espaço não está liberado para não sócios.");
    }

    setReservas((v) => [
      {
        id: crypto.randomUUID(),
        espacoId,
        data,
        horario,
        nome: nome.trim(),
        tipoPessoa,
        valor,
        status: "confirmada",
        pagamento: "pendente",
      },
      ...v,
    ]);
    setEtapa("selecao");
    setAba("reservas");
    setNome("");
    setData("");
    alert("Reserva registrada com sucesso.");
  }

  function copiar() {
    navigator.clipboard.writeText(
      `Sociedade Guarani\nEspaço: ${espaco?.nome}\nData: ${dataBR(data)}\nHorário: ${horario}\nResponsável: ${nome}\nTipo: ${tipoPessoa === "socio" ? "Sócio" : "Não sócio"}\nValor: ${moeda(valor)}`,
    );
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  function cancelar(id: string) {
    if (confirm("Deseja realmente cancelar esta reserva?")) {
      setReservas((v) => v.map((r) => (r.id === id ? { ...r, status: "cancelada" } : r)));
    }
  }

  function alterarPreco(id: string, campo: "precoSocio" | "precoNaoSocio", v: number) {
    const novoValor = Math.max(0, v);
    setEspacos((a) =>
      a.map((e) => {
        if (e.id !== id) return e;
        return {
          ...e,
          [campo]: novoValor,
          ...(campo === "precoNaoSocio" && novoValor === 0
            ? { permiteNaoSocio: false }
            : {}),
        };
      }),
    );
  }

  function alternarNaoSocio(id: string) {
    setEspacos((a) =>
      a.map((e) => {
        if (e.id !== id) return e;
        if (e.precoNaoSocio <= 0) {
          return { ...e, permiteNaoSocio: false };
        }
        return { ...e, permiteNaoSocio: !e.permiteNaoSocio };
      }),
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      {!publico && <><CabecalhoPadrao /><MenuLateralPadrao /></>}

      <main className={`min-h-screen px-4 py-6 lg:px-7 lg:py-8 ${publico ? "" : "lg:ml-[220px]"}`}>
        <div className="mx-auto max-w-[1400px] space-y-6">
          {publico && (
            <div className="flex items-center justify-between rounded-2xl border bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <img src="/logo-guarani.png" className="h-12 w-12 object-contain" alt="Sociedade Guarani" />
                <div><b className="text-[#005a3c]">SOCIEDADE GUARANI</b><div className="text-xs text-gray-500">Reserva de espaços</div></div>
              </div>
              <button onClick={() => (window.location.href = "/login")} className="rounded-xl border px-4 py-2 text-sm font-bold">Voltar ao login</button>
            </div>
          )}

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-gray-500">{publico ? "Reserva online" : "Administração"}</p>
              <h1 className="text-3xl font-extrabold text-[#005a3c]">Reservas</h1>
              <p className="mt-1 text-sm text-gray-500">Agendamento de quadras, quiosques e salões.</p>
            </div>
            {!publico && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setAba("reservar")} className={`rounded-xl px-4 py-2.5 font-bold ${aba === "reservar" ? "bg-[#005a3c] text-white" : "bg-white shadow-sm"}`}>Nova reserva</button>
                <button onClick={() => setAba("reservas")} className={`rounded-xl px-4 py-2.5 font-bold ${aba === "reservas" ? "bg-[#005a3c] text-white" : "bg-white shadow-sm"}`}>Reservas</button>
                <button onClick={() => setAba("admin")} className={`rounded-xl px-4 py-2.5 font-bold ${aba === "admin" ? "bg-[#005a3c] text-white" : "bg-white shadow-sm"}`}><Settings className="mr-2 inline h-4 w-4" />Configurar espaços</button>
              </div>
            )}
          </div>

          {(publico || aba === "reservar") && (
            <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
              <div className="space-y-4">
                <section className="rounded-2xl border bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#005a3c]">1. Quem está fazendo a reserva?</h2>
                  <p className="mt-1 text-sm text-gray-500">O sistema aplica automaticamente a tarifa e as regras de acesso.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <button onClick={() => mudarTipo("socio")} className={`rounded-2xl border-2 p-5 text-left ${tipoPessoa === "socio" ? "border-[#005a3c] bg-[#e8f3ee]" : "border-[#dfe7e2]"}`}>
                      <UserRoundCheck className="h-8 w-8 text-[#005a3c]" />
                      <b className="mt-3 block text-lg">Sou sócio</b>
                      <span className="text-sm text-gray-500">Acesso aos espaços liberados para associados.</span>
                    </button>
                    <button onClick={() => mudarTipo("nao_socio")} className={`rounded-2xl border-2 p-5 text-left ${tipoPessoa === "nao_socio" ? "border-[#f4b400] bg-[#fff8df]" : "border-[#dfe7e2]"}`}>
                      <UserRound className="h-8 w-8 text-[#8a6700]" />
                      <b className="mt-3 block text-lg">Não sou sócio</b>
                      <span className="text-sm text-gray-500">Somente espaços liberados pela administração.</span>
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div><h2 className="text-xl font-extrabold text-[#005a3c]">2. Escolha o espaço</h2><p className="mt-1 text-sm text-gray-500">Espaços com não sócio bloqueado não aparecem nesta lista.</p></div>
                    <span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs font-bold text-[#005a3c]">{espacosDisponiveis.length} disponíveis</span>
                  </div>
                  {espacosDisponiveis.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-5 text-center text-sm font-semibold text-yellow-800">Nenhum espaço está liberado para não sócios no momento.</div>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {espacosDisponiveis.map((e) => (
                        <button key={e.id} onClick={() => setEspacoId(e.id)} className={`rounded-2xl border p-4 text-left ${e.id === espacoId ? "border-[#005a3c] bg-[#e8f3ee]" : "border-[#dfe7e2]"}`}>
                          <span className="text-[10px] font-extrabold uppercase text-[#005a3c]">{e.categoria}</span>
                          <h3 className="mt-2 font-extrabold">{e.nome}</h3>
                          <div className="mt-3 flex justify-between border-t pt-3 text-sm"><span>{e.cobranca === "hora" ? "Por hora" : "Por diária"}</span><b className="text-[#005a3c]">{moeda(tipoPessoa === "socio" ? e.precoSocio : e.precoNaoSocio)}</b></div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#005a3c]">3. Responsável</h2>
                  <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo do responsável" className="mt-4 w-full rounded-xl border px-3 py-3 outline-none focus:border-[#005a3c]" />
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-white p-5 shadow-sm lg:sticky lg:top-6">
                <h2 className="text-xl font-extrabold text-[#005a3c]">4. Data e horário</h2>
                {tipoPessoa === "nao_socio" && bloqueadoNaoSocio && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">🔒 Este espaço está bloqueado para não sócios.</div>}
                <label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Data</span><input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
                {espaco?.cobranca === "hora" && <label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Horário</span><select value={horario} onChange={(e) => setHorario(e.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-3">{HORARIOS.map((h) => <option key={h} value={h} disabled={ocupados.includes(h)}>{h}{ocupados.includes(h) ? " — ocupado" : ""}</option>)}</select></label>}
                <div className={`mt-4 rounded-xl p-4 ${tipoPessoa === "socio" ? "bg-[#e8f3ee]" : "bg-[#fff8df]"}`}>
                  <div className="text-xs text-gray-500">Tipo</div><b>{tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</b>
                  <div className="mt-3 flex justify-between text-sm"><span>Espaço</span><b>{espaco?.nome || "—"}</b></div>
                  <div className="flex justify-between text-sm"><span>Data</span><b>{dataBR(data)}</b></div>
                  <div className="flex justify-between text-sm"><span>Horário</span><b>{horario}</b></div>
                  <div className="mt-3 flex justify-between border-t pt-3 text-lg"><span>Total</span><b className="text-[#005a3c]">{moeda(valor)}</b></div>
                </div>
                <button disabled={!espaco || (tipoPessoa === "nao_socio" && bloqueadoNaoSocio)} onClick={continuar} className="mt-4 w-full rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">Continuar</button>
              </aside>
            </section>
          )}

          {!publico && aba === "reservas" && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex justify-between"><div><h2 className="text-xl font-extrabold text-[#005a3c]">Reservas cadastradas</h2><p className="text-sm text-gray-500">Histórico das reservas registradas neste navegador.</p></div><div className="flex items-center gap-2 rounded-xl border px-3"><Users className="h-4 w-4" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." className="w-48 py-2 outline-none" /></div></div>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#e8f3ee]"><tr><th className="p-3">Data</th><th className="p-3">Espaço</th><th className="p-3">Responsável</th><th className="p-3">Tipo</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Ação</th></tr></thead><tbody>{filtradas.map((r) => <tr key={r.id} className="border-b"><td className="p-3">{dataBR(r.data)}</td><td className="p-3">{espacos.find((e) => e.id === r.espacoId)?.nome}</td><td className="p-3">{r.nome}</td><td className="p-3">{r.tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</td><td className="p-3 font-bold">{moeda(r.valor)}</td><td className="p-3">{r.status}</td><td className="p-3">{r.status !== "cancelada" && <button onClick={() => cancelar(r.id)} className="rounded-lg bg-red-50 p-2 text-red-600"><Trash2 className="h-4 w-4" /></button>}</td></tr>)}</tbody></table>{!filtradas.length && <div className="py-10 text-center text-sm text-gray-500">Nenhuma reserva encontrada.</div>}</div>
            </section>
          )}

          {!publico && aba === "admin" && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div><h2 className="text-xl font-extrabold text-[#005a3c]">Configuração dos espaços</h2><p className="text-sm text-gray-500">Regra: <b>Não sócio = R$ 0,00</b> significa automaticamente bloqueado.</p></div>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-[#e8f3ee]"><tr><th className="p-3">Espaço</th><th className="p-3">Sócio</th><th className="p-3">Não sócio</th><th className="p-3">Permissão</th></tr></thead><tbody>
                {espacos.map((e) => { const liberado = e.permiteNaoSocio && e.precoNaoSocio > 0; return <tr key={e.id} className="border-b">
                  <td className="p-3 font-bold">{e.nome}</td>
                  <td className="p-3"><input type="number" min="0" value={e.precoSocio} onChange={(x) => alterarPreco(e.id, "precoSocio", Number(x.target.value))} className="w-28 rounded-lg border p-2" /></td>
                  <td className="p-3"><input type="number" min="0" value={e.precoNaoSocio} onChange={(x) => alterarPreco(e.id, "precoNaoSocio", Number(x.target.value))} className="w-28 rounded-lg border p-2" /></td>
                  <td className="p-3"><button onClick={() => alternarNaoSocio(e.id)} disabled={e.precoNaoSocio <= 0} className={`rounded-full px-4 py-2 text-xs font-extrabold ${liberado ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{liberado ? "🟢 Liberado" : "🔒 Bloqueado"}</button>{e.precoNaoSocio <= 0 && <div className="mt-1 text-xs font-semibold text-red-600">R$ 0 = não pode alugar</div>}</td>
                </tr>; })}
              </tbody></table></div>
              <div className="mt-4 rounded-xl bg-[#fff8df] p-4 text-sm font-semibold text-[#6b5600]">Para liberar um espaço para não sócio, coloque um valor maior que R$ 0,00. Depois clique em <b>Liberado</b>. Se voltar para R$ 0, o sistema bloqueia novamente.</div>
            </section>
          )}

          {(publico || aba === "reservar") && etapa === "confirmacao" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><button onClick={() => setEtapa("selecao")} className="mb-4 font-bold text-gray-500"><ArrowLeft className="mr-1 inline h-4 w-4" />Voltar</button><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f3ee] text-[#005a3c]"><ShieldCheck /></div><h2 className="text-2xl font-extrabold text-[#005a3c]">Confirmar reserva</h2><div className="mt-5 space-y-3 rounded-xl bg-[#f8faf9] p-4 text-sm"><div className="flex justify-between"><span>Tipo</span><b>{tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</b></div><div className="flex justify-between"><span>Espaço</span><b>{espaco?.nome}</b></div><div className="flex justify-between"><span>Data</span><b>{dataBR(data)}</b></div><div className="flex justify-between"><span>Horário</span><b>{horario}</b></div><div className="flex justify-between"><span>Responsável</span><b>{nome}</b></div><div className="flex justify-between"><span>Valor</span><b className="text-[#005a3c]">{moeda(valor)}</b></div></div><div className="mt-5 flex gap-2"><button onClick={copiar} className="flex-1 rounded-xl border px-4 py-3 font-bold">{copiado ? <><Check className="mr-1 inline h-4 w-4" />Copiado</> : <><Copy className="mr-1 inline h-4 w-4" />Copiar resumo</>}</button><button onClick={confirmar} className="flex-1 rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white">Confirmar</button></div></div></div>
          )}

          {!publico && <div className="rounded-2xl bg-[#003d2b] p-5 text-white"><b><Clock3 className="mr-2 inline h-4 w-4" />Controle de disponibilidade</b><div className="mt-1 text-sm text-white/75">R$ 0,00 para não sócio sempre significa bloqueado. A administração controla a liberação.</div></div>}
        </div>
      </main>
    </div>
  );
}
