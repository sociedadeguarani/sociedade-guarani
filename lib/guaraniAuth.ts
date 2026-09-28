import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function normalizarPerfil(value: unknown, nome?: unknown) {
  const codigo = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const rotulo = String(nome ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // ADMINISTRADOR MASTER
  if (
    codigo === "administrador_master" ||
    codigo === "master" ||
    rotulo.includes("administrador master") ||
    rotulo === "master"
  ) {
    return "administrador_master";
  }

  // ADMINISTRADOR
  if (
    codigo === "administrador" ||
    codigo === "admin" ||
    rotulo === "administrador" ||
    rotulo === "admin"
  ) {
    return "administrador";
  }

  // FUNCIONÁRIO - INVENTÁRIO
  if (
    codigo === "funcionario_inventario" ||
    rotulo.includes("funcionario - inventario") ||
    rotulo.includes("funcionario inventario")
  ) {
    return "funcionario_inventario";
  }

  // FUNCIONÁRIO
  if (
    codigo === "funcionario" ||
    rotulo === "funcionario"
  ) {
    return "funcionario";
  }

  // ASSOCIADO
  if (
    codigo === "associado" ||
    rotulo === "associado"
  ) {
    return "associado";
  }

  return codigo || rotulo;
}

export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Configuração do Supabase incompleta.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function usuarioAutenticado(request: Request) {
  const authorization =
    request.headers.get("authorization") || "";

  const token = authorization
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    return {
      error: "Sessão não encontrada.",
      status: 401 as const,
    };
  }

  const supabase = getServiceClient();

  const {
    data: authData,
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return {
      error: "Sessão inválida ou expirada.",
      status: 401 as const,
    };
  }

  const {
    data: usuario,
    error: usuarioError,
  } = await supabase
    .from("usuarios_sistema")
    .select(
      "id,nome_exibicao,perfil_id,socio_id,dependente_id,funcionario_id,ativo,perfis:perfil_id(id,nome,codigo)"
    )
    .eq("id", authData.user.id)
    .maybeSingle();

  if (usuarioError) {
    return {
      error: `Não foi possível consultar seu acesso: ${usuarioError.message}`,
      status: 500 as const,
    };
  }

  if (!usuario) {
    return {
      error: "Seu usuário não está cadastrado no sistema.",
      status: 403 as const,
    };
  }

  let usuarioComVinculo = usuario as typeof usuario & {
    socio_id: string | null;
  };

  // Se o usuário estiver vinculado diretamente a um dependente,
  // usa o titular responsável como socio_id efetivo.
  if (
    !usuarioComVinculo.socio_id &&
    usuario.dependente_id
  ) {
    const {
      data: dependente,
    } = await supabase
      .from("dependentes")
      .select("socio_id")
      .eq("id", usuario.dependente_id)
      .maybeSingle();

    usuarioComVinculo = {
      ...usuario,
      socio_id: dependente?.socio_id || null,
    };
  }

  if (!usuario.ativo) {
    return {
      error: "Seu acesso está inativo.",
      status: 403 as const,
    };
  }

  const perfilRaw = Array.isArray(usuarioComVinculo.perfis)
    ? usuarioComVinculo.perfis[0]
    : usuarioComVinculo.perfis;

  const perfil = normalizarPerfil(
    perfilRaw?.codigo,
    perfilRaw?.nome
  );

  return {
    supabase,
    authUser: authData.user,
    usuario: usuarioComVinculo,
    perfil,
  };
}

export async function requireRoles(
  request: Request,
  roles: string[]
) {
  const resultado = await usuarioAutenticado(request);

  if ("error" in resultado) {
    return {
      response: new Response(
        JSON.stringify({
          error: resultado.error,
        }),
        {
          status: resultado.status,
          headers: {
            "Content-Type": "application/json",
          },
        }
      ),
    };
  }

  const permitidos = roles.map((role) =>
    normalizarPerfil(role)
  );

  if (!permitidos.includes(resultado.perfil)) {
    return {
      response: new Response(
        JSON.stringify({
          error: "Sem permissão para esta operação.",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        }
      ),
    };
  }

  return {
    usuario: {
      ...resultado.usuario,
      perfil: resultado.perfil,
    },
  };
}

export async function getUsuarioAutenticado(
  request: Request
) {
  const resultado = await usuarioAutenticado(request);

  if ("error" in resultado) {
    return null;
  }

  return {
    ...resultado.usuario,
    perfil: resultado.perfil,
  };
}

// Somente estes dois perfis são administradores.
const PERFIS_ADMIN = [
  "administrador",
  "administrador_master",
];

export async function exigirAdministrador(
  request: Request
) {
  const resultado = await usuarioAutenticado(request);

  if ("error" in resultado) {
    return resultado;
  }

  if (!PERFIS_ADMIN.includes(resultado.perfil)) {
    return {
      error: "Somente administradores podem realizar esta operação.",
      status: 403 as const,
    };
  }

  return resultado;
}
