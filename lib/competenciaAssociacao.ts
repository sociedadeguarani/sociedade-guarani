/**
 * Regra de início da cobrança: nenhuma competência anterior à associação é devida.
 * Na competência de entrada, a cobrança só vence naquele mês se a associação
 * ocorreu até o dia de vencimento; caso contrário, começa no mês seguinte.
 */

export type DataAssociacaoPartes = {
  competencia: string;
  dia: number;
};

export function partesDataAssociacao(valor: unknown): DataAssociacaoPartes | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;

  let ano = 0;
  let mes = 0;
  let dia = 0;

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const brasileira = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (iso) {
    ano = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else if (brasileira) {
    dia = Number(brasileira[1]);
    mes = Number(brasileira[2]);
    ano = Number(brasileira[3]);
  } else {
    return null;
  }

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    !Number.isFinite(data.getTime()) ||
    data.getUTCFullYear() !== ano ||
    data.getUTCMonth() !== mes - 1 ||
    data.getUTCDate() !== dia
  ) {
    return null;
  }

  return {
    competencia: `${ano}-${String(mes).padStart(2, "0")}`,
    dia,
  };
}

function diaVencimentoSeguro(valor: unknown): number {
  const numero = Number(valor || 10);
  if (!Number.isFinite(numero)) return 10;
  return Math.min(Math.max(Math.trunc(numero), 1), 28);
}

export function competenciaPermitidaPelaAssociacao(
  dataAssociacao: unknown,
  competencia: unknown,
  diaVencimento: unknown = 10,
): boolean {
  const associacao = partesDataAssociacao(dataAssociacao);
  if (!associacao) return true;

  const referencia = String(competencia ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(referencia)) return true;

  if (referencia < associacao.competencia) return false;
  if (referencia > associacao.competencia) return true;

  return associacao.dia <= diaVencimentoSeguro(diaVencimento);
}

export function mensalidadeAnteriorAAssociacao(
  dataAssociacao: unknown,
  competencia: unknown,
  diaVencimento: unknown = 10,
): boolean {
  return !competenciaPermitidaPelaAssociacao(dataAssociacao, competencia, diaVencimento);
}

/** Usa o dia real do vencimento quando a mensalidade o possui; nos registros
 * legados sem vencimento, usa o dia configurado do associado. */
export function mensalidadeRegistroAnteriorAAssociacao(
  dataAssociacao: unknown,
  competencia: unknown,
  dataVencimento: unknown,
  diaVencimentoAssociado: unknown = 10,
): boolean {
  const vencimento = String(dataVencimento ?? "").slice(0, 10);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(vencimento)
    ? Number(vencimento.slice(8, 10))
    : diaVencimentoAssociado;
  return mensalidadeAnteriorAAssociacao(dataAssociacao, competencia, dia);
}
