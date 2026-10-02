import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function normalizarPerfil(codigo?: string | null, nome?: string | null) {
  const valorCodigo = String(codigo || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const valorNome = String(nome || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // ADMINISTRADOR MASTER — nível máximo
  if (
    valorCodigo === "administrador_master" ||
    valorCodigo === "master" ||
    valorNome === "administrador master" ||
    valorNome === "master"
  ) {
    return "administrador_master";
  }

  // ADMINISTRADOR
  if (
    valorCodigo === "administrador" ||
    valorCodigo === "administrador_normal" ||
    valorCodigo === "admin" ||
    valorNome === "administrador" ||
    valorNome === "administrador normal" ||
    valorNome === "admin"
  ) {
    return "administrador";
  }

  // FUNCIONÁRIO INVENTÁRIO
  if (
    valorCodigo === "funcionario_inventario" ||
    valorNome.includes("funcionario - inventario") ||
    valorNome.includes("funcionario inventario") ||
    valorNome.includes("funcionário - inventário") ||
    valorNome.includes("funcionário inventário")
  ) {
    return "funcionario_inventario";
  }

  // FUNCIONÁRIO
  if (
    valorCodigo === "funcionario" ||
    valorCodigo === "funcionário" ||
    valorNome === "funcionario" ||
    valorNome === "funcionário"
  ) {
    return "funcionario";
  }

  // ASSOCIADO
  if (
    valorCodigo === "associado" ||
    valorNome === "associado"
  ) {
    return "associado";
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
      .select("id, perfil_id, socio_id, dependente_id, ativo, nome_exibicao")
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

    let socioIdEfetivo = usuario.socio_id;

    if (!socioIdEfetivo && usuario.dependente_id) {
      const { data: dependente } = await supabaseAdmin
        .from("dependentes")
        .select("socio_id")
        .eq("id", usuario.dependente_id)
        .maybeSingle();

      socioIdEfetivo = dependente?.socio_id || null;
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

    const perfilCanonico = normalizarPerfil(
      perfil.codigo,
      perfil.nome
    );

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

        // Perfil canônico usado pelo sistema inteiro.
        perfil: perfilCanonico,

        perfil_nome: perfil.nome,
        perfil_codigo: perfil.codigo,

        socio_id: socioIdEfetivo,
        dependente_id: usuario.dependente_id || null,

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
