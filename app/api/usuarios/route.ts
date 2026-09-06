import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nome, email, senha, perfil_id, socio_id, ativo } = body;

    if (!nome || !email || !senha || !perfil_id) {
      return NextResponse.json(
        { error: "Nome, e-mail, senha e perfil são obrigatórios." },
        { status: 400 }
      );
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey) {
      return NextResponse.json(
        {
          error:
            "Falta configurar SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel.",
        },
        { status: 500 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: perfil, error: perfilError } = await supabase
      .from("perfis")
      .select("id,nome")
      .eq("id", perfil_id)
      .single();

    if (perfilError || !perfil) {
      return NextResponse.json(
        { error: "Perfil não encontrado." },
        { status: 400 }
      );
    }

    if (perfil.nome === "associado" && !socio_id) {
      return NextResponse.json(
        { error: "Usuário associado precisa estar vinculado a um sócio." },
        { status: 400 }
      );
    }

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
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
        { status: 400 }
      );
    }

    const { error: usuarioError } = await supabase
      .from("usuarios_sistema")
      .insert({
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
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      id: authData.user.id,
      message: "Usuário criado com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro interno do servidor.",
      },
      { status: 500 }
    );
  }
}
