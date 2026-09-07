"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Crown, Search, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Perfil = { id: string; nome: string; ativo: boolean };
type Socio = { id: string; matricula: string | null; nome: string; cpf: string | null; email: string | null };
type Usuario = { id: string; nome_exibicao: string | null; socio_id: string | null; funcionario_id: string | null; perfil_id: string; ativo: boolean; email?: string | null; perfil?: { id?: string; nome: string } | null };

const perfilVisual: Record<string, { label: string; desc: string; icon: typeof Crown; bg: string; color: string }> = {
  administrador: { label: "Administrador", desc: "Acesso completo ao sistema.", icon: Crown, bg: "#E8F3EE", color: "#005A3C" },
  funcionario: { label: "Funcionário", desc: "Acesso conforme permissões.", icon: ShieldCheck, bg: "#E8F0FB", color: "#064B9B" },
  associado: { label: "Associado", desc: "Acesso aos próprios dados.", icon: UserRound, bg: "#FFF4CC", color: "#8A6700" },
};

function nomePerfil(nome: string) {
  return perfilVisual[nome]?.label || nome;
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

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const response = await fetch("/api/usuarios", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível carregar os perfis.");
      setPerfis(data.perfis || []);
      setSocios(data.socios || []);
      setUsuarios(data.usuarios || []);
      if (!form.perfil_id && data.perfis?.length) {
        const admin = data.perfis.find((p: Perfil) => p.nome === "administrador");
        setForm((f) => ({ ...f, perfil_id: admin?.id || data.perfis[0].id }));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return usuarios.filter((u) => {
      const perfil = u.perfil?.nome || "";
      return (!termo || (u.nome_exibicao || "").toLowerCase().includes(termo) || (u.email || "").toLowerCase().includes(termo)) &&
        (filtroPerfil === "todos" || u.perfil_id === filtroPerfil);
    });
  }, [usuarios, busca, filtroPerfil]);

  function abrirNovo() {
    const admin = perfis.find((p) => p.nome === "administrador");
    setErro(""); setMensagem("");
    setForm({ nome: "", email: "", senha: "", perfil_id: admin?.id || perfis[0]?.id || "", socio_id: "", ativo: true });
    setModal(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro(""); setMensagem("");
    try {
      const perfil = perfis.find((p) => p.id === form.perfil_id);
      if (!form.nome.trim() || !form.email.trim() || !form.senha.trim()) throw new Error("Preencha nome, e-mail e senha.");
      if (form.senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      if (!perfil) throw new Error("Selecione um perfil.");
      if (perfil.nome === "associado" && !form.socio_id) throw new Error("Para usuário associado, selecione o sócio vinculado.");

      const response = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, nome: form.nome.trim(), email: form.email.trim().toLowerCase(), socio_id: form.socio_id || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível criar o usuário.");
      setMensagem("Usuário criado com sucesso."); setModal(false); await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally { setSalvando(false); }
  }

  async function alternarAtivo(u: Usuario) {
    setErro("");
    const response = await fetch("/api/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, ativo: !u.ativo }) });
    const data = await response.json();
    if (!response.ok) setErro(data?.error || "Não foi possível atualizar."); else await carregar();
  }

  function socioNome(id: string | null) { return socios.find((s) => s.id === id)?.nome || "—"; }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-[1400px] space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><p className="text-sm text-gray-500">Administração</p><h1 className="text-3xl font-extrabold text-[#005a3c]">Usuários do sistema</h1><p className="mt-1 text-sm text-gray-500">Gerencie administradores, funcionários e associados.</p></div>
            <button onClick={abrirNovo} className="rounded-xl bg-[#005a3c] px-5 py-3 font-extrabold text-white hover:bg-[#003d2b]">+ Novo usuário</button>
          </div>

          {mensagem && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-700">{mensagem}</div>}
          {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700">{erro}</div>}

          <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-300 px-3"><Search className="h-4 w-4 text-gray-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail..." className="w-full py-3 outline-none" /></div>
              <select value={filtroPerfil} onChange={(e) => setFiltroPerfil(e.target.value)} className="rounded-xl border border-gray-300 bg-white px-4 py-3 md:w-64"><option value="todos">Todos os perfis</option>{perfis.map((p) => <option key={p.id} value={p.id}>{nomePerfil(p.nome)}</option>)}</select>
            </div>

            <div className="mt-5 overflow-x-auto">
              {carregando ? <div className="py-12 text-center text-gray-500">Carregando usuários e perfis...</div> : usuariosFiltrados.length === 0 ? <div className="py-12 text-center text-gray-500">Nenhum usuário encontrado.</div> : (
                <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#e8f3ee] text-xs font-extrabold uppercase text-[#275044]"><tr><th className="p-3">Nome</th><th className="p-3">Perfil</th><th className="p-3">Vínculo</th><th className="p-3">Status</th><th className="p-3">Ação</th></tr></thead><tbody className="divide-y divide-[#e5ece8]">
                  {usuariosFiltrados.map((u) => { const pv = perfilVisual[u.perfil?.nome || ""]; return <tr key={u.id}><td className="p-3"><b>{u.nome_exibicao || "Sem nome"}</b><div className="text-xs text-gray-500">{u.email || ""}</div></td><td className="p-3"><span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: pv?.bg || "#eef3ef", color: pv?.color || "#50625a" }}>{nomePerfil(u.perfil?.nome || "sem perfil")}</span></td><td className="p-3">{u.socio_id ? socioNome(u.socio_id) : u.funcionario_id ? "Funcionário" : "—"}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${u.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{u.ativo ? "Ativo" : "Inativo"}</span></td><td className="p-3"><button onClick={() => alternarAtivo(u)} className="rounded-lg border px-3 py-2 font-bold">{u.ativo ? "Desativar" : "Ativar"}</button></td></tr>; })}
                </tbody></table>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><UsersRound className="text-[#005a3c]" /><h2 className="text-xl font-extrabold text-[#003d2b]">Perfis de acesso</h2></div><p className="mt-1 text-sm text-gray-500">Os perfis cadastrados no Supabase aparecem abaixo e também no formulário de novo usuário.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">{perfis.map((p) => { const pv = perfilVisual[p.nome]; const Icon = pv?.icon || UserRound; return <div key={p.id} className="rounded-2xl border p-5" style={{ background: pv?.bg || "#f8faf9" }}><Icon className="h-7 w-7" style={{ color: pv?.color || "#005a3c" }} /><div className="mt-3 text-lg font-extrabold" style={{ color: pv?.color || "#003d2b" }}>{nomePerfil(p.nome)}</div><p className="mt-1 text-sm text-gray-600">{pv?.desc || "Perfil de acesso ao sistema."}</p><div className="mt-3 text-xs font-bold uppercase text-gray-500">{p.ativo ? "Perfil ativo" : "Perfil inativo"}</div></div>; })}</div>
            {perfis.length === 0 && !carregando && <div className="mt-4 rounded-xl bg-red-50 p-4 font-semibold text-red-700">Nenhum perfil ativo foi retornado pelo Supabase. Verifique a tabela <b>perfis</b>.</div>}
          </section>
        </div>
      </main>

      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={salvar} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-xl font-extrabold text-[#003d2b]">Novo usuário</h2><p className="text-sm text-gray-500">Escolha o perfil de acesso.</p></div><button type="button" onClick={() => setModal(false)} className="rounded-lg bg-gray-100 p-2"><X className="h-5 w-5" /></button></div>
        <label className="mt-5 block text-sm font-bold">Nome<input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
        <label className="mt-4 block text-sm font-bold">E-mail<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
        <label className="mt-4 block text-sm font-bold">Senha inicial<input required minLength={6} type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
        <div className="mt-4"><span className="text-sm font-bold">Perfil de acesso</span><div className="mt-2 grid gap-2 sm:grid-cols-3">{perfis.map((p) => { const pv = perfilVisual[p.nome]; const Icon = pv?.icon || UserRound; const ativo = form.perfil_id === p.id; return <button key={p.id} type="button" onClick={() => setForm({ ...form, perfil_id: p.id, socio_id: "" })} className={`rounded-xl border-2 p-3 text-left ${ativo ? "border-[#005a3c] ring-2 ring-[#005a3c]/10" : "border-gray-200"}`}><Icon className="h-5 w-5" style={{ color: pv?.color || "#005a3c" }} /><div className="mt-1 text-sm font-extrabold">{nomePerfil(p.nome)}</div>{ativo && <div className="mt-1 text-[10px] font-bold uppercase text-[#005a3c]">✓ Selecionado</div>}</button>; })}</div></div>
        {perfis.find((p) => p.id === form.perfil_id)?.nome === "associado" && <label className="mt-4 block text-sm font-bold">Sócio vinculado<select required value={form.socio_id} onChange={(e) => setForm({ ...form, socio_id: e.target.value })} className="mt-1 w-full rounded-xl border bg-white px-3 py-3"><option value="">Selecione o sócio</option>{socios.map((s) => <option key={s.id} value={s.id}>{s.matricula ? `${s.matricula} · ` : ""}{s.nome}</option>)}</select></label>}
        <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} /> Usuário ativo</label>
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button><button disabled={salvando} className="rounded-xl bg-[#005a3c] px-5 py-3 font-extrabold text-white disabled:opacity-60">{salvando ? "Criando..." : "Criar usuário"}</button></div>
      </form></div>}
    </div>
  );
}
