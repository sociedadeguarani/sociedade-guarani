import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/guaraniAuth";

function isPago(situacao: unknown) {
  return ["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(
    String(situacao || "").trim().toLowerCase()
  );
}

function mesesAtraso(dataVencimento: unknown, hoje = new Date()) {
  if (!dataVencimento) return 0;
  const valor = String(dataVencimento).slice(0, 10);
  const vencimento = new Date(`${valor}T00:00:00`);
  if (Number.isNaN(vencimento.getTime()) || vencimento > hoje) return 0;

  let meses =
    (hoje.getFullYear() - vencimento.getFullYear()) * 12 +
    (hoje.getMonth() - vencimento.getMonth());

  if (hoje.getDate() < vencimento.getDate()) meses -= 1;
  return Math.max(1, meses + 1);
}

function calcularStatus(mensalidades: any[], socioId: string) {
  const hoje = new Date();
  const pendentes = mensalidades.filter(
    (m) => String(m.socio_id) === String(socioId) && !isPago(m.situacao)
  );

  let maiorAtrasoMeses = 0;
  let maiorAtrasoDias = 0;

  for (const mensalidade of pendentes) {
    if (!mensalidade.data_vencimento) continue;
    const vencimento = new Date(
      `${String(mensalidade.data_vencimento).slice(0, 10)}T00:00:00`
    );
    if (Number.isNaN(vencimento.getTime()) || vencimento > hoje) continue;

    const dias = Math.max(
      0,
      Math.floor((hoje.getTime() - vencimento.getTime()) / 86400000)
    );
    const meses = mesesAtraso(mensalidade.data_vencimento, hoje);

    maiorAtrasoDias = Math.max(maiorAtrasoDias, dias);
    maiorAtrasoMeses = Math.max(maiorAtrasoMeses, meses);
  }

  if (maiorAtrasoMeses >= 3) {
    return {
      financeiro_status: "muito_atrasado",
      dias_atraso: maiorAtrasoDias,
      meses_atraso: maiorAtrasoMeses,
    };
  }

  if (maiorAtrasoMeses >= 1) {
    return {
      financeiro_status: "atrasado",
      dias_atraso: maiorAtrasoDias,
      meses_atraso: maiorAtrasoMeses,
    };
  }

  return {
    financeiro_status: "em_dia",
    dias_atraso: 0,
    meses_atraso: 0,
  };
}

async function autenticar(request: Request) {
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
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("[API carteirinhas] Supabase não configurado.");
    return {
      response: NextResponse.json(
        { error: "Configuração do servidor incompleta." },
        { status: 500 }
      ),
    };
  }

  const supabaseAuth = createClient(url, key, {
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
    console.error(
      "[API carteirinhas] Token inválido:",
      authError?.message || "usuário não encontrado"
    );
    return {
      response: NextResponse.json(
        { error: "Sessão inválida ou expirada." },
        { status: 401 }
      ),
    };
  }

  const supabase = getServiceClient();

  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios_sistema")
    .select("id,perfil_id,socio_id,ativo,nome_exibicao")
    .eq("id", user.id)
    .maybeSingle();

  if (usuarioError) {
    console.error("[API carteirinhas] Erro usuarios_sistema:", usuarioError);
    return {
      response: NextResponse.json(
        { error: usuarioError.message },
        { status: 500 }
      ),
    };
  }

  if (!usuario) {
    return {
      response: NextResponse.json(
        { error: "Seu usuário ainda não foi cadastrado no sistema." },
        { status: 403 }
      ),
    };
  }

  if (!usuario.ativo) {
    return {
      response: NextResponse.json(
        { error: "Seu acesso não está ativo no sistema." },
        { status: 403 }
      ),
    };
  }

  const { data: perfil, error: perfilError } = await supabase
    .from("perfis")
    .select("id,codigo,nome")
    .eq("id", usuario.perfil_id)
    .maybeSingle();

  if (perfilError) {
    console.error("[API carteirinhas] Erro perfis:", perfilError);
    return {
      response: NextResponse.json(
        { error: perfilError.message },
        { status: 500 }
      ),
    };
  }

  if (!perfil) {
    return {
      response: NextResponse.json(
        { error: "Seu perfil de acesso não está configurado." },
        { status: 403 }
      ),
    };
  }

  const perfilNormalizado = String(perfil.codigo || perfil.nome || "")
    .trim()
    .toLowerCase();

  const perfilCanonico =
    perfilNormalizado === "administrador" ||
    perfilNormalizado === "admin" ||
    perfilNormalizado === "administrador_normal"
      ? "administrador_normal"
      : perfilNormalizado === "administrador_master" || perfilNormalizado === "master"
        ? "administrador_master"
        : perfilNormalizado === "funcionario" || perfilNormalizado === "funcionário"
          ? "funcionario"
          : perfilNormalizado === "associado"
            ? "associado"
            : "";

  if (!perfilCanonico) {
    return {
      response: NextResponse.json(
        { error: "Seu perfil não possui acesso às carteirinhas." },
        { status: 403 }
      ),
    };
  }

  return {
    usuario: {
      id: usuario.id,
      perfil: perfilCanonico,
      socio_id: usuario.socio_id,
      ativo: usuario.ativo,
      nome_exibicao: usuario.nome_exibicao,
      email: user.email,
    },
  };
}

export async function GET(request: Request) {
  try {
    const auth = await autenticar(request);
    if ("response" in auth) return auth.response;

    const supabase = getServiceClient();
    const base =
      "id,matricula,nome,cpf,categoria,tipo_socio,situacao,data_associacao,foto_url,inicio_temporada,fim_temporada,exame_medico_validade";

    let socios: any[] = [];

    if (auth.usuario.perfil === "associado") {
      if (!auth.usuario.socio_id) {
        return NextResponse.json(
          { error: "Seu usuário associado não está vinculado a um sócio." },
          { status: 403 }
        );
      }

      const { data, error } = await supabase
        .from("socios")
        .select(base)
        .eq("id", auth.usuario.socio_id)
        .maybeSingle();
      if (error) throw error;
      if (data) socios = [data];
    } else {
      const { data, error } = await supabase
        .from("socios")
        .select(base)
        .order("nome")
        .limit(1000);
      if (error) throw error;
      socios = data || [];
    }

    const ids = socios.map((s) => s.id).filter(Boolean);
    let mensalidades: any[] = [];
    let dependentes: any[] = [];

    if (ids.length) {
      const { data: mensalidadesData, error: mensalidadesError } = await supabase
        .from("mensalidades")
        .select("socio_id,data_vencimento,situacao")
        .in("socio_id", ids);
      if (mensalidadesError) throw mensalidadesError;
      mensalidades = mensalidadesData || [];

      const { data: dependentesData, error: dependentesError } = await supabase
        .from("dependentes")
        .select("id,socio_id,nome,cpf,parentesco,ativo")
        .in("socio_id", ids)
        .order("nome", { ascending: true });
      if (dependentesError) throw dependentesError;
      dependentes = (dependentesData || []).filter((d) => d.ativo !== false);
    }

    const resultado = socios.map((s) => ({
      ...s,
      ...calcularStatus(mensalidades, s.id),
    }));

    const dependentesResultado = dependentes.map((d) => {
      const titular = resultado.find(
        (s) => String(s.id) === String(d.socio_id)
      );
      return {
        ...d,
        titular_nome: titular?.nome || null,
        titular_matricula: titular?.matricula || null,
        financeiro_status: titular?.financeiro_status || "em_dia",
        dias_atraso: titular?.dias_atraso || 0,
        meses_atraso: titular?.meses_atraso || 0,
        situacao: titular?.situacao || null,
      };
    });

    return NextResponse.json({
      socios: resultado,
      dependentes: dependentesResultado,
    });
  } catch (error: any) {
    console.error("[API carteirinhas] Erro:", error);
    return NextResponse.json(
      {
        error:
          error?.message ||
          error?.details ||
          error?.hint ||
          "Erro ao carregar carteirinhas.",
        code: error?.code || null,
        details: error?.details || null,
        hint: error?.hint || null,
      },
      { status: 500 }
    );
  }
}
