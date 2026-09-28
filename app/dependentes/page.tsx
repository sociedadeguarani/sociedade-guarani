"use client";

import { useEffect, useMemo, useState } from "react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import { supabase } from "@/lib/supabaseClient";

type Socio = {
  id: string;
  matricula: string | null;
  nome: string;
  situacao: string | null;
  responsavel_id?: string | null;
};

type Dependente = {
  id: string;
  socio_id: string;
  matricula?: string | null;
  foto_url?: string | null;
  nome: string;
  cpf: string | null;
  data_nascimento: string | null;
  parentesco: string | null;
  telefone: string | null;
  ativo: boolean | null;
  created_at: string | null;
  possui_mensalidade: boolean | null;
  valor_mensalidade: number | null;
  dia_vencimento: number | null;
  tipo_pagamento: string | null;
  situacao_financeira: string | null;
  data_ultimo_pagamento: string | null;
  source?: "socios" | "dependentes";
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
  const [statusResponsaveis, setStatusResponsaveis] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [filtroSocio, setFiltroSocio] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Dependente | null>(null);
  const [perfilUsuario, setPerfilUsuario] = useState("");
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);

  const somenteConsulta = perfilUsuario === "funcionario";

  type FormDependente = {
    socio_id: string;
    nome: string;
    cpf: string;
    data_nascimento: string;
    parentesco: string;
    telefone: string;
    ativo: boolean;
    possui_mensalidade: boolean;
    valor_mensalidade: number;
    dia_vencimento: number;
    tipo_pagamento: string;
    situacao_financeira: string;
    data_ultimo_pagamento: string;
  };

  const [form, setForm] = useState<FormDependente>({
    socio_id: "",
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

    try {
      // A página não consulta mais a tabela dependentes diretamente pelo cliente.
      // O endpoint usa o usuário autenticado + service role, evitando que uma
      // política RLS antiga esconda os 412 dependentes do Administrador Master.
      const resposta = await fetch("/api/carteirinhas?modo=dependentes", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });

      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        throw new Error(dados?.error || "Não foi possível carregar os dependentes.");
      }

      const sociosData = Array.isArray(dados?.socios) ? dados.socios : [];
      const dependentesData: Dependente[] = (Array.isArray(dados?.dependentes) ? dados.dependentes : [])
        .map((d: any) => ({
          id: String(d.id),
          socio_id: String(d.socio_id),
          matricula: d.matricula == null ? null : String(d.matricula),
          foto_url: d.foto_url ?? null,
          nome: d.nome ?? "",
          cpf: d.cpf ?? null,
          data_nascimento: d.data_nascimento ?? null,
          parentesco: d.parentesco ?? null,
          telefone: d.telefone ?? d.whatsapp ?? null,
          ativo: d.ativo !== false,
          created_at: d.created_at ?? null,
          possui_mensalidade: Boolean(d.possui_mensalidade),
          valor_mensalidade: Number(d.valor_mensalidade || 0),
          dia_vencimento: d.dia_vencimento == null ? null : Number(d.dia_vencimento),
          tipo_pagamento: d.tipo_pagamento ?? null,
          situacao_financeira: d.situacao_financeira ?? null,
          data_ultimo_pagamento: d.data_ultimo_pagamento ?? null,
          source: "dependentes",
        }));

      setSocios(sociosData.map((s: any) => ({
        id: String(s.id),
        matricula: s.matricula == null ? null : String(s.matricula),
        nome: s.nome ?? "",
        situacao: s.situacao ?? null,
      })));
      setDependentes(dependentesData);
      setStatusResponsaveis(dados?.statusResponsaveis || {});
    } catch (error) {
      console.error(error);
      setErro(error instanceof Error ? error.message : "Erro ao carregar dependentes.");
      setSocios([]);
      setDependentes([]);
      setStatusResponsaveis({});
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    try {
      const perfil = (window.localStorage.getItem("guarani_usuario_perfil") || "").trim().toLowerCase();
      setPerfilUsuario(
        perfil === "master" ? "administrador_master" :
        perfil === "admin" ? "administrador" :
        perfil
      );
    } catch {}
    carregarDados();
  }, []);

  function abrirNovo() {
    if (somenteConsulta) return;
    setEditando(null);
    setFotoArquivo(null);
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
    if (somenteConsulta) return;
    setEditando(d);
    setFotoArquivo(null);
    setForm({
      socio_id: d.socio_id,
      nome: d.nome || "",
      cpf: d.cpf || "",
      data_nascimento: d.data_nascimento || "",
      parentesco: d.parentesco || "",
      telefone: d.telefone || "",
      ativo: d.ativo !== false,
      possui_mensalidade: d.possui_mensalidade === true,
      valor_mensalidade: Number(d.valor_mensalidade || 0),
      dia_vencimento: Number(d.dia_vencimento || 10),
      tipo_pagamento: d.tipo_pagamento || "pix",
      situacao_financeira: d.situacao_financeira || (d.possui_mensalidade ? "em_dia" : "isento"),
      data_ultimo_pagamento: d.data_ultimo_pagamento || "",
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
    if (somenteConsulta) return;

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
      possui_mensalidade: form.possui_mensalidade,
      valor_mensalidade: form.possui_mensalidade ? Number(form.valor_mensalidade || 0) : 0,
      dia_vencimento: Number(form.dia_vencimento || 10),
      tipo_pagamento: form.possui_mensalidade ? form.tipo_pagamento : "pix",
      situacao_financeira: form.possui_mensalidade ? form.situacao_financeira : "isento",
      data_ultimo_pagamento: form.data_ultimo_pagamento || null,
    };

    const socioResponsavel = socios.find((s) => String(s.id) === String(form.socio_id));
    if (!socioResponsavel) {
      setErro("Selecione um sócio responsável válido.");
      setSalvando(false);
      return;
    }

    let resultado;
    if (editando) {
      resultado = await supabase.from("dependentes").update(dados).eq("id", editando.id);
    } else {
      resultado = await supabase.from("dependentes").insert(dados).select("id").single();
    }

    if (resultado.error) {
      setErro(`Não foi possível salvar: ${resultado.error.message}`);
      setSalvando(false);
      return;
    }

    const dependenteId = editando?.id || (Array.isArray(resultado.data) ? resultado.data[0]?.id : resultado.data?.id);
    if (fotoArquivo && dependenteId) {
      try {
        const extensao = fotoArquivo.name.split(".").pop()?.toLowerCase() || "jpg";
        const caminho = `dependentes/${dependenteId}.${extensao}`;
        const upload = await supabase.storage
          .from("fotos-associados")
          .upload(caminho, fotoArquivo, {
            upsert: true,
            contentType: fotoArquivo.type || "image/jpeg",
          });
        if (upload.error) throw upload.error;

        const { data: urlData } = supabase.storage.from("fotos-associados").getPublicUrl(caminho);
        const fotoUpdate = await supabase
          .from("dependentes")
          .update({ foto_url: urlData.publicUrl })
          .eq("id", dependenteId);
        if (fotoUpdate.error) throw fotoUpdate.error;
      } catch (fotoError) {
        setErro(`Dependente salvo, mas a foto não pôde ser enviada: ${fotoError instanceof Error ? fotoError.message : "erro no upload"}`);
      }
    }

    setSucesso(editando ? "Dependente atualizado com sucesso." : "Dependente cadastrado com sucesso.");
    setFotoArquivo(null);
    await carregarDados();
    setSalvando(false);

    setTimeout(() => {
      setModalAberto(false);
      setSucesso("");
    }, 700);
  }

  async function excluirDependente(d: Dependente) {
    if (somenteConsulta) return;
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
    if (somenteConsulta) return;
    setErro("");
    const { error } = await supabase.from("dependentes").update({ ativo: d.ativo !== true }).eq("id", d.id);
    if (error) {
      setErro(`Não foi possível alterar a situação: ${error.message}`);
      return;
    }
    await carregarDados();
  }

  return (
    <main className="min-h-screen bg-[#F8FAF9] text-slate-800">
      <CabecalhoPadrao />

      <div className="flex min-h-[calc(100vh-76px)] min-w-0">
        <MenuLateralPadrao />

        <section className="min-w-0 flex-1 p-3 sm:p-5 lg:ml-[220px] lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:mb-7 md:flex-row md:items-end">
              <div>
                <div className="mb-1 text-sm font-medium text-slate-500">Administração</div>
                <h1 className="text-2xl font-black tracking-tight text-[#005A3C] sm:text-3xl">Dependentes</h1>
                <p className="mt-1 text-slate-500">Cadastro e gerenciamento dos dependentes dos associados.</p>
              </div>
              <button onClick={abrirNovo} className="w-full rounded-xl bg-[#005A3C] px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-[#003D2B] sm:w-auto sm:px-5">+ Novo Dependente</button>
            </div>

            {erro && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{erro}</div>}
            {sucesso && <div className="mb-5 rounded-xl border border-emerald-200 bg-[#E8F3EE] px-4 py-3 text-sm font-semibold text-[#005A3C]">{sucesso}</div>}

            <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 sm:gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="text-sm text-slate-500">Total de dependentes</div><div className="mt-1 text-3xl font-black text-[#005A3C]">{dependentes.length}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="text-sm text-slate-500">Dependentes ativos</div><div className="mt-1 text-3xl font-black text-[#005A3C]">{totalAtivos}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="text-sm text-slate-500">Dependentes inativos</div><div className="mt-1 text-3xl font-black text-slate-600">{totalInativos}</div></div>
            </div>

            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[1fr_300px_180px]">
                <div className="flex items-center rounded-xl border border-slate-200 px-4">
                  <span className="mr-3 text-xl">🔎</span>
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, CPF, parentesco ou sócio..." className="w-full min-w-0 bg-transparent py-3 text-sm outline-none" />
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
                <div className="p-8 text-center text-sm text-slate-500 sm:p-10">Carregando dependentes...</div>
              ) : dependentesFiltrados.length === 0 ? (
                <div className="p-8 text-center sm:p-12"><div className="text-4xl">👨‍👩‍👧</div><div className="mt-3 text-lg font-black text-[#003D2B]">Nenhum dependente encontrado</div><p className="mt-1 text-sm text-slate-500">Cadastre o primeiro dependente ou ajuste os filtros.</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-[#E8F3EE] text-[11px] uppercase tracking-wide text-[#315B4C]">
                      <tr>
                        <th className="px-3 py-3 sm:px-5 sm:py-4">Matrícula</th><th className="px-3 py-3 sm:px-5 sm:py-4">Nome</th><th className="px-3 py-3 sm:px-5 sm:py-4">Parentesco</th><th className="px-3 py-3 sm:px-5 sm:py-4">Nascimento</th><th className="px-3 py-3 sm:px-5 sm:py-4">CPF</th><th className="px-3 py-3 sm:px-5 sm:py-4">Responsável</th><th className="px-3 py-3 sm:px-5 sm:py-4">Telefone</th><th className="px-3 py-3 sm:px-5 sm:py-4">Mensalidade</th><th className="px-3 py-3 sm:px-5 sm:py-4">Financeiro</th><th className="px-3 py-3 sm:px-5 sm:py-4">Situação</th><th className="px-5 py-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dependentesFiltrados.map((d) => {
                        const socio = socioPorId[d.socio_id];
                        const statusResponsavel = statusResponsaveis[d.socio_id] || "em_dia";
                        const statusLabel = statusResponsavel === "muito_atrasado" ? "5+ meses" : statusResponsavel === "atrasado" ? "3–4 meses" : "Até 2 meses";
                        const statusClasse = statusResponsavel === "muito_atrasado" ? "bg-red-100 text-red-700" : statusResponsavel === "atrasado" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
                        return (
                          <tr key={d.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-3 sm:px-5 sm:py-4"><span className="font-extrabold text-[#005A3C]">{d.matricula || "—"}</span></td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4">
                              <div className="flex items-center gap-3">
                                {d.foto_url ? (
                                  <img src={d.foto_url} alt={`Foto de ${d.nome}`} className="h-10 w-10 rounded-full border border-slate-200 object-cover" />
                                ) : (
                                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F3EE] text-sm font-black text-[#005A3C]">
                                    {d.nome.trim().split(/\s+/).slice(0, 2).map((n) => n[0]).join("").toUpperCase()}
                                  </div>
                                )}
                                <div className="font-extrabold text-[#003D2B]">{d.nome}</div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-slate-600">{d.parentesco || "—"}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatarData(d.data_nascimento)}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatarCpf(d.cpf)}</td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4"><div className="font-semibold text-slate-700">{socio?.nome || "Sócio não encontrado"}</div>{socio?.matricula && <div className="text-xs text-slate-400">Matrícula {socio.matricula}</div>}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatarTelefone(d.telefone)}</td>
                            <td className="px-5 py-4 text-sm font-bold text-slate-700">{d.possui_mensalidade ? `R$ ${Number(d.valor_mensalidade || 0).toFixed(2).replace(".", ",")}` : "Familiar"}</td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${statusClasse}`}>{statusResponsavel === "em_dia" ? "🟢 Até 2 meses" : statusResponsavel === "atrasado" ? "🟡 3–4 meses" : "🔴 5+ meses"}</span></td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4"><button onClick={() => alternarStatus(d)} className={`rounded-full px-3 py-1 text-xs font-black ${d.ativo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{d.ativo ? "Ativo" : "Inativo"}</button></td>
                            <td className="px-3 py-3 sm:px-5 sm:py-4">
                              {!somenteConsulta && (
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => abrirEdicao(d)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-[#E8F3EE] hover:text-[#005A3C]">✏️ Editar</button>
                                  <button onClick={() => excluirDependente(d)} className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-100">🗑️</button>
                                </div>
                              )}
                            </td>
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

      {modalAberto && !somenteConsulta && (
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
                  <div className="md:col-span-2 rounded-xl border border-dashed border-[#9fc8b5] bg-white p-4">
                    <div className="mb-3 text-sm font-bold text-[#005A3C]">📷 Foto do dependente</div>
                    <div className="flex flex-wrap items-center gap-4">
                      {(fotoArquivo || editando?.foto_url) && (
                        <div className="h-20 w-20 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                          <img
                            src={fotoArquivo ? URL.createObjectURL(fotoArquivo) : editando?.foto_url || ""}
                            alt="Prévia"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}
                      <div>
                        <label className="inline-flex cursor-pointer items-center rounded-xl border border-[#cfe3d8] bg-[#E8F3EE] px-4 py-2.5 text-sm font-extrabold text-[#005A3C] hover:bg-[#d9eee4]">
                          📷 {fotoArquivo ? "Trocar foto" : "Escolher foto"}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFotoArquivo(e.target.files?.[0] || null)} />
                        </label>
                        {fotoArquivo && <p className="mt-2 text-xs text-slate-500">{fotoArquivo.name}</p>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-[#D9E9E2] bg-[#F8FAF9] p-5">
                <div className="mb-4 text-base font-black text-[#005A3C]">💰 Financeiro do dependente</div>
                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div>
                    <div className="font-bold text-slate-700">Possui mensalidade própria?</div>
                    <div className="text-sm text-slate-500">A mensalidade do dependente será controlada separadamente do responsável.</div>
                  </div>
                  <button type="button" onClick={() => setForm({ ...form, possui_mensalidade: !form.possui_mensalidade, situacao_financeira: !form.possui_mensalidade ? "em_dia" : "isento" })} className={`relative h-7 w-12 rounded-full transition ${form.possui_mensalidade ? "bg-[#005A3C]" : "bg-slate-300"}`}>
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.possui_mensalidade ? "left-6" : "left-1"}`} />
                  </button>
                </label>

                {form.possui_mensalidade && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label>
                      <span className="mb-1 block text-sm font-bold text-slate-700">Valor da mensalidade</span>
                      <input type="number" min="0" step="0.01" value={form.valor_mensalidade} onChange={(e) => setForm({ ...form, valor_mensalidade: Number(e.target.value) })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" placeholder="0,00" />
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-bold text-slate-700">Dia do vencimento</span>
                      <input type="number" min="1" max="31" value={form.dia_vencimento} onChange={(e) => setForm({ ...form, dia_vencimento: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" />
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-bold text-slate-700">Forma de pagamento</span>
                      <select value={form.tipo_pagamento} onChange={(e) => setForm({ ...form, tipo_pagamento: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]">
                        <option value="pix">PIX</option>
                        <option value="debito_em_conta">Débito em conta</option>
                        <option value="boleto">Boleto</option>
                        <option value="dinheiro">Dinheiro</option>
                        <option value="transferencia">Transferência</option>
                        <option value="outro">Outro</option>
                      </select>
                    </label>
                    <label>
                      <span className="mb-1 block text-sm font-bold text-slate-700">Situação financeira</span>
                      <select value={form.situacao_financeira} onChange={(e) => setForm({ ...form, situacao_financeira: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]">
                        <option value="em_dia">🟢 Em dia</option>
                        <option value="em_atraso">🔴 Em atraso</option>
                        <option value="isento">⚪ Isento</option>
                      </select>
                    </label>
                    <label className="md:col-span-2">
                      <span className="mb-1 block text-sm font-bold text-slate-700">Data do último pagamento</span>
                      <input type="date" value={form.data_ultimo_pagamento} onChange={(e) => setForm({ ...form, data_ultimo_pagamento: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-[#005A3C]" />
                    </label>
                  </div>
                )}
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
