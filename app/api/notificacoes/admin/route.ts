import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(request.url);
    const naoLidas = url.searchParams.get("nao_lidas") !== "false";
    const limite = Math.min(Math.max(Number(url.searchParams.get("limite") || 50), 1), 100);

    let query = auth.supabase
      .from("notificacoes_admin")
      .select("id,tipo,titulo,mensagem,origem_tipo,origem_id,lida,criado_em")
      .order("criado_em", { ascending: false })
      .limit(limite);

    if (naoLidas) query = query.eq("lida", false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const lista = (data || []) as any[];

    // Inclui o link do comprovante e o valor original na notificação.
    for (const n of lista) {
      if (!n.origem_tipo || !n.origem_id) continue;
      const tabela =
        n.origem_tipo === "mensalidade" ? "mensalidades" :
        n.origem_tipo === "convite" ? "convites" :
        n.origem_tipo === "reserva" ? "reservas" : null;
      if (!tabela) continue;

      const { data: registro } = await auth.supabase
        .from(tabela)
        .select("id,valor,comprovante_url,comprovante_status,forma_pagamento,tipo_pagamento")
        .eq("id", n.origem_id)
        .maybeSingle();

      if (registro) {
        n.valor = Number(registro.valor || 0);
        n.comprovante_url = registro.comprovante_url || null;
        n.comprovante_status = registro.comprovante_status || null;
        n.forma_pagamento = registro.forma_pagamento || registro.tipo_pagamento || null;
      }
    }

    return NextResponse.json({ notificacoes: lista });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao carregar notificações."
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();

    if (body.todas === true) {
      const { error } = await auth.supabase
        .from("notificacoes_admin")
        .update({ lida: true })
        .eq("lida", false);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => String(x).trim()).filter(Boolean)
      : [];

    if (!ids.length) {
      return NextResponse.json({ error: "Informe a notificação." }, { status: 400 });
    }

    // IMPORTANTE: marcar como lida NÃO confirma pagamento.
    // A confirmação financeira acontece somente no botão "Confirmar pagamento",
    // depois que o administrador verifica o comprovante.
    const { error } = await auth.supabase
      .from("notificacoes_admin")
      .update({ lida: true })
      .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao marcar notificação como lida."
    }, { status: 500 });
  }
}
