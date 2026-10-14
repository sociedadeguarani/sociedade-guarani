/**
 * Política única de tolerância de mensalidades usada pela portaria,
 * carteirinhas e relatórios. Os números representam competências distintas
 * vencidas e ainda não quitadas (não quantidade de linhas do banco).
 */
export type PoliticaInadimplencia = {
  meses_atencao: number;
  meses_bloqueio: number;
};

export const POLITICA_INADIMPLENCIA_PADRAO: PoliticaInadimplencia = {
  meses_atencao: 3,
  meses_bloqueio: 4,
};

function inteiroLimitado(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numberValue)));
}

export function normalizarPoliticaInadimplencia(
  value?: Partial<PoliticaInadimplencia> | null
): PoliticaInadimplencia {
  const meses_bloqueio = inteiroLimitado(
    value?.meses_bloqueio,
    POLITICA_INADIMPLENCIA_PADRAO.meses_bloqueio,
    2,
    12
  );
  const meses_atencao = inteiroLimitado(
    value?.meses_atencao,
    POLITICA_INADIMPLENCIA_PADRAO.meses_atencao,
    1,
    meses_bloqueio - 1
  );
  return { meses_atencao, meses_bloqueio };
}

export function classificarMesesAtraso(
  meses: number,
  politica?: Partial<PoliticaInadimplencia> | null
): "verde" | "amarelo" | "vermelho" {
  const configuracao = normalizarPoliticaInadimplencia(politica);
  if (meses >= configuracao.meses_bloqueio) return "vermelho";
  if (meses >= configuracao.meses_atencao) return "amarelo";
  return "verde";
}

export function dataHojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

