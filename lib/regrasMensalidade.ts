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

function normalizarTipo(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

function ehDependente(socio: CadastroMensalidade): boolean {
  const categoria = normalizarCategoria(socio.categoria);
  const tipo = normalizarTipo(socio.tipo_socio);
  // Nem todos os cadastros antigos têm responsavel_id preenchido. O tipo
  // e a categoria também identificam dependentes, evitando tratá-los como
  // titulares por causa de possui_mensalidade legado = true.
  return Boolean(socio.responsavel_id) || categoria.includes("dependente") || tipo.startsWith("dependente_");
}

/**
 * Para dependentes, a categoria explícita é a referência principal.
 * Se estiver preenchida, só há cobrança quando declara mensalidade própria.
 * Quando a categoria está vazia, usamos o tipo específico *_mensalidade.
 */
export function dependenteTemMensalidade(socio: CadastroMensalidade): boolean {
  const tipo = normalizarTipo(socio.tipo_socio);
  const categoria = normalizarCategoria(socio.categoria);
  const possuiMensalidade =
    socio.possui_mensalidade === true ||
    String(socio.possui_mensalidade ?? "").trim().toLowerCase() === "true";

  // Uma categoria legada de titular nunca pode liberar cobrança de dependente.
  // Isso protege cadastros inconsistentes com responsavel_id preenchido.
  if (categoria === "titular") return false;

  // Tipos estruturados são autoritativos: o sufixo mensalidade permite cobrar,
  // enquanto um tipo dependente explícito sem sufixo não permite cobrança.
  if (TIPOS_DEPENDENTE_COM_MENSALIDADE.has(tipo)) return true;
  if (tipo.startsWith("dependente_")) return false;

  // Sócio Dependente é um associado com cobrança própria, não um dependente
  // financeiro do titular. Cadastros antigos podem manter tipo_socio genérico;
  // a categoria explícita e a flag de cobrança própria resolvem essa exceção.
  if (categoria.startsWith("socio dependente") && possuiMensalidade) return true;

  // Compatibilidade com registros antigos que ainda não têm tipo estruturado:
  // só aceitamos cobrança quando a categoria declarar isso expressamente.
  return Boolean(categoria) && categoria.includes("dependente") && /(?:c\s*\/\s*mensalidade|com\s+mensalidade)/.test(categoria);
}

/**
 * Indica que um cadastro antigo da tabela de dependentes foi promovido
 * para a tabela de sócios. O registro legado permanece para preservar o
 * histórico, mas não deve continuar aparecendo como dependente.
 */
export function dependenteFoiPromovidoParaSocio(
  registro: { migrado_para_socio_id?: unknown } | null | undefined,
): boolean {
  return String(registro?.migrado_para_socio_id ?? "").trim().length > 0;
}

/** Aplica a mesma regra na tela, na prévia e na API de geração. */
export function socioElegivelParaMensalidade(socio: CadastroMensalidade): boolean {
  if (
    socio.ativo === false ||
    normalizarCategoria(socio.situacao) === "inativo"
  ) {
    return false;
  }

  if (ehDependente(socio)) {
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
