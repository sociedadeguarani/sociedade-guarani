import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json(
        { error: "Sessão não encontrada." },
        { status: 401 }
      );
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceRoleKey) {
      console.error("Variáveis do Supabase não configuradas.");
      return NextResponse.json(
        { error: "Configuração do servidor incompleta." },
        { status: 500 }
      );
    }

    // Cliente para validar o token do usuário.
    const supabaseAuth = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Sessão inválida ou expirada." },
        { status: 401 }
      );
    }

    // Cliente administrativo: consulta o banco sem depender do RLS do navegador.
    const supabaseAdmin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios_sistema")
      .select("id, perfil_id, socio_id, ativo, nome_exibicao")
      .eq("id", user.id)
      .maybeSingle();

    if (usuarioError) {
      console.error("Erro ao consultar usuarios_sistema:", usuarioError);
      return NextResponse.json(
        { error: "Não foi possível consultar seu cadastro." },
        { status: 500 }
      );
    }

    if (!usuario) {
      return NextResponse.json(
        { error: "Seu usuário ainda não foi cadastrado no sistema." },
        { status: 403 }
      );
    }

    if (!usuario.ativo) {
      return NextResponse.json(
        { error: "Seu acesso não está ativo no sistema." },
        { status: 403 }
      );
    }

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("perfis")
      .select("id, nome")
      .eq("id", usuario.perfil_id)
      .maybeSingle();

    if (perfilError) {
      console.error("Erro ao consultar perfil:", perfilError);
      return NextResponse.json(
        { error: "Não foi possível identificar seu perfil." },
        { status: 500 }
      );
    }

    if (!perfil) {
      return NextResponse.json(
        { error: "Seu perfil de acesso não está configurado." },
        { status: 403 }
      );
    }

    const perfilNormalizado = String(perfil.nome || "").trim().toLowerCase();

    return NextResponse.json({
      usuario: {
        id: usuario.id,
        perfil_id: usuario.perfil_id,
        perfil: perfilNormalizado,
        socio_id: usuario.socio_id,
        ativo: usuario.ativo,
        nome_exibicao: usuario.nome_exibicao,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Erro inesperado no login/perfil:", error);
    return NextResponse.json(
      { error: "Erro interno ao validar o acesso." },
      { status: 500 }
    );
  }
}

