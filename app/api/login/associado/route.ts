import { NextResponse } from "next/server";
import { getServiceClient, normalizarPerfil } from "@/lib/guaraniAuth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const matricula = String(body.matricula || "").replace(/\D/g, "");
    if (!matricula) return NextResponse.json({ error: "Informe a matrícula." }, { status: 400 });
    const supabase = getServiceClient();
    const { data: socio, error: socioError } = await supabase.from("socios").select("id,matricula,cpf,nome").eq("matricula", matricula).maybeSingle();
    if (socioError) return NextResponse.json({ error: socioError.message }, { status: 500 });
    if (!socio) return NextResponse.json({ error: "Matrícula não encontrada." }, { status: 404 });
    const { data: usuario, error } = await supabase.from("usuarios_sistema").select("id,ativo,perfil_id,perfis:perfil_id(nome)").eq("socio_id", socio.id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!usuario?.ativo) return NextResponse.json({ error: "Esta matrícula ainda não possui acesso ativo." }, { status: 403 });
    const perfil = Array.isArray(usuario.perfis) ? usuario.perfis[0] : usuario.perfis;
    if (normalizarPerfil(perfil?.nome) !== "associado") return NextResponse.json({ error: "Este acesso não é de associado." }, { status: 403 });
    const { data: authUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = authUsers?.users.find((u) => u.id === usuario.id);
    if (!authUser?.email) return NextResponse.json({ error: "O acesso deste associado está sem e-mail interno. O administrador precisa regenerá-lo." }, { status: 500 });
    return NextResponse.json({ email: authUser.email, nome: socio.nome });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao localizar matrícula." }, { status: 500 });
  }
}
