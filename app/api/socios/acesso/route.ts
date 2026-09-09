import { NextResponse } from "next/server";
import { getServiceClient, usuarioAutenticado } from "@/lib/guaraniAuth";

async function autorizar(request: Request, permitirEscrita = false) {
  const acesso = await usuarioAutenticado(request);
  if ("error" in acesso) return { response: NextResponse.json({ error: acesso.error }, { status: acesso.status }) };

  const podeLer = ["administrador", "funcionario"].includes(acesso.perfil);
  const podeEscrever = ["administrador", "funcionario"].includes(acesso.perfil);
  if (!podeLer || (permitirEscrita && !podeEscrever)) {
    return { response: NextResponse.json({ error: "Sem permissão para acessar os sócios." }, { status: 403 }) };
  }
  return { supabase: acesso.supabase, usuario: acesso.usuario };
}

export async function GET(request: Request) {
  try {
    const acesso = await autorizar(request);
    if ("response" in acesso) return acesso.response;

    const { data, error } = await acesso.supabase
      .from("socios")
      .select("*")
      .order("matricula", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ socios: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar sócios." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const acesso = await autorizar(request, true);
    if ("response" in acesso) return acesso.response;

    const body = await request.json();
    const dados = { ...body };
    delete dados.id;
    delete dados.created_at;
    delete dados.updated_at;

    const matricula = String(dados.matricula ?? "").replace(/\D/g, "");
    if (!matricula) return NextResponse.json({ error: "Informe a matrícula do associado." }, { status: 400 });
    dados.matricula = Number(matricula);

    const { data, error } = await acesso.supabase.from("socios").insert(dados).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ socio: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao cadastrar sócio." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const acesso = await autorizar(request, true);
    if ("response" in acesso) return acesso.response;

    const body = await request.json();
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Informe o sócio." }, { status: 400 });

    const dados = { ...(body?.dados || {}) };
    delete dados.id;
    delete dados.created_at;
    delete dados.updated_at;

    if (dados.matricula !== undefined) {
      const matricula = String(dados.matricula ?? "").replace(/\D/g, "");
      if (!matricula) return NextResponse.json({ error: "A matrícula não pode ficar vazia." }, { status: 400 });
      dados.matricula = Number(matricula);
    }

    const { data, error } = await acesso.supabase.from("socios").update(dados).eq("id", id).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ socio: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar sócio." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const acesso = await autorizar(request, true);
    if ("response" in acesso) return acesso.response;

    const body = await request.json();
    const id = String(body?.id || "").trim();
    if (!id) return NextResponse.json({ error: "Informe o sócio." }, { status: 400 });

    const { error } = await acesso.supabase.from("socios").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir sócio." }, { status: 500 });
  }
}
