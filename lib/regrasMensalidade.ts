/** Regras centralizadas para decidir quem pode receber mensalidade própria. */
export type CadastroMensalidade = {
  matricula?: unknown;
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
  const matricula = String(socio.matricula ?? "").trim().toUpperCase();
  // Regra oficial de matrícula: A paga mensalidade própria; B não paga.
  // A regra do sufixo prevalece sobre categorias/tipos legados inconsistentes.
  if (/A$/.test(matricula)) return true;
  if (/B$/.test(matricula)) return false;

  const tipo = normalizarTipo(socio.tipo_socio);
  const categoria = normalizarCategoria(socio.categoria);

  // O tipo estruturado diferencia inequivocamente dependentes cobrados dos
  // dependentes sem mensalidade. Ele deve prevalecer sobre categoria legada.
  if (TIPOS_DEPENDENTE_COM_MENSALIDADE.has(tipo)) return true;
  if (tipo.startsWith("dependente_")) return false;

  // Compatibilidade com registros antigos que ainda não têm tipo estruturado:
  // só aceitamos cobrança quando a categoria declarar isso expressamente.
  return Boolean(categoria) && categoria.includes("dependente") && /(?:c\s*\/\s*mensalidade|com\s+mensalidade)/.test(categoria);
}

/** Aplica a mesma regra na tela, na prévia e na API de geração. */
export function socioElegivelParaMensalidade(socio: CadastroMensalidade): boolean {
  const matricula = String(socio.matricula ?? "").trim().toUpperCase();
  if (/B$/.test(matricula)) return false;
  if (
    socio.ativo === false ||
    normalizarCategoria(socio.situacao) === "inativo"
  ) {
    return false;
  }

  if (/A$/.test(matricula)) return true;

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
