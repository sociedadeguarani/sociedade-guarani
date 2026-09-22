import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

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
  administrador_normal: ["socios.consultar", "socios.ver_financeiro", "socios.ver_exame_medico", "propria.mensalidade", "propria.reservas", "convites.comprar"],
  funcionario: ["socios.consultar", "socios.ver_financeiro", "socios.ver_exame_medico", "propria.mensalidade", "propria.reservas", "convites.comprar"],
  associado: ["propria.mensalidade", "propria.reservas", "convites.comprar"],
};

async function somenteMaster(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };

  const perfil = String(auth.usuario.perfil || "").trim().toLowerCase();
  const master = perfil === "administrador_master" || perfil === "master";
  if (!master) {
    return { response: NextResponse.json({ error: "Apenas o Administrador Master pode gerenciar usuários do sistema." }, { status: 403 }) };
  }
  return { usuario: auth.usuario };
}

async function carregarDados(db: ReturnType<typeof getServiceClient>) {
  const [p, u, s, a, perm] = await Promise.all([
    db.from("perfis").select("id,nome,ativo").eq("ativo", true).order("nome"),
    db.from("usuarios_sistema").select("id,nome_exibicao,socio_id,funcionario_id,perfil_id,ativo").order("nome_exibicao"),
    db.from("socios").select("id,matricula,nome,cpf,email").order("nome"),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("permissoes_usuario").select("usuario_id,chave,permitido"),
  ]);

  if (p.error) throw new Error(`Erro ao carregar perfis: ${p.error.message}`);
  if (u.error) throw new Error(`Erro ao carregar usuários: ${u.error.message}`);
  if (s.error) throw new Error(`Erro ao carregar sócios: ${s.error.message}`);
  if (a.error) throw new Error(`Erro ao carregar acessos: ${a.error.message}`);
  if (perm.error) throw new Error(`Execute primeiro o SQL de permissões: ${perm.error.message}`);

  const perfilMap = new Map((p.data || []).map((x) => [x.id, x]));
  const emailMap = new Map((a.data?.users || []).map((x) => [x.id, x.email || ""]));
  const permMap = new Map<string, string[]>();
  for (const x of perm.data || []) {
    if (!x.permitido) continue;
    permMap.set(x.usuario_id, [...(permMap.get(x.usuario_id) || []), x.chave]);
  }

  return {
    perfis: p.data || [],
    socios: s.data || [],
    usuarios: (u.data || []).map((x) => ({
      ...x,
      email: emailMap.get(x.id) || "",
      perfil: perfilMap.get(x.perfil_id) || null,
      permissoes: permMap.get(x.id) || DEFAULTS[perfilMap.get(x.perfil_id)?.nome || ""] || [],
    })),
  };
}

export async function GET(request: Request) {
  const auth = await somenteMaster(request);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await carregarDados(getServiceClient()));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar usuários." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await somenteMaster(request);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json();
    const { nome, email, senha, perfil_id, socio_id, ativo, permissoes } = body;
    if (!nome || !email || !senha || !perfil_id) return NextResponse.json({ error: "Nome, e-mail, senha e perfil são obrigatórios." }, { status: 400 });
    if (String(senha).length < 6) return NextResponse.json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });

    const db = getServiceClient();
    const { data: perfil, error: perfilError } = await db.from("perfis").select("id,nome,ativo").eq("id", perfil_id).eq("ativo", true).single();
    if (perfilError || !perfil) return NextResponse.json({ error: "Perfil não encontrado ou inativo." }, { status: 400 });
    if (perfil.nome === "associado" && !socio_id) return NextResponse.json({ error: "Usuário associado precisa estar vinculado a um sócio." }, { status: 400 });

    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(senha),
      email_confirm: true,
      user_metadata: { nome_exibicao: String(nome).trim(), perfil: perfil.nome },
    });
    if (authError || !authData.user) return NextResponse.json({ error: authError?.message || "Erro ao criar acesso." }, { status: 400 });

    const { error: usuarioError } = await db.from("usuarios_sistema").insert({
      id: authData.user.id,
      perfil_id,
      socio_id: socio_id || null,
      funcionario_id: null,
      ativo: ativo !== false,
      nome_exibicao: String(nome).trim(),
    });
    if (usuarioError) {
      await db.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: `Usuário Auth criado, mas o cadastro do sistema falhou: ${usuarioError.message}` }, { status: 500 });
    }

    const escolhidas = perfil.nome === "administrador" || perfil.nome === "administrador_master"
      ? TODAS_PERMISSOES
      : Array.isArray(permissoes)
        ? permissoes.filter((x: unknown) => typeof x === "string" && TODAS_PERMISSOES.includes(x))
        : (DEFAULTS[perfil.nome] || []);

    if (escolhidas.length) {
      const { error: permError } = await db.from("permissoes_usuario").insert(escolhidas.map((chave) => ({ usuario_id: authData.user.id, chave, permitido: true })));
      if (permError) {
        await db.from("usuarios_sistema").delete().eq("id", authData.user.id);
        await db.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json({ error: `Usuário criado, mas as permissões falharam: ${permError.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, id: authData.user.id, message: "Usuário criado com sucesso." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro interno do servidor." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await somenteMaster(request);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Informe o id do usuário." }, { status: 400 });
    const db = getServiceClient();
    if (typeof body.ativo === "boolean") {
      const { error } = await db.from("usuarios_sistema").update({ ativo: body.ativo }).eq("id", id);
      if (error) throw new Error(error.message);
    }
    if (Array.isArray(body.permissoes)) {
      const validas = body.permissoes.filter((x: unknown) => typeof x === "string" && TODAS_PERMISSOES.includes(x));
      const { error: delError } = await db.from("permissoes_usuario").delete().eq("usuario_id", id);
      if (delError) throw new Error(delError.message);
      if (validas.length) {
        const { error } = await db.from("permissoes_usuario").insert(validas.map((chave) => ({ usuario_id: id, chave, permitido: true })));
        if (error) throw new Error(error.message);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar usuário." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await somenteMaster(request);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Informe o id do usuário." }, { status: 400 });
    if (id === auth.usuario.id) return NextResponse.json({ error: "O administrador Master atualmente conectado não pode ser excluído por esta tela." }, { status: 400 });

    const db = getServiceClient();
    const { data: usuario, error: usuarioError } = await db.from("usuarios_sistema").select("id,nome_exibicao").eq("id", id).maybeSingle();
    if (usuarioError) throw new Error(usuarioError.message);
    if (!usuario) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

    const { error: sistemaError } = await db.from("usuarios_sistema").delete().eq("id", id);
    if (sistemaError) throw new Error(sistemaError.message);
    const { error: authError } = await db.auth.admin.deleteUser(id);
    if (authError) return NextResponse.json({ error: `Cadastro do sistema excluído, mas o acesso Auth não foi excluído: ${authError.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, message: "Usuário excluído definitivamente." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir usuário." }, { status: 500 });
  }
}
