import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceKey || !url) throw new Error("Configuração do Supabase incompleta.");

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  try {
    const supabase = getAdminClient();

    const [{ data: perfis, error: perfisError }, { data: usuarios, error: usuariosError }, { data: socios, error: sociosError }, { data: authUsers, error: authError }] = await Promise.all([
      supabase.from("perfis").select("id,nome,ativo").eq("ativo", true).order("nome"),
      supabase.from("usuarios_sistema").select("id,nome_exibicao,socio_id,funcionario_id,perfil_id,ativo").order("nome_exibicao"),
      supabase.from("socios").select("id,matricula,nome,cpf,email").order("nome"),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    if (perfisError) throw new Error(`Erro ao carregar perfis: ${perfisError.message}`);
    if (usuariosError) throw new Error(`Erro ao carregar usuários: ${usuariosError.message}`);
    if (sociosError) throw new Error(`Erro ao carregar sócios: ${sociosError.message}`);
    if (authError) throw new Error(`Erro ao carregar acessos: ${authError.message}`);

    const perfilMap = new Map((perfis || []).map((p) => [p.id, p]));
    const emailMap = new Map((authUsers?.users || []).map((u) => [u.id, u.email || ""]));

    return NextResponse.json({
      perfis: perfis || [],
      socios: socios || [],
      usuarios: (usuarios || []).map((u) => ({
        ...u,
        email: emailMap.get(u.id) || "",
        perfil: perfilMap.get(u.perfil_id) || null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar usuários." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nome, email, senha, perfil_id, socio_id, ativo } = body;

    if (!nome || !email || !senha || !perfil_id) {
      return NextResponse.json(
        { error: "Nome, e-mail, senha e perfil são obrigatórios." },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    const { data: perfil, error: perfilError } = await supabase
      .from("perfis")
      .select("id,nome,ativo")
      .eq("id", perfil_id)
      .eq("ativo", true)
      .single();

    if (perfilError || !perfil) {
      return NextResponse.json({ error: "Perfil não encontrado ou inativo." }, { status: 400 });
    }

    if (perfil.nome === "associado" && !socio_id) {
      return NextResponse.json(
        { error: "Usuário associado precisa estar vinculado a um sócio." },
        { status: 400 },
      );
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(senha),
      email_confirm: true,
      user_metadata: {
        nome_exibicao: String(nome).trim(),
        perfil: perfil.nome,
      },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || "Erro ao criar acesso." },
        { status: 400 },
      );
    }

    const { error: usuarioError } = await supabase.from("usuarios_sistema").insert({
      id: authData.user.id,
      perfil_id,
      socio_id: socio_id || null,
      funcionario_id: null,
      ativo: ativo !== false,
      nome_exibicao: String(nome).trim(),
    });

    if (usuarioError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: `Usuário Auth criado, mas o cadastro do sistema falhou: ${usuarioError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, id: authData.user.id, message: "Usuário criado com sucesso." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno do servidor." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, ativo } = await request.json();
    if (!id || typeof ativo !== "boolean") {
      return NextResponse.json({ error: "Informe id e ativo." }, { status: 400 });
    }

    const supabase = getAdminClient();
    const { error } = await supabase.from("usuarios_sistema").update({ ativo }).eq("id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar usuário." },
      { status: 500 },
    );
  }
}
