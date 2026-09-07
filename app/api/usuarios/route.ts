import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) throw new Error("Configuração do Supabase incompleta.");
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

const TODAS_PERMISSOES = [
  "administracao.tudo",
  "socios.consultar",
  "socios.ver_financeiro",
  "socios.ver_exame_medico",
  "propria.mensalidade",
  "propria.reservas",
  "convites.comprar",
  "inventario.consultar",
  "inventario.emprestar",
  "inventario.devolver",
];

const DEFAULTS: Record<string, string[]> = {
  administrador: TODAS_PERMISSOES,
  funcionario: ["socios.consultar", "socios.ver_financeiro", "socios.ver_exame_medico", "propria.mensalidade", "propria.reservas", "convites.comprar"],
  associado: ["propria.mensalidade", "propria.reservas", "convites.comprar"],
};

async function carregarDados(supabase: ReturnType<typeof getAdminClient>) {
  const [{ data: perfis, error: perfisError }, { data: usuarios, error: usuariosError }, { data: socios, error: sociosError }, { data: authUsers, error: authError }, { data: permissoes, error: permissoesError }] = await Promise.all([
    supabase.from("perfis").select("id,nome,ativo").eq("ativo", true).order("nome"),
    supabase.from("usuarios_sistema").select("id,nome_exibicao,socio_id,funcionario_id,perfil_id,ativo").order("nome_exibicao"),
    supabase.from("socios").select("id,matricula,nome,cpf,email").order("nome"),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("permissoes_usuario").select("usuario_id,chave,permitido"),
  ]);

  if (perfisError) throw new Error(`Erro ao carregar perfis: ${perfisError.message}`);
  if (usuariosError) throw new Error(`Erro ao carregar usuários: ${usuariosError.message}`);
  if (sociosError) throw new Error(`Erro ao carregar sócios: ${sociosError.message}`);
  if (authError) throw new Error(`Erro ao carregar acessos: ${authError.message}`);
  if (permissoesError) throw new Error(`Execute primeiro o SQL de permissões: ${permissoesError.message}`);

  const perfilMap = new Map((perfis || []).map((p) => [p.id, p]));
  const emailMap = new Map((authUsers?.users || []).map((u) => [u.id, u.email || ""]));
  const permMap = new Map<string, string[]>();
  for (const p of permissoes || []) {
    if (!p.permitido) continue;
    const atual = permMap.get(p.usuario_id) || [];
    atual.push(p.chave);
    permMap.set(p.usuario_id, atual);
  }

  return {
    perfis: perfis || [],
    socios: socios || [],
    usuarios: (usuarios || []).map((u) => ({
      ...u,
      email: emailMap.get(u.id) || "",
      perfil: perfilMap.get(u.perfil_id) || null,
      permissoes: permMap.get(u.id) || DEFAULTS[perfilMap.get(u.perfil_id)?.nome || ""] || [],
    })),
  };
}

export async function GET() {
  try {
    return NextResponse.json(await carregarDados(getAdminClient()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar usuários." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nome, email, senha, perfil_id, socio_id, ativo, permissoes } = body;
    if (!nome || !email || !senha || !perfil_id) return NextResponse.json({ error: "Nome, e-mail, senha e perfil são obrigatórios." }, { status: 400 });

    const supabase = getAdminClient();
    const { data: perfil, error: perfilError } = await supabase.from("perfis").select("id,nome,ativo").eq("id", perfil_id).eq("ativo", true).single();
    if (perfilError || !perfil) return NextResponse.json({ error: "Perfil não encontrado ou inativo." }, { status: 400 });
    if (perfil.nome === "associado" && !socio_id) return NextResponse.json({ error: "Usuário associado precisa estar vinculado a um sócio." }, { status: 400 });

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: String(email).trim().toLowerCase(), password: String(senha), email_confirm: true,
      user_metadata: { nome_exibicao: String(nome).trim(), perfil: perfil.nome },
    });
    if (authError || !authData.user) return NextResponse.json({ error: authError?.message || "Erro ao criar acesso." }, { status: 400 });

    const { error: usuarioError } = await supabase.from("usuarios_sistema").insert({
      id: authData.user.id, perfil_id, socio_id: socio_id || null, funcionario_id: null, ativo: ativo !== false, nome_exibicao: String(nome).trim(),
    });
    if (usuarioError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: `Usuário Auth criado, mas o cadastro do sistema falhou: ${usuarioError.message}` }, { status: 500 });
    }

    const escolhidas = perfil.nome === "administrador" ? TODAS_PERMISSOES : Array.isArray(permissoes) ? permissoes.filter((x: unknown) => typeof x === "string" && TODAS_PERMISSOES.includes(x)) : (DEFAULTS[perfil.nome] || []);
    if (escolhidas.length) {
      const { error: permError } = await supabase.from("permissoes_usuario").insert(escolhidas.map((chave: string) => ({ usuario_id: authData.user.id, chave, permitido: true })));
      if (permError) {
        await supabase.from("usuarios_sistema").delete().eq("id", authData.user.id);
        await supabase.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json({ error: `Usuário criado, mas as permissões falharam: ${permError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, id: authData.user.id, message: "Usuário criado com sucesso." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno do servidor." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, ativo, permissoes } = body;
    if (!id) return NextResponse.json({ error: "Informe o id do usuário." }, { status: 400 });
    const supabase = getAdminClient();

    if (typeof ativo === "boolean") {
      const { error } = await supabase.from("usuarios_sistema").update({ ativo }).eq("id", id);
      if (error) throw new Error(error.message);
    }

    if (Array.isArray(permissoes)) {
      const validas = permissoes.filter((x: unknown) => typeof x === "string" && TODAS_PERMISSOES.includes(x));
      const { error: delError } = await supabase.from("permissoes_usuario").delete().eq("usuario_id", id);
      if (delError) throw new Error(delError.message);
      if (validas.length) {
        const { error: insError } = await supabase.from("permissoes_usuario").insert(validas.map((chave: string) => ({ usuario_id: id, chave, permitido: true })));
        if (insError) throw new Error(insError.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar usuário." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Informe o id do usuário." }, { status: 400 });
    const supabase = getAdminClient();
    const { data: usuario, error: usuarioError } = await supabase
      .from("usuarios_sistema")
      .select("id,nome_exibicao")
      .eq("id", id)
      .maybeSingle();
    if (usuarioError) throw new Error(usuarioError.message);
    if (!usuario) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    const { error: sistemaError } = await supabase.from("usuarios_sistema").delete().eq("id", id);
    if (sistemaError) throw new Error(sistemaError.message);
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) return NextResponse.json({ error: `Cadastro do sistema excluído, mas o acesso Auth não foi excluído: ${authError.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, message: "Usuário excluído definitivamente." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir usuário." }, { status: 500 });
  }
}
