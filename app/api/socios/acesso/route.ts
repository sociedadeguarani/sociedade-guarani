import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { usuarioAutenticado, normalizarPerfil } from "@/lib/guaraniAuth";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração do Supabase incompleta.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const acesso = await usuarioAutenticado(request);
    if ("error" in acesso) return NextResponse.json({ error: acesso.error }, { status: acesso.status });
    if (acesso.perfil !== "administrador") {
      return NextResponse.json({ error: "Somente administradores podem criar acessos de associados." }, { status: 403 });
    }

    const body = await request.json();
    const socioId = String(body?.socio_id || "").trim();
    if (!socioId) return NextResponse.json({ error: "Informe o sócio." }, { status: 400 });

    const supabase = getAdminClient();
    const { data: socio, error: socioError } = await supabase
      .from("socios")
      .select("id,matricula,nome,cpf,situacao")
      .eq("id", socioId)
      .maybeSingle();

    if (socioError) return NextResponse.json({ error: socioError.message }, { status: 500 });
    if (!socio) return NextResponse.json({ error: "Sócio não encontrado." }, { status: 404 });

    const matricula = String(socio.matricula ?? "").replace(/\D/g, "");
    const cpf = String(socio.cpf ?? "").replace(/\D/g, "");
    if (!matricula) return NextResponse.json({ error: "O sócio precisa ter matrícula." }, { status: 400 });
    if (cpf.length < 6) return NextResponse.json({ error: "O sócio precisa ter CPF com pelo menos 6 números." }, { status: 400 });

    const emailInterno = `${matricula}@guarani.local`;
    const senhaInicial = cpf.slice(0, 6);

    const { data: perfis, error: perfilError } = await supabase
      .from("perfis")
      .select("id,nome,ativo")
      .eq("ativo", true)
      .limit(100);

    if (perfilError) return NextResponse.json({ error: perfilError.message }, { status: 500 });
    const perfilAssociado = (perfis || []).find((p) => normalizarPerfil(p.nome) === "associado");
    if (!perfilAssociado) return NextResponse.json({ error: "Perfil Associado não encontrado ou inativo." }, { status: 500 });

    const { data: usuarioExistente, error: usuarioError } = await supabase
      .from("usuarios_sistema")
      .select("id,ativo,perfil_id")
      .eq("socio_id", socio.id)
      .maybeSingle();

    if (usuarioError) return NextResponse.json({ error: usuarioError.message }, { status: 500 });

    let authUserId = usuarioExistente?.id || "";

    if (authUserId) {
      const { data: authUpdate, error: authUpdateError } = await supabase.auth.admin.updateUserById(authUserId, {
        email: emailInterno,
        password: senhaInicial,
        email_confirm: true,
        user_metadata: { nome_exibicao: socio.nome, perfil: perfilAssociado.nome, socio_id: socio.id },
      });
      if (authUpdateError || !authUpdate.user) {
        return NextResponse.json({ error: authUpdateError?.message || "Não foi possível atualizar o acesso." }, { status: 400 });
      }
    } else {
      // Evita criar uma segunda conta caso o e-mail interno já exista no Auth.
      const { data: lista, error: listaError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (listaError) return NextResponse.json({ error: listaError.message }, { status: 500 });
      const existenteAuth = lista.users.find((u) => (u.email || "").toLowerCase() === emailInterno.toLowerCase());

      if (existenteAuth) {
        authUserId = existenteAuth.id;
        const { error: updateError } = await supabase.auth.admin.updateUserById(authUserId, {
          email: emailInterno,
          password: senhaInicial,
          email_confirm: true,
          user_metadata: { nome_exibicao: socio.nome, perfil: perfilAssociado.nome, socio_id: socio.id },
        });
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
      } else {
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: emailInterno,
          password: senhaInicial,
          email_confirm: true,
          user_metadata: { nome_exibicao: socio.nome, perfil: perfilAssociado.nome, socio_id: socio.id },
        });
        if (authError || !authData.user) {
          return NextResponse.json({ error: authError?.message || "Não foi possível criar o acesso." }, { status: 400 });
        }
        authUserId = authData.user.id;
      }
    }

    const ativo = String(socio.situacao || "").toLowerCase() === "ativo";
    const dadosUsuario = {
      id: authUserId,
      perfil_id: perfilAssociado.id,
      socio_id: socio.id,
      funcionario_id: null,
      ativo,
      nome_exibicao: socio.nome,
    };

    const { error: upsertError } = await supabase
      .from("usuarios_sistema")
      .upsert(dadosUsuario, { onConflict: "id" });

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      usuario_id: authUserId,
      login: matricula,
      senha_inicial: senhaInicial,
      ativo,
      message: "Acesso do associado sincronizado com sucesso.",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao sincronizar acesso." }, { status: 500 });
  }
}

