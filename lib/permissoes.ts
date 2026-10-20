/**
 * Catálogo central de permissões do Sistema Guarani.
 * As permissões de menu controlam a navegação; as permissões de ação são
 * validadas novamente pelas APIs para impedir acesso direto não autorizado.
 */
export const PERMISSOES_TELAS = [
  ["menu.avisos", "Ver tela: Avisos"],
  ["menu.minhas_mensalidades", "Ver tela: Minhas mensalidades"],
  ["menu.reservas", "Ver tela: Reservas"],
  ["menu.eventos", "Ver tela: Eventos"],
  ["menu.convites", "Ver tela: Convites"],
  ["menu.carteirinhas", "Ver tela: Carteirinhas"],
  ["menu.socios", "Ver tela: Sócios"],
  ["menu.dependentes", "Ver tela: Dependentes"],
  ["menu.mensalidades", "Ver tela: Mensalidades"],
  ["menu.temporadas", "Ver tela: Temporada"],
  ["menu.financeiro", "Ver tela: Financeiro"],
  ["menu.inventario", "Ver tela: Inventário"],
  ["menu.acessos", "Ver tela: Acessos"],
  ["menu.relatorios", "Ver tela: Relatórios"],
  ["menu.usuarios", "Ver tela: Usuários"],
  ["menu.politica_acesso", "Ver tela: Política de acesso"],
] as const;

export const PERMISSOES_ACOES = [
  ["socios.consultar", "Consultar dados de sócios"],
  ["socios.ver_financeiro", "Ver informações financeiras de sócios"],
  ["socios.ver_exame_medico", "Ver validade do exame médico"],
  ["propria.mensalidade", "Consultar mensalidades próprias"],
  ["propria.reservas", "Gerenciar reservas próprias"],
  ["convites.comprar", "Comprar convites"],
  ["inventario.consultar", "Consultar itens e empréstimos do inventário"],
  ["inventario.cadastrar", "Cadastrar itens no inventário"],
  ["inventario.editar", "Editar itens do inventário"],
  ["inventario.emprestar", "Registrar empréstimos do inventário"],
  ["inventario.vincular_associado", "Vincular associado a empréstimo"],
  ["inventario.devolver", "Registrar devoluções do inventário"],
] as const;

export const PERMISSOES = [...PERMISSOES_TELAS, ...PERMISSOES_ACOES] as const;
export const CHAVES_PERMISSOES = ["administracao.tudo", ...PERMISSOES.map(([chave]) => chave)] as const;

export type RegistroPermissao = {
  chave: string;
  permitido: boolean;
};

const CHAVES_ADMIN = new Set<string>(["menu.usuarios"]);

function normalizarPerfilPermissoes(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "_");
}

export function codigoPerfilPermissoes(value: unknown): string {
  const perfil = normalizarPerfilPermissoes(value);
  if (["administrador_master", "master"].includes(perfil) || perfil.includes("administrador_master")) {
    return "administrador_master";
  }
  if (["administrador", "admin", "administrador_normal"].includes(perfil)) return "administrador";
  if (perfil.includes("funcionario") && perfil.includes("inventario")) return "funcionario_inventario";
  if (["funcionario", "funcionario_padrao"].includes(perfil)) return "funcionario";
  if (perfil === "associado") return "associado";
  return perfil;
}

const TODAS_AS_TELAS = PERMISSOES_TELAS.map(([chave]) => chave);
const TODAS_AS_ACOES = PERMISSOES_ACOES.map(([chave]) => chave);

const PADROES: Record<string, string[]> = {
  administrador_master: [...CHAVES_PERMISSOES],
  administrador: [
    ...TODAS_AS_TELAS.filter((chave) => !CHAVES_ADMIN.has(chave)),
    ...TODAS_AS_ACOES,
    "administracao.tudo",
  ],
  funcionario: [
    "menu.avisos", "menu.reservas", "menu.eventos", "menu.convites",
    "menu.carteirinhas", "menu.socios", "menu.dependentes", "menu.inventario", "menu.acessos",
    "socios.consultar", "socios.ver_financeiro", "socios.ver_exame_medico",
    "propria.mensalidade", "propria.reservas", "convites.comprar", "inventario.consultar", "inventario.emprestar", "inventario.vincular_associado", "inventario.devolver",
  ],
  funcionario_inventario: [
    // O perfil de inventário pode ver os avisos destinados à equipe e gerenciar
    // o inventário. Carteirinhas permanecem opcionais por conterem dados
    // médicos e financeiros; o Administrador Master pode liberá-las se precisar.
    "menu.avisos", "menu.inventario", "inventario.consultar", "inventario.cadastrar",
    "inventario.editar", "inventario.emprestar", "inventario.vincular_associado", "inventario.devolver",
  ],
  associado: [
    "menu.avisos", "menu.minhas_mensalidades", "menu.reservas", "menu.eventos",
    "menu.convites", "menu.carteirinhas", "socios.ver_financeiro", "socios.ver_exame_medico", "propria.mensalidade", "propria.reservas", "convites.comprar",
  ],
};

export function permissoesPadraoPerfil(perfil: unknown): string[] {
  return [...(PADROES[codigoPerfilPermissoes(perfil)] || [])];
}

/**
 * Migra permissões antigas (que não tinham chaves menu.*) sem perder acesso.
 * A partir do momento que existem registros menu.*, a seleção passa a ser
 * explícita: permissões desmarcadas permanecem desmarcadas.
 */
export function permissoesEfetivas(
  perfil: unknown,
  registros: readonly RegistroPermissao[] = []
): string[] {
  const codigo = codigoPerfilPermissoes(perfil);
  if (codigo === "administrador_master") return [...CHAVES_PERMISSOES];

  // Compatibilidade por chave: usuários antigos podem ter registros de menu,
  // mas ainda não possuir as novas permissões de ação (ex.: inventario.consultar).
  // Para cada chave, um registro explícito vence o padrão do perfil; chaves
  // ausentes continuam herdando o padrão. A tela de Usuários grava todas as
  // chaves quando o Master salva uma configuração individual.
  const padroes = new Set(permissoesPadraoPerfil(codigo));
  const salvas = new Map<string, boolean>();
  for (const registro of registros) {
    if ((CHAVES_PERMISSOES as readonly string[]).includes(registro.chave)) {
      salvas.set(registro.chave, registro.permitido === true);
    }
  }

  const efetivas = new Set<string>();
  for (const chave of CHAVES_PERMISSOES) {
    const permitido = salvas.has(chave) ? salvas.get(chave) === true : padroes.has(chave);
    if (permitido) efetivas.add(chave);
  }

  // Usuários que não são Master nunca recebem o módulo de gestão de usuários
  // apenas por um registro antigo ou por uma chamada manual à API.
  efetivas.delete("menu.usuarios");
  return [...efetivas];
}

export function permissoesValidas(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string =>
    typeof value === "string" && (CHAVES_PERMISSOES as readonly string[]).includes(value)
  ))];
}
