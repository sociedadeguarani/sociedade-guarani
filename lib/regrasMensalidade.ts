/** Regras centralizadas para decidir quem pode receber mensalidade própria. */
export type CadastroMensalidade = {
  categoria?: unknown;
  tipo_socio?: unknown;
  responsavel_id?: unknown;
  possui_mensalidade?: unknown;
  situacao?: unknown;
  ativo?: unknown;
};

const TIPOS_DEPENDENTE_COM_MENSALIDADE = new Set([
  "dependente_patrimonial_familiar_mensalidade",
  "dependente_patrimonial_individual_mensalidade",
  "dependente_contribuinte_familiar_mensalidade",
  "dependente_contribuinte_individual_mensalidade",
]);

function normalizarCategoria(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Para dependentes, a categoria explícita continua sendo a fonte principal:
 * só marca como pagante quando informa "c/ mensalidade" ou "com mensalidade".
 * Se a categoria estiver vazia, usa o tipo_socio como compatibilidade legada.
 */
export function dependenteTemMensalidade(socio: CadastroMensalidade): boolean {
  const categoria = normalizarCategoria(socio.categoria);
  if (categoria) {
    return /(?:c\s*\/\s*mensalidade|com\s+mensalidade)/.test(categoria);
  }

  return TIPOS_DEPENDENTE_COM_MENSALIDADE.has(
    String(socio.tipo_socio ?? "").trim().toLowerCase()
  );
}

/** Aplica uma regra única para a tela e para a API de geração. */
export function socioElegivelParaMensalidade(socio: CadastroMensalidade): boolean {
  if (
    socio.ativo === false ||
    String(socio.situacao ?? "").trim().toLowerCase() === "inativo"
  ) {
    return false;
  }

  if (Boolean(socio.responsavel_id)) {
    return dependenteTemMensalidade(socio);
  }

  return socio.possui_mensalidade === true || String(socio.possui_mensalidade).toLowerCase() === "true";
}

/** Normaliza tipos legados de titulares para o tipo correspondente de dependente. */
export function tipoDependenteSemMensalidade(tipo?: unknown): string {
  const atual = String(tipo ?? "").trim().toLowerCase();
  const semSufixo = atual.endsWith("_mensalidade")
    ? atual.slice(0, -"_mensalidade".length)
    : atual;
  const mapeamento: Record<string, string> = {
    patrimonial: "dependente_patrimonial_familiar",
    patrimonial_familiar: "dependente_patrimonial_familiar",
    patrimonial_individual: "dependente_patrimonial_individual",
    contribuinte_familiar: "dependente_contribuinte_familiar",
    contribuinte_individual: "dependente_contribuinte_individual",
    temporada_familiar: "dependente_patrimonial_familiar",
    transitorio: "dependente_transitorio",
    remido: "dependente_patrimonial_familiar",
  };
  if (mapeamento[semSufixo]) return mapeamento[semSufixo];
  if ([
    "dependente_patrimonial_familiar",
    "dependente_patrimonial_individual",
    "dependente_contribuinte_familiar",
    "dependente_contribuinte_individual",
    "dependente_transitorio",
  ].includes(semSufixo)) return semSufixo;
  return "dependente_patrimonial_familiar";
}

/** Aplica o sufixo de cobrança somente aos tipos de dependentes que o suportam. */
export function tipoDependenteComMensalidade(tipo?: unknown): string {
  const base = tipoDependenteSemMensalidade(tipo);
  if (base === "dependente_transitorio") return base;
  return `${base}_mensalidade`;
}
