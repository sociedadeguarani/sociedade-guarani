import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

function isPago(v: unknown) { return ["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(String(v || "").trim().toLowerCase()); }

export async function GET(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const supabase = getServiceClient();
    const { data: socios, error: se } = await supabase.from("socios").select("id,matricula,nome").order("nome");
    if (se) throw se;
    const ids = (socios || []).map((s) => s.id);
    if (!ids.length) return NextResponse.json({ alertas: [] });
    const { data: mensalidades, error: me } = await supabase.from("mensalidades").select("socio_id,data_vencimento,situacao").in("socio_id", ids);
    if (me) throw me;
    const hoje = new Date();
    const alertas = (socios || []).map((s) => {
      const meses = new Set<string>();
      for (const m of mensalidades || []) {
        if (String(m.socio_id) !== String(s.id) || isPago(m.situacao) || !m.data_vencimento) continue;
        const d = new Date(`${String(m.data_vencimento).slice(0, 10)}T00:00:00`);
        if (!Number.isNaN(d.getTime()) && d < hoje) meses.add(String(m.data_vencimento).slice(0, 7));
      }
      return meses.size >= 3 ? { ...s, meses_atraso: meses.size } : null;
    }).filter(Boolean);
    return NextResponse.json({ alertas });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao consultar inadimplência." }, { status: 500 });
  }
}

