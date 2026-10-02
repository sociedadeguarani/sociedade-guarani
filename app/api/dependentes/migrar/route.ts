import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const ROLES_LEITURA = [
  "funcionario",
  "administrador",
  "administrador_normal",
  "administrador_master",
];

function erroBanco(error: unknown) {
  const e = error as { message?: string; details?: string; hint?: string; code?: string } | null;
  return [e?.message, e?.details, e?.hint, e?.code ? `Código ${e.code}` : ""]
    .filter(Boolean)
    .join(" — ");
}

/**
 * Consulta dos dependentes.
 *
 * Leitura: Administrador, Administrador Master e Funcionário.
 * O Funcionário recebe exatamente os mesmos registros de consulta,
 * mas não possui permissão de escrita.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireRoles(request, ROLES_LEITURA);
    if ("response" in auth) return auth.response;

    const db = getServiceClient();

    const [dependentesResult, sociosResult] = await Promise.all([
      db
        .from("dependentes")
        .select(
          "id, socio_id, matricula, nome, cpf, data_nascimento, parentesco, telefone, whatsapp, email, ativo, created_at, updated_at, possui_mensalidade, valor_mensalidade, dia_vencimento, tipo_pagamento, situacao_financeira, data_ultimo_pagamento, foto_url, observacoes"
        )
        .order("nome", { ascending: true }),
      db
        .from("socios")
        .select(
          "id, matricula, nome, cpf, situacao, responsavel_id, parentesco, data_nascimento, telefone, whatsapp, email, ativo, created_at, updated_at, possui_mensalidade, valor_mensalidade, dia_vencimento, tipo_pagamento, situacao_financeira, data_ultimo_pagamento, foto_url, observacoes, categoria, tipo_socio"
        )
        .order("nome", { ascending: true }),
    ]);

    if (dependentesResult.error) throw dependentesResult.error;
    if (sociosResult.error) throw sociosResult.error;

    const socios = (sociosResult.data || []).map((s) => ({
      id: String(s.id),
      matricula: s.matricula == null ? null : String(s.matricula),
      nome: String(s.nome || ""),
      situacao: s.situacao ?? null,
    }));

    const normalizarTexto = (valor: unknown) =>
      String(valor || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");

    const chave = (responsavelId: unknown, nome: unknown, cpf: unknown) => {
      const responsavel = String(responsavelId || "");
      const documento = String(cpf || "").replace(/\D/g, "");
      return `${responsavel}|${documento}|${normalizarTexto(nome)}`;
    };

    type DependenteSaida = Record<string, unknown> & { source: "dependentes" | "socios" };
    const unicos = new Map<string, DependenteSaida>();

    // A tabela public.dependentes é a fonte preferencial.
    for (const d of dependentesResult.data || []) {
      const responsavelId = String(d.socio_id || "");
      if (!responsavelId || !d.nome) continue;
      unicos.set(chave(responsavelId, d.nome, d.cpf), {
        id: String(d.id),
        socio_id: responsavelId,
        matricula: d.matricula == null ? null : String(d.matricula),
        nome: String(d.nome || ""),
        cpf: d.cpf ?? null,
        data_nascimento: d.data_nascimento ?? null,
        parentesco: d.parentesco ?? null,
        telefone: d.telefone ?? d.whatsapp ?? null,
        whatsapp: d.whatsapp ?? null,
        email: d.email ?? null,
        ativo: d.ativo !== false,
        created_at: d.created_at ?? null,
        updated_at: d.updated_at ?? null,
        possui_mensalidade: d.possui_mensalidade === true,
        valor_mensalidade: d.valor_mensalidade == null ? 0 : Number(d.valor_mensalidade),
        dia_vencimento: d.dia_vencimento == null ? null : Number(d.dia_vencimento),
        tipo_pagamento: d.tipo_pagamento ?? null,
        situacao_financeira: d.situacao_financeira ?? null,
        data_ultimo_pagamento: d.data_ultimo_pagamento ?? null,
        foto_url: d.foto_url ?? null,
        observacoes: d.observacoes ?? null,
        source: "dependentes",
      });
    }

    // Compatibilidade durante a transição: dependentes históricos ainda podem
    // estar na tabela socios com responsavel_id e sem mensalidade própria.
    for (const s of sociosResult.data || []) {
      if (!s.responsavel_id || s.possui_mensalidade === true || !s.nome) continue;
      const responsavelId = String(s.responsavel_id);
      const k = chave(responsavelId, s.nome, s.cpf);
      if (unicos.has(k)) continue;
      unicos.set(k, {
        id: String(s.id),
        socio_id: responsavelId,
        matricula: s.matricula == null ? null : String(s.matricula),
        nome: String(s.nome || ""),
        cpf: s.cpf ?? null,
        data_nascimento: s.data_nascimento ?? null,
        parentesco: s.parentesco ?? null,
        telefone: s.telefone ?? s.whatsapp ?? null,
        whatsapp: s.whatsapp ?? null,
        email: s.email ?? null,
        ativo: String(s.situacao || "").toLowerCase() !== "inativo" && s.ativo !== false,
        created_at: s.created_at ?? null,
        updated_at: s.updated_at ?? null,
        possui_mensalidade: false,
        valor_mensalidade: 0,
        dia_vencimento: s.dia_vencimento == null ? null : Number(s.dia_vencimento),
        tipo_pagamento: s.tipo_pagamento ?? null,
        situacao_financeira: s.situacao_financeira ?? null,
        data_ultimo_pagamento: s.data_ultimo_pagamento ?? null,
        foto_url: s.foto_url ?? null,
        observacoes: s.observacoes ?? null,
        categoria: s.categoria ?? "Dependente",
        tipo_socio: s.tipo_socio ?? null,
        source: "socios",
      });
    }

    const dependentes = Array.from(unicos.values()).sort((a, b) =>
      String(a.nome).localeCompare(String(b.nome), "pt-BR", { sensitivity: "base" })
    );

    return NextResponse.json({
      dependentes,
      socios,
      total_dependentes: dependentes.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar dependentes." },
      { status: 500 }
    );
  }
}

/**
 * Toda escrita continua exclusiva dos administradores.
 * Funcionário recebe 403 mesmo que tente chamar a API manualmente.
 */
export async function POST(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json(
    { error: "Cadastro de dependente deve ser realizado pela operação administrativa." },
    { status: 405 }
  );
}

export async function PUT(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json(
    { error: "Atualização de dependente deve ser realizada pela operação administrativa." },
    { status: 405 }
  );
}

export async function DELETE(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  return NextResponse.json(
    { error: "Exclusão de dependente deve ser realizada pela operação administrativa." },
    { status: 405 }
  );
}
