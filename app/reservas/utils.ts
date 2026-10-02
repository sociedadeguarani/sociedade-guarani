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

const PRECO_PADRAO: Array<{ aliases: string[]; socio: number; naoSocio: number; permiteNaoSocio: boolean }> = [
  { aliases: ["quadra de futebol", "quadra futebol", "quadra futebol 7", "futebol"], socio: 100, naoSocio: 0, permiteNaoSocio: false },
  { aliases: ["quadra de volei", "volei"], socio: 50, naoSocio: 0, permiteNaoSocio: false },
  { aliases: ["quadra de areia", "quadra areia", "areia"], socio: 30, naoSocio: 0, permiteNaoSocio: false },
  { aliases: ["cancha 48", "quadra 48", "48"], socio: 20, naoSocio: 0, permiteNaoSocio: false },
  { aliases: ["quiosque 1", "quiosque a", "quiosque a"], socio: 80, naoSocio: 0, permiteNaoSocio: false },
  { aliases: ["quiosque 2", "quiosque b", "quiosque b"], socio: 80, naoSocio: 0, permiteNaoSocio: false },
  { aliases: ["quiosque 3", "quiosque c", "quiosque c"], socio: 80, naoSocio: 0, permiteNaoSocio: false },
  { aliases: ["salao pequeno de vidro", "salao social pequeno", "salão pequeno de vidro", "salão social pequeno"], socio: 300, naoSocio: 600, permiteNaoSocio: true },
  { aliases: ["salao social grande", "salão social grande"], socio: 900, naoSocio: 1800, permiteNaoSocio: true },
  { aliases: ["salao ctg", "salão ctg", "ctg"], socio: 80, naoSocio: 0, permiteNaoSocio: false },
];

function precoPadraoPorNome(nome: string) {
  const n = normalizarTexto(nome);
  return PRECO_PADRAO.find((item) => item.aliases.some((alias) => n === normalizarTexto(alias) || n.includes(normalizarTexto(alias)))) || null;
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
  const padrao = precoPadraoPorNome(nome);

  const precoSocioSalvo = Number(row.preco_socio ?? row.valor_socio ?? row.preco_associado ?? row.valor_associado ?? 0);
  const precoSocio = precoSocioSalvo > 0
    ? precoSocioSalvo
    : (Number.isFinite(precoBase) && precoBase > 0 ? precoBase : padrao?.socio ?? 0);

  const precoNaoSocioSalvo = Number(row.preco_nao_socio ?? row.valor_nao_socio ?? row.preco_nao_associado ?? row.valor_nao_associado ?? 0);
  const precoNaoSocio = precoNaoSocioSalvo > 0 ? precoNaoSocioSalvo : (padrao?.naoSocio ?? 0);

  const permissaoSalva = row.permite_nao_socio ?? row.permiteNaoSocio ?? row.nao_socio_permitido;
  const permiteNaoSocio = permissaoSalva == null
    ? (precoNaoSocio > 0 || Boolean(padrao?.permiteNaoSocio))
    : Boolean(permissaoSalva);

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
