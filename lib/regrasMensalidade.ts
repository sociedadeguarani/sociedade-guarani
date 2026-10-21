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

  // Uma categoria legada de titular nunca pode classificar a pessoa como
  // dependente pagante, mesmo que o tipo antigo esteja inconsistente.
  if (categoria === "titular") return false;

  // O tipo estruturado prevalece sobre categorias antigas/genéricas de
  // dependente, evitando que uma categoria desatualizada cobre indevidamente.
  if (tipo.startsWith("dependente_")) {
    return TIPOS_DEPENDENTE_COM_MENSALIDADE.has(tipo);
  }

  // Compatibilidade com registros antigos sem tipo estruturado: a categoria
  // precisa declarar explicitamente que é um dependente com mensalidade.
  return Boolean(categoria) && categoria.includes("dependente") && /(?:c\s*\/\s*mensalidade|com\s+mensalidade)/.test(categoria);
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
