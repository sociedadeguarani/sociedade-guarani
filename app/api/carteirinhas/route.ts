import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

function isPago(situacao: unknown) {
  return ["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(
    String(situacao || "").toLowerCase()
  );
}

function calcularStatus(mensalidades: any[], socioId: string) {
  const hoje = new Date();
  const pendentes = mensalidades.filter(
    (m) => String(m.socio_id) === String(socioId) && !isPago(m.situacao)
  );

  let maxDias = 0;

  for (const m of pendentes) {
    if (!m.data_vencimento) continue;

    const d = new Date(
      `${String(m.data_vencimento).slice(0, 10)}T00:00:00`
    );

    if (Number.isNaN(d.getTime())) continue;

    const diff = Math.floor(
      (hoje.getTime() - d.getTime()) / 86400000
    );

    if (diff > maxDias) maxDias = diff;
  }

  if (maxDias <= 14) {
    return { financeiro_status: "em_dia", dias_atraso: 0 };
  }

  if (maxDias <= 60) {
    return { financeiro_status: "atrasado", dias_atraso: maxDias };
  }

  return {
    financeiro_status: "muito_atrasado",
    dias_atraso: maxDias,
  };
}

function emLotes<T>(lista: T[], tamanho = 100): T[][] {
  const lotes: T[][] = [];

  for (let i = 0; i < lista.length; i += tamanho) {
    lotes.push(lista.slice(i, i + tamanho));
  }

  return lotes;
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, [
    "administrador",
    "administrador_normal",
    "administrador_master",
    "funcionario",
    "associado",
  ]);

  if ("response" in auth) return auth.response;

  try {
    const supabase = getServiceClient();

    const base =
      "id,matricula,nome,cpf,categoria,tipo_socio,situacao,data_associacao,foto_url,inicio_temporada,fim_temporada,exame_medico_validade,responsavel_id,parentesco,possui_mensalidade,valor_mensalidade";

    let socios: any[] = [];

    if (auth.usuario.perfil === "associado") {
      const { data: proprio, error: proprioError } = await supabase
        .from("socios")
        .select(base)
        .eq("id", auth.usuario.socio_id)
        .maybeSingle();

      if (proprioError) throw proprioError;

      if (proprio) {
        const { data: todos, error: todosError } = await supabase
          .from("socios")
          .select(base)
          .order("nome")
          .limit(5000);

        if (todosError) throw todosError;

        const familia = new Set<string>([String(proprio.id)]);
        let mudou = true;

        while (mudou) {
          mudou = false;

          for (const s of todos || []) {
            if (
              s.responsavel_id &&
              familia.has(String(s.responsavel_id)) &&
              !familia.has(String(s.id))
            ) {
              familia.add(String(s.id));
              mudou = true;
            }
          }
        }

        socios = (todos || []).filter((s) =>
          familia.has(String(s.id))
        );
      }
    } else {
      const { data, error } = await supabase
        .from("socios")
        .select(base)
        .order("nome")
        .limit(5000);

      if (error) throw error;

      socios = data || [];
    }

    const ids = socios
      .map((s) => s.id)
      .filter(Boolean)
      .map(String);

    let mensalidades: any[] = [];

    // IMPORTANTE: não usar .in() com todos os IDs de uma vez.
    // Isso pode gerar Bad Request quando há muitos associados.
    for (const lote of emLotes(ids, 100)) {
      const { data, error } = await supabase
        .from("mensalidades")
        .select("socio_id,data_vencimento,situacao")
        .in("socio_id", lote);

      if (error) throw error;

      mensalidades.push(...(data || []));
    }

    const resultado = socios.map((s) => ({
      ...s,
      ...calcularStatus(mensalidades, s.id),
    }));

    // Dependentes reais são os registros de socios ligados por
    // responsavel_id e sem mensalidade própria.
    const dependentes = resultado
      .filter(
        (s) =>
          Boolean(s.responsavel_id) &&
          !Boolean(s.possui_mensalidade)
      )
      .map((d) => {
        const titular = resultado.find(
          (s) => String(s.id) === String(d.responsavel_id)
        );

        return {
          id: d.id,
          socio_id: d.responsavel_id,
          nome: d.nome,
          cpf: d.cpf,
          parentesco: d.parentesco,
          ativo: d.situacao !== "inativo",
          foto_url: d.foto_url,
          titular_nome: titular?.nome || null,
          titular_matricula: titular?.matricula || null,
          financeiro_status:
            titular?.financeiro_status || "em_dia",
          dias_atraso: titular?.dias_atraso || 0,
          situacao: d.situacao || null,
          responsavel_id: d.responsavel_id,
          possui_mensalidade: false,
        };
      })
      .filter((d) => d.ativo !== false);

    return NextResponse.json({
      socios: resultado,
      dependentes,
    });
  } catch (error) {
    console.error("GET /api/carteirinhas:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar carteirinhas.",
      },
      { status: 500 }
    );
  }
}
