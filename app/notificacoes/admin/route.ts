import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const somenteNaoLidas = searchParams.get("nao_lidas") !== "false";
    const limite = Math.min(Math.max(Number(searchParams.get("limite") || 20), 1), 100);

    let query = auth.supabase
      .from("notificacoes_admin")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(limite);

    if (somenteNaoLidas) query = query.eq("lida", false);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const { count, error: countError } = await auth.supabase
      .from("notificacoes_admin")
      .select("id", { count: "exact", head: true })
      .eq("lida", false);

    if (countError) throw new Error(countError.message);

    return NextResponse.json({ notificacoes: data || [], nao_lidas: count || 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar notificações." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id).trim()).filter(Boolean) : [];
    const todas = body.todas === true;

    let query = auth.supabase.from("notificacoes_admin").update({ lida: true, lida_em: new Date().toISOString() }).eq("lida", false);
    if (!todas) {
      if (!ids.length) return NextResponse.json({ error: "Informe as notificações." }, { status: 400 });
      query = query.in("id", ids);
    }

    const { error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao marcar notificações." }, { status: 500 });
  }
}

