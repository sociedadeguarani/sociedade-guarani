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
    const { data, error } = await db
      .from("dependentes")
      .select(
        "id, socio_id, nome, cpf, data_nascimento, parentesco, telefone, ativo, created_at, possui_mensalidade, valor_mensalidade, dia_vencimento, tipo_pagamento, situacao_financeira, data_ultimo_pagamento"
      )
      .order("nome", { ascending: true });

    if (error) {
      return NextResponse.json({ error: erroBanco(error) }, { status: 500 });
    }

    return NextResponse.json({ dependentes: data || [] });
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
