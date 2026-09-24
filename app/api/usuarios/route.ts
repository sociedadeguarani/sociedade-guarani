import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient, normalizarPerfil } from "@/lib/guaraniAuth";

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
  "inventario.cadastrar",
  "inventario.editar",
];

const DEFAULTS: Record<string, string[]> = {
  administrador: TODAS_PERMISSOES,
  administrador_master: [],
  master: [],
  administrador_normal: ["socios.consultar", "socios.ver_financeiro", "socios.ver_exame_medico", "propria.mensalidade", "propria.reservas", "convites.comprar"],
  funcionario: ["socios.consultar", "socios.ver_financeiro", "socios.ver_exame_medico", "propria.mensalidade", "propria.reservas", "convites.comprar"],
  associado: ["propria.mensalidade", "propria.reservas", "convites.comprar"],
  funcionario_inventario: ["socios.consultar", "inventario.consultar", "inventario.cadastrar", "inventario.editar", "inventario.emprestar", "inventario.devolver"],
};

async function somenteMaster(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return {
      response: NextResponse.json(
        { error: "Sessão não encontrada." },
        { status: 401 }
      ),
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      response: NextResponse.json(
        { error: "Configuração do Supabase incompleta." },
        { status: 500 }
      ),
    };
  }

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } =
    await authClient.auth.getUser(token);

  if (userError || !userData.user) {
    return {
      response: NextResponse.json(
        { error: "Sessão inválida ou expirada." },
        { status: 401 }
      ),
    };
  }

  const db = getServiceClient();
  const { data: usuario, error: usuarioError } = await db
    .from("usuarios_sistema")
    .select("id,perfil_id,socio_id,ativo,nome_exibicao")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (usuarioError) {
    return {
      response: NextResponse.json(
        { error: usuarioError.message },
        { status: 500 }
      ),
    };
  }

  if (!usuario || !usuario.ativo) {
    return {
      response: NextResponse.json(
        { error: "Usuário sem acesso ao sistema." },
        { status: 403 }
      ),
    };
  }

  const { data: perfil, error: perfilError } = await db
    .from("perfis")
    .select("id,nome,codigo")
    .eq("id", usuario.perfil_id)
    .maybeSingle();

  if (perfilError) {
    return {
      response: NextResponse.json(
        { error: perfilError.message },
        { status: 500 }
      ),
    };
  }

  const perfilNormalizado = normalizarPerfil(perfil?.codigo, perfil?.nome);

  const master = perfilNormalizado === "administrador_master";

  if (!master) {
    return {
      response: NextResponse.json(
        { error: "Apenas o Administrador Master pode gerenciar usuários do sistema." },
        { status: 403 }
      ),
    };
  }

  return {
    usuario: {
      ...usuario,
      perfil: perfilNormalizado,
      email: userData.user.email || null,
    },
  };
}

async function carregarDados(db: ReturnType<typeof getServiceClient>) {
  const [p, u, s, a, perm] = await Promise.all([
    db.from("perfis").select("id,nome,codigo,ativo").order("nome"),
    db.from("usuarios_sistema").select("id,nome_exibicao,socio_id,funcionario_id,perfil_id,ativo").order("nome_exibicao"),
    db.from("socios").select("id,matricula,nome,cpf,email").order("nome"),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("permissoes_usuario").select("usuario_id,chave,permitido"),
  ]);

  if (p.error) throw new Error(`Erro ao carregar perfis: ${p.error.message}`);

  // Garante os perfis padrão sem apagar ou recriar os que já existem.
  // Isso também recupera instalações em que a tabela de perfis ficou sem
  // os registros usados pela tela de Usuários.
  const perfisAtuais = [...(p.data || [])] as any[];
  const perfisPadrao = [
    { codigo: "administrador_master", nome: "Administrador Master" },
    { codigo: "administrador_normal", nome: "Administrador" },
    { codigo: "funcionario", nome: "Funcionário" },
    { codigo: "funcionario_inventario", nome: "Funcionário — Inventário" },
    { codigo: "associado", nome: "Associado" },
  ];

  for (const padrao of perfisPadrao) {
    const existe = perfisAtuais.some((x: any) =>
      String(x.codigo || "").trim().toLowerCase() === padrao.codigo ||
      String(x.nome || "").trim().toLowerCase() === padrao.nome.toLowerCase()
    );
    if (existe) continue;

    const { data: novoPerfil, error: novoPerfilError } = await db
      .from("perfis")
      .insert({ nome: padrao.nome, codigo: padrao.codigo, ativo: true })
      .select("id,nome,codigo,ativo")
      .single();

    if (!novoPerfilError && novoPerfil) perfisAtuais.push(novoPerfil);
  }
  if (u.error) throw new Error(`Erro ao carregar usuários: ${u.error.message}`);
  if (s.error) throw new Error(`Erro ao carregar sócios: ${s.error.message}`);
  if (a.error) throw new Error(`Erro ao carregar acessos: ${a.error.message}`);
  if (perm.error) throw new Error(`Execute primeiro o SQL de permissões: ${perm.error.message}`);

  const perfilMap = new Map(perfisAtuais.map((x) => [x.id, x]));
  const emailMap = new Map((a.data?.users || []).map((x) => [x.id, x.email || ""]));
  const permMap = new Map<string, string[]>();
  for (const x of perm.data || []) {
    if (!x.permitido) continue;
    permMap.set(x.usuario_id, [...(permMap.get(x.usuario_id) || []), x.chave]);
  }

  return {
    perfis: perfisAtuais,
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
    const { data: perfil, error: perfilError } = await db.from("perfis").select("id,nome,codigo,ativo").eq("id", perfil_id).eq("ativo", true).single();
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

    const perfilChave = normalizarPerfil(perfil.codigo, perfil.nome);
    const escolhidas = perfilChave === "administrador_master"
      ? []
      : perfilChave === "administrador_normal"
        ? TODAS_PERMISSOES
        : Array.isArray(permissoes)
        ? permissoes.filter((x: unknown) => typeof x === "string" && TODAS_PERMISSOES.includes(x))
        : (DEFAULTS[perfilChave] || []);

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
        const { error } = await db.from("permissoes_usuario").insert(validas.map((chave: string) => ({ usuario_id: id, chave, permitido: true })));
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
