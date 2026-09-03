"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Socio = {
  id: string;
  matricula: string | null;
  nome: string;
  situacao: string | null;
};

type Dependente = {
  id: string;
  socio_id: string;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  parentesco: string | null;
  telefone: string | null;
  ativo: boolean | null;
  created_at: string | null;
};

const parentescos = [
  "Filho(a)", "Esposo(a)", "Companheiro(a)", "Pai", "Mãe",
  "Irmão(ã)", "Neto(a)", "Avô(ó)", "Outro",
];

function formatarData(data: string | null) {
  if (!data) return "—";
  const [ano, mes, dia] = data.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}

function formatarCpf(valor: string | null) {
  if (!valor) return "—";
  const n = valor.replace(/\D/g, "");
  return n.length === 11
    ? `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`
    : valor;
}

function formatarTelefone(valor: string | null) {
  if (!valor) return "—";
  const n = valor.replace(/\D/g, "");
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return valor;
}

export default function DependentesPage() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [busca, setBusca] = useState("");
  const [filtroSocio, setFiltroSocio] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Dependente | null>(null);

  const [form, setForm] = useState({
    socio_id: "",
    nome: "",
    cpf: "",
    data_nascimento: "",
    parentesco: "",
    telefone: "",
    ativo: true,
  });

  const socioPorId = useMemo(() => {
    const mapa: Record<string, Socio> = {};
    socios.forEach((socio) => { mapa[socio.id] = socio; });
    return mapa;
  }, [socios]);

  const dependentesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return dependentes.filter((d) => {
      const socio = socioPorId[d.socio_id];
      const texto = [d.nome, d.cpf || "", d.parentesco || "", d.telefone || "",
        socio?.nome || "", socio?.matricula || ""].join(" ").toLowerCase();
      const bateBusca = !termo || texto.includes(termo);
      const bateSocio = !filtroSocio || d.socio_id === filtroSocio;
      const bateStatus =
        filtroStatus === "todos" ||
        (filtroStatus === "ativos" && d.ativo === true) ||
        (filtroStatus === "inativos" && d.ativo !== true);
      return bateBusca && bateSocio && bateStatus;
    });
  }, [dependentes, socioPorId, busca, filtroSocio, filtroStatus]);

  const totalAtivos = dependentes.filter((d) => d.ativo === true).length;
  const totalInativos = dependentes.filter((d) => d.ativo !== true).length;

  async function carregarDados() {
    setCarregando(true);
    setErro("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = "/login";
      return;
    }

    const [sociosResult, dependentesResult] = await Promise.all([
      supabase.from("socios").select("id, matricula, nome, situacao").order("nome"),
      supabase.from("dependentes")
        .select("id, socio_id, nome, cpf, data_nascimento, parentesco, telefone, ativo, created_at")
        .order("nome"),
    ]);

    if (sociosResult.error) setErro(`Erro ao carregar sócios: ${sociosResult.error.message}`);
    if (dependentesResult.error) setErro(`Erro ao carregar dependentes: ${dependentesResult.error.message}`);

    setSocios(sociosResult.data || []);
    setDependentes(dependentesResult.data || []);
    setCarregando(false);
  }

  useEffect(() => { carregarDados(); }, []);

  function abrirNovo() {
    setEditando(null);
    setForm({
      socio_id: filtroSocio,
      nome: "",
      cpf: "",
      data_nascimento: "",
      parentesco: "",
      telefone: "",
      ativo: true,
      possui_mensalidade: false,
      valor_mensalidade: 0,
      dia_vencimento: 10,
      tipo_pagamento: "pix",
      situacao_financeira: "isento",
      data_ultimo_pagamento: "",
    });
    setErro("");
    setSucesso("");
    setModalAberto(true);
  }

  function abrirEdicao(d: Dependente) {
    setEditando(d);
    setForm({
      socio_id: d.socio_id,
      nome: d.nome || "",
      cpf: d.cpf || "",
      data_nascimento: d.data_nascimento || "",
      parentesco: d.parentesco || "",
      telefone: d.telefone || "",
      ativo: d.ativo !== false,
    });
    setErro("");
    setSucesso("");
    setModalAberto(true);
  }

  function fecharModal() {
    if (salvando) return;
    setModalAberto(false);
    setEditando(null);
    setErro("");
  }

  async function salvarDependente(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setSucesso("");

    if (!form.socio_id) return setErro("Selecione o sócio responsável.");
    if (!form.nome.trim()) return setErro("Informe o nome do dependente.");

    setSalvando(true);

    const dados = {
      socio_id: form.socio_id,
      nome: form.nome.trim(),
      cpf: form.cpf.trim() ? form.cpf.replace(/\D/g, "").slice(0, 11) : null,
      data_nascimento: form.data_nascimento || null,
      parentesco: form.parentesco || null,
      telefone: form.telefone.trim() || null,
      ativo: form.ativo,
    };

    const resultado = editando
      ? await supabase.from("dependentes").update(dados).eq("id", editando.id)
      : await supabase.from("dependentes").insert(dados);

    if (resultado.error) {
      setErro(`Não foi possível salvar: ${resultado.error.message}`);
      setSalvando(false);
      return;
    }

    setSucesso(editando ? "Dependente atualizado com sucesso." : "Dependente cadastrado com sucesso.");
    await carregarDados();
    setSalvando(false);

    setTimeout(() => {
      setModalAberto(false);
      setSucesso("");
    }, 700);
  }

  async function excluirDependente(d: Dependente) {
    if (!window.confirm(`Excluir o dependente "${d.nome}"?\n\nEssa ação não poderá ser desfeita.`)) return;
    setErro("");
    const { error } = await supabase.from("dependentes").delete().eq("id", d.id);
    if (error) {
      setErro(`Não foi possível excluir: ${error.message}`);
      return;
    }
    setSucesso("Dependente excluído com sucesso.");
    await carregarDados();
    setTimeout(() => setSucesso(""), 1800);
  }

  async function alternarStatus(d: Dependente) {
    setErro("");
    const { error } = await supabase.from("dependentes")
      .update({ ativo: d.ativo !== true }).eq("id", d.id);
    if (error) {
      setErro(`Não foi possível alterar a situação: ${error.message}`);
      return;
    }
    await carregarDados();
  }

  function sair() {
    supabase.auth.signOut().then(() => { window.location.href = "/login"; });
  }

  return (
    <main className="min-h-screen bg-[#F8FAF9] text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="flex min-h-[76px] items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#005A3C] text-xl">🏛️</div>
            <div>
              <div className="text-lg font-extrabold tracking-tight text-[#003D2B]">SOCIEDADE GUARANI</div>
              <div className="text-xs text-slate-500">Sociedade Recreativa Guarani — S.R.G.</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-xs text-slate-500">Área Administrativa</div>
              <div className="font-bold text-[#005A3C]">Gestão</div>
            </div>
            <button onClick={sair} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Sair</button>
          </div>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-76px)]">
        <aside className="hidden w-[220px] shrink-0 border-r border-slate-200 bg-white p-4 lg:block">
          <div className="mb-4 px-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Menu principal</div>
          <nav className="space-y-1">
            {[
              ["🏠", "Início", "/painel"],
              ["👥", "Sócios", "/socios"],
              ["👨‍👩‍👧", "Dependentes", "/dependentes"],
              ["🗓️", "Reservas", "/reservas"],
              ["🎉", "Eventos", "/eventos"],
              ["💰", "Financeiro", "/financeiro"],
              ["🏛️", "Espaços", "/espacos"],
              ["📊", "Relatórios", "/relatorios"],
            ].map(([icone, nome, href]) => (
              <Link key={nome} href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                  nome === "Dependentes"
                    ? "bg-[#005A3C] text-white shadow-sm"
                    : "text-slate-600 hover:bg-[#E8F3EE] hover:text-[#005A3C]"
                }`}>
                <span className="text-lg">{icone}</span>{nome}
              </Link>
            ))}
          </nav>
          <div className="mt-12 rounded-2xl bg-[#FFF1B8] p-4">
            <div className="text-xs font-black uppercase text-[#806400]">Sociedade Guarani</div>
            <div className="mt-1 text-xs text-[#806400]">Sistema integrado de gestão</div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-5 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Administração</div>
                <h1 className="text-3xl font-black tracking-tight text-[#005A3C]">Dependentes</h1>
                <p className="mt-1 text-slate-500">Cadastro e gerenciamento dos dependentes dos associados.</p>
              </div>
              <button onClick={abrirNovo} className="rounded-xl bg-[#005A3C] px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-[#003D2B]">+ Novo Dependente</button>
            </div>

            {erro && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}
            {sucesso && <div className="mb-5 rounded-xl border border-emerald-200 bg-[#E8F3EE] px-4 py-3 text-sm font-semibold text-[#005A3C]">{sucesso}</div>}

            <div className="mb-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Total de dependentes</div><div className="mt-1 text-3xl font-black text-[#005A3C]">{dependentes.length}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Dependentes ativos</div><div className="mt-1 text-3xl font-black text-[#005A3C]">{totalAtivos}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">Dependentes inativos</div><div className="mt-1 text-3xl font-black text-slate-600">{totalInativos}</div></div>
            </div>

            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[1fr_300px_180px]">
                <div className="flex items-center rounded-xl border border-slate-200 px-4">
                  <span className="mr-3 text-xl">🔎</span>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, CPF, parentesco ou sócio..." className="w-full bg-transparent py-3 text-sm outline-none" />
                </div>
                <select value={filtroSocio} onChange={(e) => setFiltroSocio(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#005A3C]">
                  <option value="">Todos os responsáveis</option>
                  {socios.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.matricula ? ` — ${s.matricula}` : ""}</option>)}
                </select>
                <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[#005A3C]">
                  <option value="todos">Todos</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option>
                </select>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {carregando ? (
                <div className="p-10 text-center text-sm text-slate-500">Carregando dependentes...</div>
              ) : dependentesFiltrados.length === 0 ? (
                <div className="p-12 text-center"><div className="text-4xl">👨‍👩‍👧</div><div className="mt-3 text-lg font-black text-[#003D2B]">Nenhum dependente encontrado</div><p className="mt-1 text-sm text-slate-500">Cadastre o primeiro dependente ou ajuste os filtros.</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left">
                    <thead className="bg-[#E8F3EE] text-[11px] uppercase tracking-wide text-[#315B4C]">
                      <tr>
                        <th className="px-5 py-4">Nome</th><th className="px-5 py-4">Parentesco</th><th className="px-5 py-4">Nascimento</th><th className="px-5 py-4">CPF</th><th className="px-5 py-4">Responsável</th><th className="px-5 py-4">Telefone</th><th className="px-5 py-4">Situação</th><th className="px-5 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dependentesFiltrados.map((d) => {
                        const socio = socioPorId[d.socio_id];
                        return (
                          <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-5 py-4"><div className="font-extrabold text-[#003D2B]">{d.nome}</div></td>
                            <td className="px-5 py-4 text-sm text-slate-600">{d.parentesco || "—"}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatarData(d.data_nascimento)}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatarCpf(d.cpf)}</td>
                            <td className="px-5 py-4"><div className="font-semibold text-slate-700">{socio?.nome || "Sócio não encontrado"}</div>{socio?.matricula && <div className="text-xs text-slate-400">Matrícula {socio.matricula}</div>}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatarTelefone(d.telefone)}</td>
                            <td className="px-5 py-4"><button onClick={() => alternarStatus(d)} className={`rounded-full px-3 py-1 text-xs font-black ${d.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{d.ativo ? "Ativo" : "Inativo"}</button></td>
                            <td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={() => abrirEdicao(d)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-[#E8F3EE] hover:text-[#005A3C]">✏️ Editar</button><button onClick={() => excluirDependente(d)} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-100">🗑️</button></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="mt-5 text-sm text-slate-400">Exibindo {dependentesFiltrados.length} de {dependentes.length} dependentes.</div>
          </div>
        </section>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <div><div className="text-xs font-semibold text-slate-500">Sociedade Recreativa Guarani</div><h2 className="text-2xl font-black text-[#005A3C]">{editando ? "Editar Dependente" : "Novo Dependente"}</h2></div>
              <button onClick={fecharModal} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-slate-200">×</button>
            </div>

            <form onSubmit={salvarDependente} className="overflow-y-auto p-6">
              {erro && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}
              {sucesso && <div className="mb-5 rounded-xl border border-emerald-200 bg-[#E8F3EE] px-4 py-3 text-sm font-semibold text-[#005A3C]">{sucesso}</div>}

              <div className="rounded-2xl border border-[#D9E9E2] bg-[#F8FAF9] p-5">
                <div className="mb-4 text-base font-black text-[#005A3C]">👤 Dados do dependente</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="md:col-span-2"><span className="mb-1 block text-sm font-bold text-slate-700">Sócio responsável *</span>
                    <select required value={form.socio_id} onChange={(e) => setForm({ ...form, socio_id: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]">
                      <option value="">Selecione o sócio responsável</option>
                      {socios.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.matricula ? ` — Matrícula ${s.matricula}` : ""}</option>)}
                    </select>
                  </label>
                  <label className="md:col-span-2"><span className="mb-1 block text-sm font-bold text-slate-700">Nome completo *</span><input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome completo do dependente" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" /></label>
                  <label><span className="mb-1 block text-sm font-bold text-slate-700">CPF</span><input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} inputMode="numeric" placeholder="Somente números" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" /></label>
                  <label><span className="mb-1 block text-sm font-bold text-slate-700">Data de nascimento</span><input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" /></label>
                  <label><span className="mb-1 block text-sm font-bold text-slate-700">Parentesco</span><select value={form.parentesco} onChange={(e) => setForm({ ...form, parentesco: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]"><option value="">Selecione</option>{parentescos.map((p) => <option key={p}>{p}</option>)}</select></label>
                  <label><span className="mb-1 block text-sm font-bold text-slate-700">Telefone / WhatsApp</span><input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="(55) 99999-9999" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" /></label>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[#D9E9E2] bg-white p-5">
                <div className="mb-4 text-base font-black text-[#005A3C]">🟢 Situação</div>
                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4">
                  <div><div className="font-bold text-slate-700">Dependente ativo</div><div className="text-sm text-slate-500">Dependentes inativos permanecem no histórico.</div></div>
                  <button type="button" onClick={() => setForm({ ...form, ativo: !form.ativo })} className={`relative h-7 w-12 rounded-full transition ${form.ativo ? "bg-[#005A3C]" : "bg-slate-300"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.ativo ? "left-6" : "left-1"}`} /></button>
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
                <button type="button" onClick={fecharModal} disabled={salvando} className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                <button type="submit" disabled={salvando} className="rounded-xl bg-[#005A3C] px-6 py-3 font-extrabold text-white hover:bg-[#003D2B] disabled:opacity-60">{salvando ? "Salvando..." : editando ? "💾 Salvar alterações" : "📋 Cadastrar dependente"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
