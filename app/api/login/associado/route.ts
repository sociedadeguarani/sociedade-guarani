import { NextResponse } from "next/server";
import { getServiceClient, normalizarPerfil } from "@/lib/guaraniAuth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const matricula = String(body.matricula || "").trim().toUpperCase();
    if (!matricula) return NextResponse.json({ error: "Informe a matrícula." }, { status: 400 });
    const supabase = getServiceClient();

    let socio: { id: string; matricula: string | null; cpf: string | null; nome: string } | null = null;

    if (/^\d{1,4}$/.test(matricula)) {
      // Compatibilidade: se o associado informar somente o número antigo
      // (ex.: 24), procuramos o núcleo cujo titular termina em A.
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
    }

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
