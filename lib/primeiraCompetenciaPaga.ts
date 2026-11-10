import { getServiceClient } from "@/lib/guaraniAuth";

export type PrimeiraCompetenciaPagaRow = {
  socio_id: string | null;
  primeira_competencia_paga: string | null;
};

/**
 * Busca em lote a primeira competência com recebimento efetivo de cada sócio.
 * A função SQL considera somente status de pagamento confirmado (não inclui
 * isento/cancelado) e evita transferir todo o histórico para o Next.js.
 */
export async function carregarMapaPrimeiraCompetenciaPaga(
  db: ReturnType<typeof getServiceClient>,
  socioIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(socioIds.map((id) => String(id || "").trim()).filter(Boolean)));
  const resultado = new Map<string, string>();
  const tamanhoLote = 250;

  for (let inicio = 0; inicio < ids.length; inicio += tamanhoLote) {
    const lote = ids.slice(inicio, inicio + tamanhoLote);
    const { data, error } = await db.rpc("socios_primeira_competencia_paga_v1", {
      p_socio_ids: lote,
    });
    if (error) throw new Error(`Falha ao consultar a primeira mensalidade paga: ${error.message}`);

    for (const item of (data || []) as PrimeiraCompetenciaPagaRow[]) {
      const id = String(item.socio_id || "");
      const competencia = String(item.primeira_competencia_paga || "").slice(0, 10);
      if (id && /^\d{4}-\d{2}-\d{2}$/.test(competencia)) resultado.set(id, competencia);
    }
  }

  return resultado;
}
