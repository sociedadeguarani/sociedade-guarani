import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const COLUNAS_BASE = [
  "matricula", "nome", "cpf", "rg", "data_nascimento", "telefone", "whatsapp", "email",
  "endereco", "numero", "bairro", "cidade", "estado", "cep", "data_associacao", "categoria",
  "situacao", "observacoes",
];

const COLUNAS_EXTRAS = [
  "foto_url", "tipo_socio", "responsavel_id", "parentesco", "possui_mensalidade", "valor_mensalidade",
  "dia_vencimento", "tipo_pagamento", "conta_bancaria_id", "modalidade_temporada", "inicio_temporada", "fim_temporada",
  "situacao_financeira", "data_ultimo_pagamento",
];

function limparObjeto(body: Record<string, unknown>, colunas: string[]) {
  return Object.fromEntries(colunas.filter((c) => body[c] !== undefined).map((c) => [c, body[c]]));
}

function erroBanco(error: unknown) {
  const e = error as { message?: string; details?: string; hint?: string; code?: string } | null;
  return [e?.message, e?.details, e?.hint, e?.code ? `Código ${e.code}` : ""].filter(Boolean).join(" — ");
}

async function autenticarAdmin(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  return { supabase: getServiceClient() };
}

export async function GET(request: Request) {
  try {
    const auth = await autenticarAdmin(request);
    if ("response" in auth) return auth.response;

    const { data, error } = await auth.supabase.from("socios").select("*").order("matricula", { ascending: true });
    if (error) return NextResponse.json({ error: erroBanco(error) }, { status: 500 });
    return NextResponse.json({ socios: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar sócios." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await autenticarAdmin(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Record<string, unknown>;

    const matricula = String(body.matricula ?? "").replace(/\D/g, "");
    const nome = String(body.nome ?? "").trim();
    const cpf = String(body.cpf ?? "").replace(/\D/g, "");
    if (!matricula) return NextResponse.json({ error: "Informe a matrícula do associado." }, { status: 400 });
    if (!nome) return NextResponse.json({ error: "Informe o nome completo do associado." }, { status: 400 });
    if (cpf.length < 6) return NextResponse.json({ error: "Informe um CPF válido com pelo menos 6 números." }, { status: 400 });

    const base = limparObjeto({ ...body, matricula: Number(matricula), nome, cpf: body.cpf || null }, COLUNAS_BASE);
    const { data, error } = await auth.supabase.from("socios").insert(base).select("*").single();
    if (error) {
      const texto = erroBanco(error);
      if (String(error.code) === "23505") return NextResponse.json({ error: "Esta matrícula já está cadastrada." }, { status: 409 });
      return NextResponse.json({ error: `Não foi possível cadastrar o sócio: ${texto}` }, { status: 500 });
    }

    // Campos complementares são gravados um a um. Assim, se alguma instalação antiga ainda não tiver uma coluna opcional,
    // o cadastro principal continua funcionando sem perder o associado.
    const extras = limparObjeto({ ...body, matricula: Number(matricula), cpf: body.cpf || null }, COLUNAS_EXTRAS);
    const avisos: string[] = [];
    for (const [campo, valor] of Object.entries(extras)) {
      if (campo === "foto_url" && !valor) continue;
      const { error: extraError } = await auth.supabase.from("socios").update({ [campo]: valor }).eq("id", data.id);
      if (extraError) avisos.push(`${campo}: ${erroBanco(extraError)}`);
    }

    const { data: final } = await auth.supabase.from("socios").select("*").eq("id", data.id).single();
    return NextResponse.json({ socio: final || data, avisos });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao cadastrar sócio." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await autenticarAdmin(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Sócio não informado." }, { status: 400 });

    const matricula = String(body.matricula ?? "").replace(/\D/g, "");
    const nome = String(body.nome ?? "").trim();
    const cpf = String(body.cpf ?? "").replace(/\D/g, "");
    if (!matricula) return NextResponse.json({ error: "Informe a matrícula do associado." }, { status: 400 });
    if (!nome) return NextResponse.json({ error: "Informe o nome completo do associado." }, { status: 400 });
    if (cpf.length < 6) return NextResponse.json({ error: "Informe um CPF válido com pelo menos 6 números." }, { status: 400 });

    const base = limparObjeto({ ...body, matricula: Number(matricula), nome, cpf: body.cpf || null }, COLUNAS_BASE);
    const { error } = await auth.supabase.from("socios").update(base).eq("id", id);
    if (error) {
      if (String(error.code) === "23505") return NextResponse.json({ error: "Esta matrícula já está cadastrada em outro sócio." }, { status: 409 });
      return NextResponse.json({ error: `Não foi possível atualizar o sócio: ${erroBanco(error)}` }, { status: 500 });
    }

    const extras = limparObjeto(body, COLUNAS_EXTRAS);
    const avisos: string[] = [];
    for (const [campo, valor] of Object.entries(extras)) {
      const { error: extraError } = await auth.supabase.from("socios").update({ [campo]: valor }).eq("id", id);
      if (extraError) avisos.push(`${campo}: ${erroBanco(extraError)}`);
    }

    const { data } = await auth.supabase.from("socios").select("*").eq("id", id).single();
    return NextResponse.json({ socio: data, avisos });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar sócio." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await autenticarAdmin(request);
    if ("response" in auth) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Sócio não informado." }, { status: 400 });

    const { error } = await auth.supabase.from("socios").delete().eq("id", id);
    if (error) return NextResponse.json({ error: `Não foi possível excluir o sócio: ${erroBanco(error)}` }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir sócio." }, { status: 500 });
  }
}

