import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

function isPago(situacao: unknown) {
  return ["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(
    String(situacao || "").toLowerCase()
  );
}

function statusPorMensalidades(mensalidades: any[]) {
  const hoje = new Date().toISOString().slice(0, 10);
  const mapa = new Map<string, { quantidade: number; dias: number }>();

  for (const m of mensalidades) {
    const id = String(m.socio_id || "");
    const vencimento = String(m.data_vencimento || "").slice(0, 10);
    if (!id || !vencimento || vencimento >= hoje || isPago(m.situacao)) continue;

    const atual = mapa.get(id) || { quantidade: 0, dias: 0 };
    atual.quantidade += 1;

    const venc = new Date(`${vencimento}T00:00:00`);
    const h = new Date(`${hoje}T00:00:00`);
    if (!Number.isNaN(venc.getTime())) {
      atual.dias = Math.max(
        atual.dias,
        Math.max(0, Math.floor((h.getTime() - venc.getTime()) / 86400000))
      );
    }

    mapa.set(id, atual);
  }

  return mapa;
}

function statusFinanceiro(quantidade: number, dias: number) {
  if (quantidade <= 1) {
    return { financeiro_status: "em_dia", dias_atraso: dias, meses_atraso: quantidade };
  }
  if (quantidade === 2) {
    return { financeiro_status: "atrasado", dias_atraso: dias, meses_atraso: quantidade };
  }
  return { financeiro_status: "muito_atrasado", dias_atraso: dias, meses_atraso: quantidade };
}

function emLotes<T>(lista: T[], tamanho = 100): T[][] {
  const lotes: T[][] = [];

  for (let i = 0; i < lista.length; i += tamanho) {
    lotes.push(lista.slice(i, i + tamanho));
  }

  return lotes;
}

export async function GET(request: Request) {
  const modoDependentes = new URL(request.url).searchParams.get("modo") === "dependentes";
  const auth = await requireRoles(request, [
    "administrador",
    
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

    // Não usar .in() com todos os IDs de uma vez.
    for (const lote of emLotes(ids, 100)) {
      const { data, error } = await supabase
        .from("mensalidades")
        .select("socio_id,data_vencimento,situacao")
        .in("socio_id", lote);

      if (error) throw error;
      mensalidades.push(...(data || []));
    }

    const atrasosPorSocio = statusPorMensalidades(mensalidades);
    const resultado = socios.map((s) => {
      const alvoId = String(s.responsavel_id || s.id);
      const atraso = atrasosPorSocio.get(alvoId) || { quantidade: 0, dias: 0 };
      return {
        ...s,
        ...statusFinanceiro(atraso.quantidade, atraso.dias),
      };
    });

    // Os dependentes familiares agora ficam na tabela public.dependentes.
    // A tabela socios contém somente quem possui matrícula própria.
    let dependentesQuery = supabase
      .from("dependentes")
      .select("id,socio_id,matricula,nome,cpf,data_nascimento,parentesco,telefone,whatsapp,email,ativo,created_at,updated_at,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao_financeira,data_ultimo_pagamento,foto_url,observacoes")
      .order("nome");

    if (!modoDependentes) {
      dependentesQuery = dependentesQuery.eq("ativo", true);
    }

    // Associado comum vê somente sua família. Administradores e funcionários
    // podem consultar todos os dependentes.
    if (auth.usuario.perfil === "associado") {
      dependentesQuery = dependentesQuery.eq("socio_id", auth.usuario.socio_id);
    }

    const { data: dependentesDb, error: dependentesError } = await dependentesQuery;
    if (dependentesError) throw dependentesError;

    const sociosPorId = new Map(resultado.map((s) => [String(s.id), s]));
    const dependentes = (dependentesDb || []).map((d: any) => {
      const titular = sociosPorId.get(String(d.socio_id));
      const titularId = String(d.socio_id || "");
      const status = titular
        ? {
            financeiro_status: titular.financeiro_status || "em_dia",
            dias_atraso: titular.dias_atraso || 0,
          }
        : { financeiro_status: "em_dia", dias_atraso: 0 };

      return {
        id: String(d.id),
        socio_id: titularId,
        matricula: d.matricula || null,
        nome: d.nome,
        cpf: d.cpf || null,
        parentesco: d.parentesco || null,
        data_nascimento: d.data_nascimento || null,
        telefone: d.telefone || d.whatsapp || null,
        whatsapp: d.whatsapp || null,
        email: d.email || null,
        created_at: d.created_at || null,
        updated_at: d.updated_at || null,
        valor_mensalidade: Number(d.valor_mensalidade || 0),
        dia_vencimento: d.dia_vencimento == null ? null : Number(d.dia_vencimento),
        tipo_pagamento: d.tipo_pagamento || null,
        data_ultimo_pagamento: d.data_ultimo_pagamento || null,
        observacoes: d.observacoes || null,
        ativo: d.ativo !== false,
        foto_url: d.foto_url || null,
        titular_nome: titular?.nome || null,
        titular_matricula: titular?.matricula || null,
        financeiro_status: status.financeiro_status,
        dias_atraso: status.dias_atraso,
        situacao: d.situacao_financeira || "isento",
        responsavel_id: titularId,
        possui_mensalidade: false,
      };
    });

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
