import type { Categoria, Espaco } from "./types";

export const HORARIOS = [
  "08:00 - 09:00",
  "09:00 - 10:00",
  "10:00 - 11:00",
  "18:00 - 19:00",
  "19:00 - 20:00",
  "20:00 - 21:00",
  "21:00 - 22:00",
];

export const moeda = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBR = (v: string) => (v ? v.split("-").reverse().join("/") : "—");

export function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizarEspaco(row: Record<string, unknown>): Espaco {
  const categoriaBruta = normalizarTexto(
    row.categoria ?? row.categoria_espaco ?? row.tipo,
  );
  const nome = String(row.nome ?? "").trim();

  let categoria: Categoria = "lazer";
  if (categoriaBruta.includes("esport") || categoriaBruta.includes("quadra") || categoriaBruta.includes("cancha") || normalizarTexto(nome).includes("quadra") || normalizarTexto(nome).includes("cancha")) {
    categoria = "esporte";
  } else if (
    categoriaBruta.includes("event") ||
    categoriaBruta.includes("salao") ||
    categoriaBruta.includes("salão") ||
    normalizarTexto(nome).includes("salao")
  ) {
    categoria = "eventos";
  }

  const cobrancaBruta = normalizarTexto(
    row.cobranca ??
      row.tipo_cobranca ??
      row.unidade_cobranca ??
      row.forma_cobranca ??
      row.tipo,
  );
  const nomeNormalizado = normalizarTexto(nome);
  const cobranca: "hora" | "diaria" =
    cobrancaBruta.includes("diar") || cobrancaBruta.includes("dia") ||
    nomeNormalizado.includes("quiosque") || nomeNormalizado.includes("salao")
      ? "diaria"
      : "hora";

  const precoBase = Number(
    cobranca === "diaria" ? row.preco_diaria ?? row.valor_diaria : row.preco_hora ?? row.valor_hora,
  );

  const precoSocio = Number(
    row.preco_socio ??
      row.valor_socio ??
      row.preco_associado ??
      row.valor_associado ??
      row.preco ??
      row.valor ??
      (Number.isFinite(precoBase) ? precoBase : 0),
  ) || 0;

  const precoNaoSocio = Number(
    row.preco_nao_socio ??
      row.valor_nao_socio ??
      row.preco_nao_associado ??
      row.valor_nao_associado ??
      0,
  ) || 0;

  const permiteNaoSocio = Boolean(
    row.permite_nao_socio ?? row.permiteNaoSocio ?? row.nao_socio_permitido ?? precoNaoSocio > 0,
  );

  return {
    id: String(row.id ?? ""),
    nome,
    categoria,
    cobranca,
    precoSocio,
    precoNaoSocio,
    permiteNaoSocio: permiteNaoSocio && precoNaoSocio > 0,
    capacidade: row.capacidade == null ? undefined : String(row.capacidade),
  };
}
