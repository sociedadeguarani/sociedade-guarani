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

/**
 * Situações que representam recebimento efetivo. Isenção e cancelamento não
 * definem início da associação, pois não comprovam pagamento de mensalidade.
 */
export function mensalidadeContaComoPaga(situacao: unknown): boolean {
  const status = String(situacao ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return [
    "pago", "paga", "paid", "quitado", "quitada", "recebido", "recebida",
    "baixado", "baixada", "confirmado", "confirmada", "compensado", "compensada",
  ].includes(status);
}

/** Normaliza uma competência paga para o primeiro dia daquele mês. */
export function normalizarPrimeiraCompetenciaPaga(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  const match = texto.match(/^(\d{4})-(\d{2})(?:-\d{2})?/);
  if (!match) return null;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  if (ano < 1900 || mes < 1 || mes > 12) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

/**
 * Retorna a primeira competência efetivamente paga de um associado.
 * Recebe linhas já consultadas no banco; ignora isenções e cancelamentos.
 */
export function obterPrimeiraCompetenciaPaga(
  mensalidades: ReadonlyArray<{ competencia?: unknown; situacao?: unknown }>,
): string | null {
  const competencias = mensalidades
    .filter((item) => mensalidadeContaComoPaga(item.situacao))
    .map((item) => normalizarPrimeiraCompetenciaPaga(item.competencia))
    .filter((item): item is string => Boolean(item))
    .sort();
  return competencias[0] || null;
}

/**
 * A data cadastrada sempre prevalece. Somente quando estiver vazia/inválida,
 * usa-se o primeiro mês cuja mensalidade foi efetivamente paga.
 */
export function dataAssociacaoPelaPrimeiraMensalidadePaga(
  dataAssociacao: unknown,
  primeiraCompetenciaPaga: unknown,
): string | null {
  if (partesDataAssociacao(dataAssociacao)) return String(dataAssociacao).trim();
  return normalizarPrimeiraCompetenciaPaga(primeiraCompetenciaPaga);
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
  primeiraCompetenciaPaga?: unknown,
): boolean {
  const dataReferencia = dataAssociacaoPelaPrimeiraMensalidadePaga(dataAssociacao, primeiraCompetenciaPaga);
  const associacao = partesDataAssociacao(dataReferencia);
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
  primeiraCompetenciaPaga?: unknown,
): boolean {
  return !competenciaPermitidaPelaAssociacao(dataAssociacao, competencia, diaVencimento, primeiraCompetenciaPaga);
}

/** Usa o dia real do vencimento quando a mensalidade o possui; nos registros
 * legados sem vencimento, usa o dia configurado do associado. */
export function mensalidadeRegistroAnteriorAAssociacao(
  dataAssociacao: unknown,
  competencia: unknown,
  dataVencimento: unknown,
  diaVencimentoAssociado: unknown = 10,
  primeiraCompetenciaPaga?: unknown,
): boolean {
  const vencimento = String(dataVencimento ?? "").slice(0, 10);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(vencimento)
    ? Number(vencimento.slice(8, 10))
    : diaVencimentoAssociado;
  return mensalidadeAnteriorAAssociacao(dataAssociacao, competencia, dia, primeiraCompetenciaPaga);
}
