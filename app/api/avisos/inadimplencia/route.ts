import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";
import { mensalidadeRegistroAnteriorAAssociacao, obterPrimeiraCompetenciaPaga } from "@/lib/competenciaAssociacao";

function isPago(v: unknown) { return ["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(String(v || "").trim().toLowerCase()); }

export async function GET(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const supabase = getServiceClient();
    const { data: socios, error: se } = await supabase.from("socios").select("id,matricula,nome,data_associacao,dia_vencimento").order("nome");
    if (se) throw se;
    const ids = (socios || []).map((s) => s.id);
    if (!ids.length) return NextResponse.json({ alertas: [] });
    const mensalidades: Array<{ socio_id: string; competencia: string | null; data_vencimento: string | null; situacao: string | null }> = [];
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabase
        .from("mensalidades")
        .select("socio_id,competencia,data_vencimento,situacao")
        .in("socio_id", ids)
        .order("competencia", { ascending: true })
        .order("socio_id", { ascending: true })
        .range(inicio, inicio + 999);
      if (error) throw error;
      mensalidades.push(...((data || []) as typeof mensalidades));
      if ((data || []).length < 1000) break;
    }
    const mensalidadesPorSocio = new Map<string, Array<{ competencia?: unknown; situacao?: unknown }>>();
    for (const mensalidade of mensalidades) {
      const id = String(mensalidade.socio_id || "");
      if (!id) continue;
      const historico = mensalidadesPorSocio.get(id) || [];
      historico.push(mensalidade);
      mensalidadesPorSocio.set(id, historico);
    }
    const primeiraCompetenciaPagaPorSocio = new Map<string, string>();
    for (const [id, historico] of mensalidadesPorSocio) {
      const primeira = obterPrimeiraCompetenciaPaga(historico);
      if (primeira) primeiraCompetenciaPagaPorSocio.set(id, primeira);
    }

    const hoje = new Date();
    const alertas = (socios || []).map((s) => {
      const meses = new Set<string>();
      const primeiraCompetenciaPaga = primeiraCompetenciaPagaPorSocio.get(String(s.id));
      for (const m of mensalidades) {
        if (String(m.socio_id) !== String(s.id) || isPago(m.situacao) || !m.data_vencimento) continue;
        if (mensalidadeRegistroAnteriorAAssociacao(s.data_associacao, m.competencia, m.data_vencimento, s.dia_vencimento, primeiraCompetenciaPaga)) continue;
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

