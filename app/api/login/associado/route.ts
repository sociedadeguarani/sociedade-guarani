import { NextResponse } from "next/server";
import { getServiceClient, normalizarPerfil } from "@/lib/guaraniAuth";

const senhaInicialCpf = (cpf: unknown) => String(cpf || "").replace(/\D/g, "").slice(0, 6);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const matricula = String(body.matricula || "").trim().toUpperCase();
    if (!matricula) return NextResponse.json({ error: "Informe a matrícula." }, { status: 400 });

    const supabase = getServiceClient();

    let socio: { id: string; matricula: string | null; cpf: string | null; nome: string } | null = null;
    let dependente: { id: string; socio_id: string; matricula: string | null; cpf: string | null; nome: string; ativo: boolean | null } | null = null;

    if (/^\d{1,4}$/.test(matricula)) {
      const base = matricula.padStart(4, "0");
      const { data: candidatos, error: buscaError } = await supabase
        .from("socios")
        .select("id,matricula,cpf,nome")
        .ilike("matricula", `__${base}A`);
      if (buscaError) return NextResponse.json({ error: buscaError.message }, { status: 500 });
      if ((candidatos || []).length > 1) {
        return NextResponse.json({ error: `Existem várias famílias para a matrícula ${matricula}. Informe a matrícula completa, por exemplo SP${base}A.` }, { status: 409 });
      }
      socio = candidatos?.[0] || null;
    } else {
      const { data, error: socioError } = await supabase
        .from("socios")
        .select("id,matricula,cpf,nome")
        .eq("matricula", matricula)
        .maybeSingle();
      if (socioError) return NextResponse.json({ error: socioError.message }, { status: 500 });
      socio = data;
      if (!socio) {
        const { data: dep, error: depError } = await supabase
          .from("dependentes")
          .select("id,socio_id,matricula,cpf,nome,ativo")
          .eq("matricula", matricula)
          .maybeSingle();
        if (depError) return NextResponse.json({ error: depError.message }, { status: 500 });
        dependente = dep;
      }
    }

    if (!socio && !dependente) {
      return NextResponse.json({ error: "Matrícula não encontrada." }, { status: 404 });
    }

    const pessoa = socio || dependente!;
    if (dependente && !dependente.ativo) {
      return NextResponse.json({ error: "Este dependente está inativo no sistema." }, { status: 403 });
    }

    const cpfDigitos = String(pessoa.cpf || "").replace(/\D/g, "");
    if (cpfDigitos.length < 6) {
      return NextResponse.json({ error: "O cadastro precisa ter pelo menos 6 dígitos de CPF para criar o acesso." }, { status: 400 });
    }
    const senhaInicial = senhaInicialCpf(pessoa.cpf);
    const emailAcesso = `${socio ? "matricula" : "dependente"}${pessoa.matricula}@guarani.socios`;

    const { data: perfilAssociado, error: perfilError } = await supabase
      .from("perfis")
      .select("id,nome,codigo")
      .or("codigo.eq.associado,nome.ilike.associado")
      .limit(1)
      .maybeSingle();
    if (perfilError) return NextResponse.json({ error: perfilError.message }, { status: 500 });
    if (!perfilAssociado || normalizarPerfil(perfilAssociado.codigo, perfilAssociado.nome) !== "associado") {
      return NextResponse.json({ error: "Perfil 'associado' não está cadastrado em perfis." }, { status: 500 });
    }

    if (dependente) {
      const { data: usuarioExistente, error: usuarioError } = await supabase
        .from("usuarios_sistema")
        .select("id,ativo")
        .eq("dependente_id", dependente.id)
        .maybeSingle();
      if (usuarioError) return NextResponse.json({ error: usuarioError.message }, { status: 500 });

      if (usuarioExistente) {
        const { error: updateError } = await supabase
          .from("usuarios_sistema")
          .update({ ativo: true, perfil_id: perfilAssociado.id, nome_exibicao: dependente.nome })
          .eq("id", usuarioExistente.id);
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
        const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const authUser = authUsers?.users.find((u) => u.id === usuarioExistente.id);
        if (!authUser?.email) return NextResponse.json({ error: "O acesso deste dependente está sem e-mail interno." }, { status: 500 });
        return NextResponse.json({ email: authUser.email, nome: dependente.nome });
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: emailAcesso,
        password: senhaInicial,
        email_confirm: true,
        user_metadata: { nome_exibicao: dependente.nome, perfil: "associado", dependente_id: dependente.id, socio_id: dependente.socio_id },
      });
      if (authError || !authData.user) {
        if (authError?.message?.toLowerCase().includes("already") || authError?.message?.toLowerCase().includes("registered")) {
          return NextResponse.json({ error: "O acesso desta matrícula já existe. Peça à administração para sincronizar o acesso." }, { status: 409 });
        }
        return NextResponse.json({ error: authError?.message || "Não foi possível criar o acesso do dependente." }, { status: 500 });
      }

      const { error: insertError } = await supabase.from("usuarios_sistema").insert({
        id: authData.user.id,
        perfil_id: perfilAssociado.id,
        socio_id: null,
        dependente_id: dependente.id,
        funcionario_id: null,
        ativo: true,
        nome_exibicao: dependente.nome,
      });
      if (insertError) {
        await supabase.auth.admin.deleteUser(authData.user.id);
        return NextResponse.json({ error: `Não foi possível cadastrar o acesso do dependente: ${insertError.message}` }, { status: 500 });
      }

      return NextResponse.json({ email: emailAcesso, nome: dependente.nome, criado: true });
    }

    const { data: usuario, error } = await supabase
      .from("usuarios_sistema")
      .select("id,ativo,perfil_id,perfis:perfil_id(nome,codigo)")
      .eq("socio_id", socio!.id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!usuario?.ativo) return NextResponse.json({ error: "Esta matrícula ainda não possui acesso ativo." }, { status: 403 });

    const perfil = Array.isArray(usuario.perfis) ? usuario.perfis[0] : usuario.perfis;
    if (normalizarPerfil(perfil?.codigo, perfil?.nome) !== "associado") {
      return NextResponse.json({ error: "Este acesso não é de associado." }, { status: 403 });
    }

    const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = authUsers?.users.find((u) => u.id === usuario.id);
    if (!authUser?.email) return NextResponse.json({ error: "O acesso deste associado está sem e-mail interno. O administrador precisa regenerá-lo." }, { status: 500 });

    return NextResponse.json({ email: authUser.email, nome: socio!.nome });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao localizar matrícula." }, { status: 500 });
  }
}
