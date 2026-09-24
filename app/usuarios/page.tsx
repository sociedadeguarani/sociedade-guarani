"use client";

import { useEffect, useMemo, useState } from "react";
import { Boxes, Crown, Search, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Perfil = { id: string; nome: string; codigo?: string | null; ativo: boolean };
type Socio = { id: string; matricula: string | null; nome: string; cpf: string | null; email: string | null };
type Usuario = { id: string; nome_exibicao: string | null; socio_id: string | null; funcionario_id: string | null; perfil_id: string; ativo: boolean; email?: string | null; perfil?: { id?: string; nome: string } | null };

const PERMISSOES = [
  ["socios.consultar", "Consultar sócios"],
  ["socios.ver_financeiro", "Ver informações financeiras"],
  ["socios.ver_exame_medico", "Ver exame médico"],
  ["propria.mensalidade", "Mensalidades próprias"],
  ["propria.reservas", "Reservas"],
  ["convites.comprar", "Convites"],
  ["inventario.consultar", "Consultar inventário"],
  ["inventario.cadastrar", "Cadastrar itens no inventário"],
  ["inventario.editar", "Editar itens do inventário"],
  ["inventario.emprestar", "Registrar empréstimos"],
  ["inventario.devolver", "Registrar devoluções"],
] as const;

const DEFAULT_PERMISSOES: Record<string, string[]> = {
  administrador: PERMISSOES.map(([chave]) => chave),
  administrador_master: [],
  administrador_normal: ["socios.consultar", "socios.ver_financeiro", "socios.ver_exame_medico", "propria.mensalidade", "propria.reservas", "convites.comprar"],
  funcionario_inventario: ["socios.consultar", "inventario.consultar", "inventario.cadastrar", "inventario.editar", "inventario.emprestar", "inventario.devolver"],
  funcionario: ["socios.consultar", "socios.ver_financeiro", "socios.ver_exame_medico", "propria.mensalidade", "propria.reservas", "convites.comprar"],
  associado: ["propria.mensalidade", "propria.reservas", "convites.comprar"],
};

const visual: Record<string, { label: string; desc: string; icon: typeof Crown }> = {
  administrador_master: { label: "Administrador Master", desc: "Pode criar e gerenciar usuários do sistema.", icon: Crown },
  master: { label: "Administrador Master", desc: "Pode criar e gerenciar usuários do sistema.", icon: Crown },
  administrador: { label: "Administrador", desc: "Acesso administrativo normal.", icon: ShieldCheck },
  administrador_normal: { label: "Administrador", desc: "Acesso administrativo normal.", icon: ShieldCheck },
  funcionario: { label: "Funcionário", desc: "Acesso conforme permissões.", icon: ShieldCheck },
  funcionario_inventario: { label: "Funcionário — Inventário", desc: "Cadastra itens, controla empréstimos e devoluções.", icon: Boxes },
  associado: { label: "Associado", desc: "Acesso aos próprios dados.", icon: UserRound },
};

function nomePerfil(nome: string) { return visual[nome]?.label || nome; }

function isMasterPerfil(perfil?: Perfil) {
  const codigo = String(perfil?.codigo || "").trim().toLowerCase();
  const nome = String(perfil?.nome || "").trim().toLowerCase();
  return codigo === "administrador_master" || codigo === "master" || nome === "administrador master" || nome === "master";
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("todos");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", senha: "", perfil_id: "", socio_id: "", ativo: true });
  const [permissoesSelecionadas, setPermissoesSelecionadas] = useState<string[]>([]);

  async function api(path = "/api/usuarios", init: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sessão expirada. Faça login novamente.");
    return fetch(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
  }

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const response = await api();
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível carregar os usuários.");
      setPerfis(data.perfis || []); setSocios(data.socios || []); setUsuarios(data.usuarios || []);
      if (!form.perfil_id && data.perfis?.length) {
        const inicial = data.perfis.find((p: Perfil) => ["administrador", "administrador_normal"].includes(p.nome));
        setForm((f) => ({ ...f, perfil_id: inicial?.id || data.perfis[0].id }));
      }
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); }
    finally { setCarregando(false); }
  }

  useEffect(() => { void carregar(); }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios.filter((u) => (!termo || (u.nome_exibicao || "").toLowerCase().includes(termo) || (u.email || "").toLowerCase().includes(termo)) && (filtroPerfil === "todos" || u.perfil_id === filtroPerfil));
  }, [usuarios, busca, filtroPerfil]);

  function abrirNovo() {
    const inicial = perfis.find((p) => ["administrador", "administrador_normal"].includes(p.nome));
    setErro(""); setMensagem("");
    const perfilInicial = inicial || perfis[0];
    setForm({ nome: "", email: "", senha: "", perfil_id: perfilInicial?.id || "", socio_id: "", ativo: true });
    setPermissoesSelecionadas(DEFAULT_PERMISSOES[perfilInicial?.codigo || perfilInicial?.nome || ""] || []);
    setModal(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro(""); setMensagem("");
    try {
      const perfil = perfis.find((p) => p.id === form.perfil_id);
      if (!form.nome.trim() || !form.email.trim() || !form.senha.trim()) throw new Error("Preencha nome, e-mail e senha.");
      if (form.senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      if (!perfil) throw new Error("Selecione um perfil.");
      if (perfil.nome === "associado" && !form.socio_id) throw new Error("Para usuário associado, selecione o sócio vinculado.");

      const response = await api("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, nome: form.nome.trim(), email: form.email.trim().toLowerCase(), socio_id: form.socio_id || null, permissoes: permissoesSelecionadas }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível criar o usuário.");
      setMensagem("Usuário criado com sucesso."); setModal(false); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSalvando(false); }
  }

  async function alternarAtivo(u: Usuario) {
    try {
      const response = await api("/api/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, ativo: !u.ativo }) });
      const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Não foi possível atualizar.");
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao atualizar."); }
  }

  async function excluir(u: Usuario) {
    if (!confirm(`Excluir definitivamente o usuário ${u.nome_exibicao || u.email || "selecionado"}?`)) return;
    try {
      const response = await api("/api/usuarios", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Não foi possível excluir.");
      setMensagem("Usuário excluído com sucesso."); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao excluir."); }
  }

  function socioNome(id: string | null) { return socios.find((s) => s.id === id)?.nome || "—"; }

  return <div className="min-h-screen bg-[#f8faf9] text-[#17382c]"><CabecalhoPadrao /><MenuLateralPadrao />
    <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8"><div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-sm text-gray-500">Administração Master</p><h1 className="text-3xl font-extrabold text-[#005a3c]">Usuários do sistema</h1><p className="mt-1 text-sm text-gray-500">Crie, ative ou desative acessos de administradores, funcionários e associados.</p></div><button onClick={abrirNovo} className="rounded-xl bg-[#005a3c] px-5 py-3 font-extrabold text-white">+ Novo usuário</button></div>
      {mensagem && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-700">{mensagem}</div>}{erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700">{erro}</div>}
      <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 md:flex-row"><div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-300 px-3"><Search className="h-4 w-4 text-gray-400"/><input value={busca} onChange={(e)=>setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail..." className="w-full py-3 outline-none"/></div><select value={filtroPerfil} onChange={(e)=>setFiltroPerfil(e.target.value)} className="rounded-xl border border-gray-300 bg-white px-4 py-3 md:w-64"><option value="todos">Todos os perfis</option>{perfis.map(p=><option key={p.id} value={p.id}>{nomePerfil(p.nome)}</option>)}</select></div>
      <div className="mt-5 overflow-x-auto">{carregando?<div className="py-12 text-center text-gray-500">Carregando...</div>:usuariosFiltrados.length===0?<div className="py-12 text-center text-gray-500">Nenhum usuário encontrado.</div>:<table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#e8f3ee] text-xs font-extrabold uppercase"><tr><th className="p-3">Nome</th><th className="p-3">Perfil</th><th className="p-3">Vínculo</th><th className="p-3">Status</th><th className="p-3">Ações</th></tr></thead><tbody className="divide-y">{usuariosFiltrados.map(u=>{const pv=visual[u.perfil?.nome||""];return <tr key={u.id}><td className="p-3"><b>{u.nome_exibicao||"Sem nome"}</b><div className="text-xs text-gray-500">{u.email||""}</div></td><td className="p-3">{nomePerfil(u.perfil?.nome||"sem perfil")}</td><td className="p-3">{u.socio_id?socioNome(u.socio_id):u.funcionario_id?"Funcionário":"—"}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${u.ativo?"bg-green-100 text-green-700":"bg-red-100 text-red-700"}`}>{u.ativo?"Ativo":"Inativo"}</span></td><td className="p-3"><div className="flex gap-2"><button onClick={()=>alternarAtivo(u)} className="rounded-lg border px-3 py-2 font-bold">{u.ativo?"Desativar":"Ativar"}</button><button onClick={()=>excluir(u)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-bold text-red-700">Excluir</button></div></td></tr>})}</tbody></table>}</div></section>
      <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><UsersRound className="text-[#005a3c]"/><h2 className="text-xl font-extrabold text-[#003d2b]">Perfis de acesso</h2></div><div className="mt-5 grid gap-4 md:grid-cols-3">{perfis.map(p=>{const pv=visual[p.nome];const Icon=pv?.icon||UserRound;return <div key={p.id} className="rounded-2xl border p-5 bg-[#f8faf9]"><Icon className="h-7 w-7 text-[#005a3c]"/><div className="mt-3 text-lg font-extrabold">{nomePerfil(p.nome)}</div><p className="mt-1 text-sm text-gray-600">{pv?.desc||"Perfil de acesso."}</p></div>})}</div></section>
    </div></main>
    {modal&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"><form onSubmit={salvar} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-2xl font-extrabold text-[#005a3c]">Novo usuário</h2><p className="text-sm text-gray-500">O cadastro será criado no Supabase Auth e em usuarios_sistema.</p></div><button type="button" onClick={()=>setModal(false)} className="rounded-lg bg-gray-100 p-2"><X/></button></div>
      <label className="mt-5 block text-sm font-bold">Nome<input required value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-3"/></label><label className="mt-4 block text-sm font-bold">E-mail<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-3"/></label><label className="mt-4 block text-sm font-bold">Senha inicial<input required minLength={6} type="password" value={form.senha} onChange={e=>setForm({...form,senha:e.target.value})} className="mt-1 w-full rounded-xl border px-3 py-3"/></label>
      <div className="mt-4"><span className="text-sm font-bold">Perfil de acesso</span><div className="mt-2 grid gap-2 sm:grid-cols-3">{perfis.map(p=>{const Icon=visual[p.nome]?.icon||UserRound;const ativo=form.perfil_id===p.id;return <button type="button" key={p.id} onClick={()=>{setForm({...form,perfil_id:p.id,socio_id:""});setPermissoesSelecionadas(DEFAULT_PERMISSOES[p.codigo || p.nome] || [])}} className={`rounded-xl border-2 p-3 text-left ${ativo?"border-[#005a3c] bg-[#e8f3ee]":"border-gray-200"}`}><Icon className="h-5 w-5 text-[#005a3c]"/><b className="mt-1 block text-sm">{nomePerfil(p.nome)}</b></button>})}</div></div>
      {perfis.find(p=>p.id===form.perfil_id)?.nome==="associado"&&<label className="mt-4 block text-sm font-bold">Sócio vinculado<select required value={form.socio_id} onChange={e=>setForm({...form,socio_id:e.target.value})} className="mt-1 w-full rounded-xl border bg-white px-3 py-3"><option value="">Selecione o sócio</option>{socios.map(s=><option key={s.id} value={s.id}>{s.matricula?`${s.matricula} · `:""}{s.nome}</option>)}</select></label>}
      <div className="mt-4 rounded-xl border bg-[#f8faf9] p-4"><div className="text-sm font-bold text-[#003d2b]">Permissões deste usuário</div>{isMasterPerfil(perfis.find(p=>p.id===form.perfil_id))&&<p className="mt-1 text-xs text-gray-500">O Administrador Master administra apenas usuários e perfis. Ele não recebe permissões dos módulos do sistema.</p>}<div className="mt-3 grid gap-2 sm:grid-cols-2">{PERMISSOES.map(([chave,label])=>{const checked=permissoesSelecionadas.includes(chave);const perfilAtual=perfis.find(p=>p.id===form.perfil_id);const bloqueado=isMasterPerfil(perfilAtual);return <label key={chave} className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm"><input type="checkbox" checked={checked} disabled={bloqueado} onChange={e=>setPermissoesSelecionadas(atual=>e.target.checked?[...atual,chave]:atual.filter(x=>x!==chave))}/>{label}</label>})}</div></div>
      <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.ativo} onChange={e=>setForm({...form,ativo:e.target.checked})}/>Usuário ativo</label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button><button disabled={salvando} type="submit" className="rounded-xl bg-[#005a3c] px-5 py-3 font-extrabold text-white disabled:opacity-50">{salvando?"Criando...":"Criar usuário"}</button></div>
    </form></div>}
  </div>;
}
