import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

// Cria (ou sincroniza) o acesso de login de um associado.
// Login: matrícula do sócio. Senha inicial: 6 primeiros números do CPF.
// O associado pode trocar a senha depois, então NUNCA resetamos a senha
// de um acesso que já existe — só criamos na primeira vez.
export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario"]);
  if ("response" in auth) return auth.response;

  let etapa = "iniciando";
  try {
    const body = await request.json().catch(() => ({}));
    const socioId = String(body?.socio_id || "").trim();
    if (!socioId) return NextResponse.json({ error: "Informe o sócio." }, { status: 400 });

    const supabase = getServiceClient();

    etapa = "buscando sócio";
    const { data: socio, error: socioError } = await supabase
      .from("socios")
      .select("id,matricula,nome,cpf")
      .eq("id", socioId)
      .maybeSingle();
    if (socioError) throw new Error(socioError.message);
    if (!socio) return NextResponse.json({ error: "Sócio não encontrado." }, { status: 404 });
    if (!socio.matricula) return NextResponse.json({ error: "O sócio precisa ter uma matrícula cadastrada." }, { status: 400 });

    const cpfDigitos = String(socio.cpf || "").replace(/\D/g, "");
    if (cpfDigitos.length < 6) {
      return NextResponse.json({ error: "O sócio precisa ter um CPF com pelo menos 6 dígitos cadastrado para criar o acesso." }, { status: 400 });
    }
    const senhaInicial = cpfDigitos.slice(0, 6);
    const emailAcesso = `matricula${socio.matricula}@guarani.socios`;

    etapa = "buscando perfil de associado";
    const { data: perfilAssociado, error: perfilError } = await supabase
      .from("perfis")
      .select("id")
      .eq("nome", "associado")
      .maybeSingle();
    if (perfilError) throw new Error(perfilError.message);
    if (!perfilAssociado) return NextResponse.json({ error: "Perfil 'associado' não está cadastrado em perfis." }, { status: 500 });

    etapa = "verificando acesso existente";
    const { data: usuarioExistente, error: usuarioError } = await supabase
      .from("usuarios_sistema")
      .select("id,ativo")
      .eq("socio_id", socio.id)
      .maybeSingle();
    if (usuarioError) throw new Error(usuarioError.message);

    if (usuarioExistente) {
      etapa = "sincronizando acesso existente";
      // Já existe: só garante que está ativo e com o perfil certo.
      // Não mexe na senha para não sobrescrever uma senha que o associado já trocou.
      const { error: updateError } = await supabase
        .from("usuarios_sistema")
        .update({ ativo: true, perfil_id: perfilAssociado.id, nome_exibicao: socio.nome })
        .eq("id", usuarioExistente.id);
      if (updateError) throw new Error(updateError.message);

      return NextResponse.json({ ok: true, criado: false, matricula: socio.matricula });
    }

    etapa = "criando usuário de autenticação";
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: emailAcesso,
      password: senhaInicial,
      email_confirm: true,
      user_metadata: { nome_exibicao: socio.nome, perfil: "associado", socio_id: socio.id },
    });
    if (authError || !authData.user) throw new Error(authError?.message || "Não foi possível criar o acesso de autenticação.");

    etapa = "cadastrando usuário do sistema";
    const { error: insertError } = await supabase.from("usuarios_sistema").insert({
      id: authData.user.id,
      perfil_id: perfilAssociado.id,
      socio_id: socio.id,
      funcionario_id: null,
      ativo: true,
      nome_exibicao: socio.nome,
    });
    if (insertError) {
      // Se o cadastro do sistema falhar, desfaz o usuário de autenticação criado.
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(insertError.message);
    }

    return NextResponse.json({ ok: true, criado: true, matricula: socio.matricula, senhaInicial });
  } catch (error) {
    console.error(`Erro ao criar/sincronizar acesso (etapa: ${etapa}):`, error);
    return NextResponse.json(
      { error: `Erro ao criar acesso (${etapa}): ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
