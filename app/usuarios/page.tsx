"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Crown, Search, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Perfil = { id: string; nome: string; ativo: boolean };
type Socio = { id: string; matricula: string | null; nome: string; cpf: string | null; email: string | null };
type Permissao = { chave: string; label: string; desc: string; grupo: string };
type Usuario = { id: string; nome_exibicao: string | null; socio_id: string | null; funcionario_id: string | null; perfil_id: string; ativo: boolean; email?: string | null; perfil?: { id?: string; nome: string } | null; permissoes?: string[] };

const PERMISSOES: Permissao[] = [
  { chave: "administracao.tudo", label: "Acesso administrativo completo", desc: "Todos os módulos, cadastros, financeiro, relatórios, usuários e configurações.", grupo: "Administração" },
  { chave: "socios.consultar", label: "Consultar associados", desc: "Pesquisar associado por nome ou matrícula.", grupo: "Associados" },
  { chave: "socios.ver_financeiro", label: "Ver situação financeira do associado", desc: "Ver somente se está em dia, em atraso ou isento.", grupo: "Associados" },
  { chave: "socios.ver_exame_medico", label: "Ver exame médico", desc: "Consultar se o exame médico está válido.", grupo: "Associados" },
  { chave: "propria.mensalidade", label: "Pagar a própria mensalidade", desc: "Consultar e quitar somente a própria mensalidade.", grupo: "Acesso próprio" },
  { chave: "propria.reservas", label: "Fazer reservas próprias", desc: "Reservar espaços disponíveis para o usuário.", grupo: "Acesso próprio" },
  { chave: "convites.comprar", label: "Comprar convites para não sócios", desc: "Comprar/emitir convite para convidados não sócios.", grupo: "Convites" },
  { chave: "inventario.consultar", label: "Consultar inventário", desc: "Ver itens e disponibilidade do inventário.", grupo: "Inventário" },
  { chave: "inventario.emprestar", label: "Registrar empréstimos", desc: "Entregar item e vincular o empréstimo a um associado.", grupo: "Inventário" },
  { chave: "inventario.devolver", label: "Registrar devoluções", desc: "Registrar a devolução e atualizar a disponibilidade.", grupo: "Inventário" },
];

const PERFIL_VISUAL: Record<string, { label: string; desc: string; icon: typeof Crown; bg: string; color: string }> = {
  administrador: { label: "Administrador", desc: "Acesso completo ao sistema.", icon: Crown, bg: "#E8F3EE", color: "#005A3C" },
  funcionario: { label: "Funcionário", desc: "Consulta controlada e acesso às próprias operações.", icon: ShieldCheck, bg: "#E8F0FB", color: "#064B9B" },
  associado: { label: "Associado", desc: "Acesso aos próprios dados e serviços liberados.", icon: UserRound, bg: "#FFF4CC", color: "#8A6700" },
};

const DEFAULTS: Record<string, string[]> = {
  administrador: PERMISSOES.map((p) => p.chave),
  funcionario: ["socios.consultar", "socios.ver_financeiro", "socios.ver_exame_medico", "propria.mensalidade", "propria.reservas", "convites.comprar"],
  associado: ["propria.mensalidade", "propria.reservas", "convites.comprar"],
};

function nomePerfil(nome: string) { return PERFIL_VISUAL[nome]?.label || nome; }
function defaultsParaPerfil(nome: string) { return DEFAULTS[nome] || []; }

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
  const [form, setForm] = useState({ nome: "", email: "", senha: "", perfil_id: "", socio_id: "", ativo: true, permissoes: [] as string[] });

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const response = await fetch("/api/usuarios", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível carregar os usuários.");
      setPerfis(data.perfis || []); setSocios(data.socios || []); setUsuarios(data.usuarios || []);
      if (!form.perfil_id && data.perfis?.length) {
        const admin = data.perfis.find((p: Perfil) => p.nome === "administrador");
        setForm((f) => ({ ...f, perfil_id: admin?.id || data.perfis[0].id, permissoes: defaultsParaPerfil(admin?.nome || data.perfis[0].nome) }));
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
    const admin = perfis.find((p) => p.nome === "administrador");
    setErro(""); setMensagem("");
    setForm({ nome: "", email: "", senha: "", perfil_id: admin?.id || perfis[0]?.id || "", socio_id: "", ativo: true, permissoes: defaultsParaPerfil(admin?.nome || perfis[0]?.nome || "") });
    setModal(true);
  }

  function mudarPerfil(perfilId: string) {
    const perfil = perfis.find((p) => p.id === perfilId);
    setForm((f) => ({ ...f, perfil_id: perfilId, socio_id: "", permissoes: defaultsParaPerfil(perfil?.nome || "") }));
  }

  function alternarPermissao(chave: string) {
    setForm((f) => ({ ...f, permissoes: f.permissoes.includes(chave) ? f.permissoes.filter((x) => x !== chave) : [...f.permissoes, chave] }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro(""); setMensagem("");
    try {
      const perfil = perfis.find((p) => p.id === form.perfil_id);
      if (!form.nome.trim()) throw new Error("Preencha o nome.");
      if (perfil && perfil.nome !== "associado" && (!form.email.trim() || !form.senha.trim())) throw new Error("Preencha e-mail e senha.");
      if (perfil && perfil.nome !== "associado" && form.senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      if (!perfil) throw new Error("Selecione um perfil.");
      if (perfil.nome === "associado" && !form.socio_id) throw new Error("Usuário associado precisa estar vinculado a um sócio.");

      const response = await fetch("/api/usuarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, nome: form.nome.trim(), email: form.email.trim().toLowerCase(), socio_id: form.socio_id || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível criar o usuário.");
      setMensagem("Usuário criado com sucesso."); setModal(false); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao salvar."); }
    finally { setSalvando(false); }
  }

  async function alternarAtivo(u: Usuario) {
    setErro("");
    const response = await fetch("/api/usuarios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: u.id, ativo: !u.ativo }) });
    const data = await response.json();
    if (!response.ok) setErro(data?.error || "Não foi possível atualizar."); else await carregar();
  }

  async function excluirUsuario(u: Usuario) {
    if (u.email?.toLowerCase() === "mateus.grauncke@gmail.com") {
      setErro("O administrador atualmente conectado não pode ser excluído por esta tela.");
      return;
    }
    if (!confirm(`Excluir definitivamente o usuário ${u.nome_exibicao || u.email || "selecionado"}? Esta ação remove o acesso do Supabase Auth.`)) return;
    setErro("");
    try {
      const response = await fetch("/api/usuarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Não foi possível excluir o usuário.");
      setMensagem("Usuário excluído com sucesso.");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir usuário.");
    }
  }

  function socioNome(id: string | null) { return socios.find((s) => s.id === id)?.nome || "—"; }
  const perfilAtual = perfis.find((p) => p.id === form.perfil_id)?.nome || "";
  const grupos = Array.from(new Set(PERMISSOES.map((p) => p.grupo)));

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao /><MenuLateralPadrao />
      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-[1400px] space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div><p className="text-sm text-gray-500">Administração</p><h1 className="text-3xl font-extrabold text-[#005a3c]">Usuários do sistema</h1><p className="mt-1 text-sm text-gray-500">Perfis e permissões individuais de acesso.</p></div>
            <button onClick={abrirNovo} className="rounded-xl bg-[#005a3c] px-5 py-3 font-extrabold text-white hover:bg-[#003d2b]">+ Novo usuário</button>
          </div>
          {mensagem && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-700">{mensagem}</div>}
          {erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700">{erro}</div>}

          <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row"><div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-300 px-3"><Search className="h-4 w-4 text-gray-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail..." className="w-full py-3 outline-none" /></div><select value={filtroPerfil} onChange={(e) => setFiltroPerfil(e.target.value)} className="rounded-xl border border-gray-300 bg-white px-4 py-3 md:w-64"><option value="todos">Todos os perfis</option>{perfis.map((p) => <option key={p.id} value={p.id}>{nomePerfil(p.nome)}</option>)}</select></div>
            <div className="mt-5 overflow-x-auto">{carregando ? <div className="py-12 text-center text-gray-500">Carregando...</div> : usuariosFiltrados.length === 0 ? <div className="py-12 text-center text-gray-500">Nenhum usuário encontrado.</div> : <table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#e8f3ee] text-xs font-extrabold uppercase"><tr><th className="p-3">Nome</th><th className="p-3">Perfil</th><th className="p-3">Vínculo</th><th className="p-3">Status</th><th className="p-3">Ação</th></tr></thead><tbody className="divide-y">{usuariosFiltrados.map((u) => { const pv = PERFIL_VISUAL[u.perfil?.nome || ""]; return <tr key={u.id}><td className="p-3"><b>{u.nome_exibicao || "Sem nome"}</b><div className="text-xs text-gray-500">{u.email || ""}</div></td><td className="p-3"><span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: pv?.bg || "#eef3ef", color: pv?.color || "#50625a" }}>{nomePerfil(u.perfil?.nome || "sem perfil")}</span></td><td className="p-3">{u.socio_id ? socioNome(u.socio_id) : u.funcionario_id ? "Funcionário" : "—"}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${u.ativo ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{u.ativo ? "Ativo" : "Inativo"}</span></td><td className="p-3"><div className="flex gap-2"><button onClick={() => alternarAtivo(u)} className="rounded-lg border px-3 py-2 font-bold">{u.ativo ? "Desativar" : "Ativar"}</button><button onClick={() => excluirUsuario(u)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-bold text-red-700">Excluir</button></div></td></tr>; })}</tbody></table>}</div>
          </section>

          <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><UsersRound className="text-[#005a3c]" /><h2 className="text-xl font-extrabold text-[#003d2b]">Perfis de acesso</h2></div><p className="mt-1 text-sm text-gray-500">Administrador, Funcionário e Associado possuem regras diferentes.</p><div className="mt-5 grid gap-4 md:grid-cols-3">{perfis.map((p) => { const pv = PERFIL_VISUAL[p.nome]; const Icon = pv?.icon || UserRound; return <div key={p.id} className="rounded-2xl border p-5" style={{ background: pv?.bg || "#f8faf9" }}><Icon className="h-7 w-7" style={{ color: pv?.color || "#005a3c" }} /><div className="mt-3 text-lg font-extrabold" style={{ color: pv?.color || "#003d2b" }}>{nomePerfil(p.nome)}</div><p className="mt-1 text-sm text-gray-600">{pv?.desc || "Perfil de acesso."}</p></div>; })}</div></section>
        </div>
      </main>

      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"><form onSubmit={salvar} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><h2 className="text-2xl font-extrabold text-[#005a3c]">Novo usuário</h2><p className="text-sm text-gray-500">Escolha o perfil e exatamente o que esta pessoa poderá acessar.</p></div><button type="button" onClick={() => setModal(false)} className="rounded-lg bg-gray-100 p-2"><X /></button></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="block"><span className="text-xs font-bold uppercase text-gray-500">Nome</span><input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-3" placeholder="Nome completo" /></label>{perfilAtual === "associado" ? <div className="md:col-span-2 rounded-xl bg-[#fff8df] p-4 text-sm font-semibold text-[#765d00]">Para associado, o sistema gera automaticamente o acesso: <b>matrícula</b> para entrar e <b>os 6 últimos números do CPF</b> como senha inicial. Não é necessário informar e-mail ou senha.</div> : <><label className="block"><span className="text-xs font-bold uppercase text-gray-500">E-mail</span><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-3" placeholder="email@exemplo.com" /></label><label className="block"><span className="text-xs font-bold uppercase text-gray-500">Senha inicial</span><input required minLength={6} type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="mt-1 w-full rounded-xl border px-3 py-3" placeholder="Mínimo 6 caracteres" /></label></>}<div><span className="text-xs font-bold uppercase text-gray-500">Perfil de acesso</span><div className="mt-1 grid grid-cols-3 gap-2">{perfis.map((p) => { const pv = PERFIL_VISUAL[p.nome]; const Icon = pv?.icon || UserRound; const selected = form.perfil_id === p.id; return <button type="button" key={p.id} onClick={() => mudarPerfil(p.id)} className={`rounded-xl border-2 p-3 text-left ${selected ? "border-[#005a3c] bg-[#e8f3ee]" : "border-gray-200"}`}><Icon className="h-5 w-5" style={{ color: pv?.color || "#005a3c" }} /><b className="mt-1 block text-sm">{nomePerfil(p.nome)}</b>{selected && <span className="text-[10px] font-bold text-[#005a3c]">✓ SELECIONADO</span>}</button>; })}</div></div></div>
        {perfilAtual === "associado" && <label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Associado vinculado</span><select required value={form.socio_id} onChange={(e) => setForm({ ...form, socio_id: e.target.value })} className="mt-1 w-full rounded-xl border bg-white px-3 py-3"><option value="">Selecione o sócio</option>{socios.map((s) => <option key={s.id} value={s.id}>{s.matricula ? `${s.matricula} · ` : ""}{s.nome}</option>)}</select></label>}

        <section className="mt-5 rounded-2xl border bg-[#f8faf9] p-4"><div className="flex items-center justify-between"><div><h3 className="font-extrabold text-[#003d2b]">Permissões deste usuário</h3><p className="text-xs text-gray-500">Você pode manter o padrão do perfil ou personalizar.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{form.permissoes.length} selecionadas</span></div>
          <div className="mt-4 space-y-4">{grupos.map((grupo) => <div key={grupo}><div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-gray-500">{grupo}</div><div className="grid gap-2 md:grid-cols-2">{PERMISSOES.filter((p) => p.grupo === grupo).map((p) => { const checked = form.permissoes.includes(p.chave); const admin = perfilAtual === "administrador"; return <label key={p.chave} className={`flex gap-3 rounded-xl border p-3 ${checked ? "border-[#9ac6b1] bg-white" : "border-gray-200 bg-white/60"}`}><input type="checkbox" checked={checked} disabled={admin} onChange={() => alternarPermissao(p.chave)} className="mt-1 h-4 w-4" /><span><b className="text-sm">{p.label}</b><small className="mt-1 block text-xs text-gray-500">{p.desc}</small></span></label>; })}</div></div>)}</div>
          {perfilAtual === "administrador" && <div className="mt-4 rounded-xl bg-[#e8f3ee] p-3 text-sm font-semibold text-[#005a3c]">Administrador recebe acesso completo automaticamente.</div>}
        </section>
        <label className="mt-4 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />Usuário ativo</label>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button><button disabled={salvando} type="submit" className="rounded-xl bg-[#005a3c] px-5 py-3 font-extrabold text-white disabled:opacity-50">{salvando ? "Criando..." : "Criar usuário"}</button></div>
      </form></div>}
    </div>
  );
}
