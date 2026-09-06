"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Perfil = {
  id: string;
  nome: string;
  ativo: boolean;
};

type Socio = {
  id: string;
  matricula: string | null;
  nome: string;
  cpf: string | null;
  email: string | null;
};

type Usuario = {
  id: string;
  nome_exibicao: string | null;
  socio_id: string | null;
  funcionario_id: string | null;
  perfil_id: string;
  ativo: boolean;
  email?: string | null;
  perfil?: { nome: string } | null;
};

const verde = "#005A3C";
const verdeEscuro = "#003D2B";
const fundo = "#F8FAF9";

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState("todos");
  const [modal, setModal] = useState(false);

  const [form, setForm] = useState({
    nome: "",
    email: "",
    senha: "",
    perfil_id: "",
    socio_id: "",
    ativo: true,
  });

  async function carregar() {
    setCarregando(true);
    setErro("");

    const [u, p, s] = await Promise.all([
      supabase
        .from("usuarios_sistema")
        .select("id,nome_exibicao,socio_id,funcionario_id,perfil_id,ativo")
        .order("nome_exibicao", { ascending: true }),
      supabase
        .from("perfis")
        .select("id,nome,ativo")
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("socios")
        .select("id,matricula,nome,cpf,email")
        .order("nome"),
    ]);

    if (u.error) setErro(u.error.message);
    if (p.error) setErro(p.error.message);
    if (s.error) setErro(s.error.message);

    const perfilMap = new Map((p.data || []).map((x) => [x.id, x]));
    setUsuarios(
      (u.data || []).map((x) => ({
        ...x,
        perfil: perfilMap.get(x.perfil_id)
          ? { nome: perfilMap.get(x.perfil_id)!.nome }
          : null,
      }))
    );
    setPerfis(p.data || []);
    setSocios(s.data || []);

    if (!form.perfil_id && p.data?.length) {
      const admin = p.data.find((x) => x.nome === "administrador");
      setForm((f) => ({ ...f, perfil_id: admin?.id || p.data![0].id }));
    }

    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return usuarios.filter((u) => {
      const bateBusca =
        !termo ||
        (u.nome_exibicao || "").toLowerCase().includes(termo) ||
        (u.email || "").toLowerCase().includes(termo);

      const batePerfil =
        filtroPerfil === "todos" || u.perfil_id === filtroPerfil;

      return bateBusca && batePerfil;
    });
  }, [usuarios, busca, filtroPerfil]);

  function abrirNovo() {
    const admin = perfis.find((x) => x.nome === "administrador");
    setErro("");
    setMensagem("");
    setForm({
      nome: "",
      email: "",
      senha: "",
      perfil_id: admin?.id || perfis[0]?.id || "",
      socio_id: "",
      ativo: true,
    });
    setModal(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setMensagem("");

    try {
      if (!form.nome.trim() || !form.email.trim() || !form.senha.trim()) {
        throw new Error("Preencha nome, e-mail e senha.");
      }

      if (form.senha.length < 6) {
        throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      }

      const perfil = perfis.find((x) => x.id === form.perfil_id);
      if (!perfil) throw new Error("Selecione um perfil.");

      if (perfil.nome === "associado" && !form.socio_id) {
        throw new Error("Para usuário associado, selecione o sócio.");
      }

      const response = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.trim(),
          email: form.email.trim().toLowerCase(),
          senha: form.senha,
          perfil_id: form.perfil_id,
          socio_id: form.socio_id || null,
          ativo: form.ativo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível criar o usuário.");
      }

      setMensagem("Usuário criado com sucesso.");
      setModal(false);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(usuario: Usuario) {
    setErro("");
    const { error } = await supabase
      .from("usuarios_sistema")
      .update({ ativo: !usuario.ativo })
      .eq("id", usuario.id);

    if (error) setErro(error.message);
    else await carregar();
  }

  const nomeSocio = (id: string | null) =>
    socios.find((s) => s.id === id)?.nome || "—";

  return (
    <main style={{ minHeight: "100vh", background: fundo, color: "#0F172A" }}>
      <header
        style={{
          height: 78,
          background: "#fff",
          borderBottom: "1px solid #E2E8F0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#64748B" }}>Administração</div>
          <h1 style={{ margin: "3px 0 0", color: verdeEscuro, fontSize: 25 }}>
            Usuários do sistema
          </h1>
        </div>
        <button
          onClick={() => window.location.replace("/painel")}
          style={btnSecundario}
        >
          ← Voltar ao painel
        </button>
      </header>

      <section style={{ maxWidth: 1250, margin: "0 auto", padding: 28 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: verdeEscuro }}>Acessos</h2>
            <p style={{ margin: "5px 0 0", color: "#64748B" }}>
              Cadastre administradores, funcionários e associados.
            </p>
          </div>
          <button onClick={abrirNovo} style={btnPrimario}>
            + Novo usuário
          </button>
        </div>

        {mensagem && <div style={sucesso}>{mensagem}</div>}
        {erro && <div style={falha}>{erro}</div>}

        <div style={card}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 240px",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="🔎 Buscar por nome ou e-mail..."
              style={input}
            />
            <select
              value={filtroPerfil}
              onChange={(e) => setFiltroPerfil(e.target.value)}
              style={input}
            >
              <option value="todos">Todos os perfis</option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          {carregando ? (
            <p style={{ color: "#64748B" }}>Carregando...</p>
          ) : usuariosFiltrados.length === 0 ? (
            <div style={{ padding: 35, textAlign: "center", color: "#64748B" }}>
              Nenhum usuário encontrado.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Nome", "Perfil", "Vínculo", "Status", "Ações"].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.map((u) => (
                    <tr key={u.id}>
                      <td style={td}>
                        <strong>{u.nome_exibicao || "Sem nome"}</strong>
                        {u.email && (
                          <div style={{ fontSize: 12, color: "#64748B" }}>
                            {u.email}
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <span style={badge}>{u.perfil?.nome || "sem perfil"}</span>
                      </td>
                      <td style={td}>
                        {u.socio_id ? nomeSocio(u.socio_id) : u.funcionario_id ? "Funcionário" : "—"}
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            ...badge,
                            background: u.ativo ? "#DCFCE7" : "#FEE2E2",
                            color: u.ativo ? "#166534" : "#991B1B",
                          }}
                        >
                          {u.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td style={td}>
                        <button
                          onClick={() => alternarAtivo(u)}
                          style={{
                            ...btnPequeno,
                            background: u.ativo ? "#FFF7ED" : "#E8F3EE",
                          }}
                        >
                          {u.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ ...card, marginTop: 18, background: "#F0FDF4" }}>
          <strong style={{ color: verdeEscuro }}>Perfis de acesso</strong>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div style={perfilCard}>👑 <b>Administrador</b><br /><small>Acesso completo ao sistema.</small></div>
            <div style={perfilCard}>👨‍💼 <b>Funcionário</b><br /><small>Acesso conforme permissões.</small></div>
            <div style={perfilCard}>👤 <b>Associado</b><br /><small>Acesso aos próprios dados.</small></div>
          </div>
        </div>
      </section>

      {modal && (
        <div style={overlay}>
          <form onSubmit={salvar} style={modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0, color: verdeEscuro }}>Novo usuário</h2>
                <p style={{ margin: "5px 0 0", color: "#64748B" }}>
                  Crie o acesso e defina o vínculo.
                </p>
              </div>
              <button type="button" onClick={() => setModal(false)} style={fechar}>×</button>
            </div>

            <label style={label}>Nome</label>
            <input
              required
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              style={input}
              placeholder="Nome completo"
            />

            <label style={label}>E-mail de acesso</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={input}
              placeholder="email@exemplo.com"
            />

            <label style={label}>Senha inicial</label>
            <input
              required
              type="password"
              minLength={6}
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              style={input}
              placeholder="Mínimo de 6 caracteres"
            />

            <label style={label}>Perfil</label>
            <select
              value={form.perfil_id}
              onChange={(e) => setForm({ ...form, perfil_id: e.target.value, socio_id: "" })}
              style={input}
            >
              <option value="">Selecione</option>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>

            {perfis.find((p) => p.id === form.perfil_id)?.nome === "associado" && (
              <>
                <label style={label}>Associado vinculado</label>
                <select
                  required
                  value={form.socio_id}
                  onChange={(e) => setForm({ ...form, socio_id: e.target.value })}
                  style={input}
                >
                  <option value="">Selecione o sócio</option>
                  {socios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.matricula ? `${s.matricula} · ` : ""}{s.nome}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
              Usuário ativo
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button type="button" onClick={() => setModal(false)} style={btnSecundario}>
                Cancelar
              </button>
              <button disabled={salvando} type="submit" style={btnPrimario}>
                {salvando ? "Criando..." : "Criar usuário"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E2E8F0",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 2px 8px rgba(15, 23, 42, .04)",
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  padding: "11px 12px",
  fontSize: 14,
  outline: "none",
  background: "#fff",
};

const label: React.CSSProperties = {
  display: "block",
  marginTop: 15,
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 10px",
  borderBottom: "1px solid #E2E8F0",
  fontSize: 12,
  color: "#64748B",
  textTransform: "uppercase",
};

const td: React.CSSProperties = {
  padding: "14px 10px",
  borderBottom: "1px solid #E2E8F0",
  fontSize: 14,
};

const badge: React.CSSProperties = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: 999,
  background: "#E8F3EE",
  color: verdeEscuro,
  fontSize: 12,
  fontWeight: 700,
};

const btnPrimario: React.CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: "11px 16px",
  background: verde,
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const btnSecundario: React.CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  padding: "10px 14px",
  background: "#fff",
  color: "#334155",
  fontWeight: 600,
  cursor: "pointer",
};

const btnPequeno: React.CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "7px 10px",
  cursor: "pointer",
  color: "#334155",
  fontWeight: 600,
};

const sucesso: React.CSSProperties = {
  background: "#DCFCE7",
  color: "#166534",
  border: "1px solid #BBF7D0",
  padding: 12,
  borderRadius: 10,
  marginBottom: 14,
};

const falha: React.CSSProperties = {
  background: "#FEF2F2",
  color: "#991B1B",
  border: "1px solid #FECACA",
  padding: 12,
  borderRadius: 10,
  marginBottom: 14,
};

const perfilCard: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #DCFCE7",
  borderRadius: 12,
  padding: 14,
  lineHeight: 1.6,
};

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.45)",
  display: "grid",
  placeItems: "center",
  padding: 20,
  zIndex: 20,
};

const modalBox: React.CSSProperties = {
  width: "min(520px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#fff",
  borderRadius: 18,
  padding: 24,
  boxShadow: "0 20px 60px rgba(15,23,42,.2)",
};

const fechar: React.CSSProperties = {
  border: 0,
  background: "#F1F5F9",
  borderRadius: 8,
  width: 34,
  height: 34,
  fontSize: 24,
  cursor: "pointer",
};

