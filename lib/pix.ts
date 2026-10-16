/** Chave PIX de celular do Banrisul usada pela Sociedade Guarani. */
export const CHAVE_PIX_BANRISUL = "+5555991817619";
export const CHAVE_PIX_BANRISUL_EXIBICAO = "+55 (55) 99181-7619";

/** Chave CNPJ antiga que estava configurada para a conta anterior. */
export const CHAVE_PIX_LEGADA_CNPJ = "89.649.164/0001-58";

export function ehChavePixLegada(chave: string | null | undefined): boolean {
  return String(chave || "").replace(/\D/g, "") === CHAVE_PIX_LEGADA_CNPJ.replace(/\D/g, "");
}

/** Detecta a chave antiga dentro de um BR Code PIX copia e cola. */
export function codigoPixUsaChaveLegada(copiaECola: string | null | undefined): boolean {
  return String(copiaECola || "").includes(CHAVE_PIX_LEGADA_CNPJ.replace(/\D/g, ""));
}

export function formatarChavePix(chave: string | null | undefined): string {
  const valor = String(chave || "").trim();
  const digitos = valor.replace(/\D/g, "");
  if (digitos === "5555991817619" || digitos === "55991817619") {
    return CHAVE_PIX_BANRISUL_EXIBICAO;
  }
  return valor || CHAVE_PIX_BANRISUL_EXIBICAO;
}
