import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function normalizarPerfil(codigo?: string | null, nome?: string | null) {
  const valorCodigo = String(codigo || "").trim().toLowerCase();
  const valorNome = String(nome || "").trim().toLowerCase();

  // O código é a fonte principal para diferenciar Administrador Master
  // de Administrador Normal quando os nomes exibidos forem iguais.
  const valor = valorCodigo || valorNome;

  if (valorCodigo === "administrador_master" || valorCodigo === "master" || valorNome === "administrador master" || valorNome === "master") {
    return "administrador_master";
  }

  if (
    valor === "administrador" ||
    valor === "admin" ||
    valor === "administrador_normal"
  ) {
    return "administrador_normal";
  }

  if (valor === "funcionario" || valor === "funcionário") {
    return "funcionario";
  }

  if (valor === "funcionario_inventario" || valor === "funcionário_inventário") {
    return "funcionario_inventario";
  }

  if (valor === "associado") {
    return "associado";
  }

  // Fallback: se o código não estiver preenchido, tenta o nome.
  if (valorCodigo && valorCodigo !== valorNome) {
    if (valorNome === "administrador_master" || valorNome === "master") {
      return "administrador_master";
    }
    if (
      valorNome === "administrador" ||
      valorNome === "admin" ||
      valorNome === "administrador_normal"
    ) {
      return "administrador_normal";
    }
    if (valorNome === "funcionario" || valorNome === "funcionário") {
      return "funcionario";
    }
    if (valorNome === "funcionario_inventario" || valorNome === "funcionário_inventário" || valorNome === "Funcionário — Inventário".toLowerCase()) {
      return "funcionario_inventario";
    }
    if (valorNome === "associado") {
      return "associado";
    }
  }

  return "";
}

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
      .select("id, codigo, nome")
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

    const perfilCanonico = normalizarPerfil(perfil.codigo, perfil.nome);

    if (!perfilCanonico) {
      return NextResponse.json(
        { error: "Seu perfil de acesso não está configurado corretamente." },
        { status: 403 }
      );
    }

    return NextResponse.json({
      usuario: {
        id: usuario.id,
        perfil_id: usuario.perfil_id,
        // O login grava o perfil canônico no localStorage.
        // Isso evita que "Administrador" seja confundido com associado
        // ou com administrador normal quando o código real é Master.
        perfil: perfilCanonico,
        perfil_nome: perfil.nome,
        perfil_codigo: perfil.codigo,
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
