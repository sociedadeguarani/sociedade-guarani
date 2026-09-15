import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

function isPago(situacao: unknown) {
  return ["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(String(situacao || "").toLowerCase());
}

function calcularStatus(mensalidades: any[], socioId: string) {
  const hoje = new Date();
  const pendentes = mensalidades.filter((m) => String(m.socio_id) === String(socioId) && !isPago(m.situacao));
  let maxDias = 0;
  for (const m of pendentes) {
    if (!m.data_vencimento) continue;
    const d = new Date(`${String(m.data_vencimento).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const diff = Math.floor((hoje.getTime() - d.getTime()) / 86400000);
    if (diff > maxDias) maxDias = diff;
  }
  if (maxDias <= 14) return { financeiro_status: "em_dia", dias_atraso: 0 };
  if (maxDias <= 60) return { financeiro_status: "atrasado", dias_atraso: maxDias };
  return { financeiro_status: "muito_atrasado", dias_atraso: maxDias };
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario", "associado"]);
  if ("response" in auth) return auth.response;
  try {
    const supabase = getServiceClient();
    const base = "id,matricula,nome,cpf,categoria,tipo_socio,situacao,data_associacao,foto_url,inicio_temporada,fim_temporada,responsavel_id,parentesco";
    let socios: any[] = [];

    if (auth.usuario.perfil === "associado") {
      const { data: pessoa, error: pessoaError } = await supabase
        .from("socios")
        .select(base)
        .eq("id", auth.usuario.socio_id)
        .maybeSingle();
      if (pessoaError) throw pessoaError;

      if (pessoa) {
        const titularId = pessoa.responsavel_id || pessoa.id;
        const { data: titular, error: titularError } = await supabase
          .from("socios")
          .select(base)
          .eq("id", titularId)
          .maybeSingle();
        if (titularError) throw titularError;
        if (titular) socios = [titular];
      }
    } else {
      // A tabela socios agora é a fonte única: titulares são os registros
      // sem responsavel_id. Dependentes ficam em socios com responsavel_id.
      const { data, error } = await supabase
        .from("socios")
        .select(base)
        .is("responsavel_id", null)
        .order("nome")
        .limit(1000);
      if (error) throw error;
      socios = data || [];
    }

    const ids = socios.map((s) => s.id).filter(Boolean);
    let mensalidades: any[] = [];
    let dependentes: any[] = [];

    if (ids.length) {
      // Mensalidade é da família/titular.
      const { data, error } = await supabase
        .from("mensalidades")
        .select("socio_id,data_vencimento,situacao")
        .in("socio_id", ids);
      if (error) throw error;
      mensalidades = data || [];

      // Dependentes também estão em socios.
      const { data: dependentesData, error: dependentesError } = await supabase
        .from("socios")
        .select("id,responsavel_id,matricula,nome,cpf,parentesco,situacao,foto_url")
        .in("responsavel_id", ids)
        .order("nome", { ascending: true });
      if (dependentesError) throw dependentesError;
      dependentes = (dependentesData || []).map((d) => ({
        id: d.id,
        socio_id: d.responsavel_id,
        nome: d.nome,
        cpf: d.cpf,
        parentesco: d.parentesco,
        ativo: d.situacao !== "inativo",
        foto_url: d.foto_url,
      }));
    }

    const resultado = socios.map((s) => ({ ...s, ...calcularStatus(mensalidades, s.id) }));
    const dependentesResultado = dependentes.map((d) => {
      const titular = resultado.find((s) => String(s.id) === String(d.socio_id));
      return {
        ...d,
        titular_nome: titular?.nome || null,
        titular_matricula: titular?.matricula || null,
        financeiro_status: titular?.financeiro_status || "em_dia",
        dias_atraso: titular?.dias_atraso || 0,
        situacao: titular?.situacao || null,
      };
    });

    return NextResponse.json({ socios: resultado, dependentes: dependentesResultado });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar carteirinhas." }, { status: 500 });
  }
}
