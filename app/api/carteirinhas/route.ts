import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario", "associado"]);
  if ("response" in auth) return auth.response;
  try {
    const supabase = getServiceClient();
    if (auth.usuario.perfil === "associado") {
      const { data, error } = await supabase.from("socios").select("id,matricula,nome,cpf,categoria,tipo_socio,situacao,data_associacao,foto_url,inicio_temporada,fim_temporada").eq("id", auth.usuario.socio_id).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ socios: data ? [data] : [] });
    }
    const { data, error } = await supabase.from("socios").select("id,matricula,nome,cpf,categoria,tipo_socio,situacao,data_associacao,foto_url,inicio_temporada,fim_temporada").order("nome").limit(1000);
    if (error) throw error;
    return NextResponse.json({ socios: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar carteirinhas." }, { status: 500 });
  }
}
