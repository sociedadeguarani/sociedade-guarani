import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  construirPessoasFinanceiras,
  apurarResumoInadimplencia,
} from "../lib/financeiroInadimplencia.ts";

function socio(overrides = {}) {
  return {
    id: "socio-1",
    matricula: "100A",
    nome: "Associado Teste",
    cpf: null,
    foto_url: null,
    situacao: "ativo",
    ativo: true,
    responsavel_id: null,
    possui_mensalidade: true,
    valor_mensalidade: 100,
    dia_vencimento: 10,
    tipo_pagamento: "pix",
    data_associacao: "2025-01-05",
    remido: false,
    tipo_socio: "Sócio Contribuinte",
    categoria: "Sócio Contribuinte",
    ...overrides,
  };
}

function mensalidade(overrides = {}) {
  return {
    id: "mensalidade-1",
    socio_id: "socio-1",
    dependente_id: null,
    competencia: "2025-01-01",
    valor: 100,
    data_vencimento: "2025-01-10",
    situacao: "pendente",
    data_pagamento: null,
    ...overrides,
  };
}

function resumoUnico(socios, dependentes, mensalidades, hoje = "2025-03-15") {
  const pessoas = construirPessoasFinanceiras(socios, dependentes);
  return apurarResumoInadimplencia(pessoas, socios, dependentes, mensalidades, hoje);
}

test("a lista inclui apenas sócios e dependentes ativos com mensalidade própria", () => {
  const socios = [
    socio({ id: "regular" }),
    socio({ id: "inativo", ativo: false }),
    socio({ id: "remido", remido: true }),
    socio({ id: "temporario", tipo_socio: "Sócio Temporada" }),
    socio({ id: "sem-mensalidade", possui_mensalidade: false }),
  ];
  const dependentes = [{
    id: "dep-ativo", socio_id: "regular", nome: "Dependente", cpf: null,
    ativo: true, possui_mensalidade: true, valor_mensalidade: 80,
    dia_vencimento: 10, tipo_pagamento: "pix",
  }, {
    id: "dep-inativo", socio_id: "regular", nome: "Dependente Inativo", cpf: null,
    ativo: false, possui_mensalidade: true, valor_mensalidade: 80,
    dia_vencimento: 10, tipo_pagamento: "pix",
  }];

  const pessoas = construirPessoasFinanceiras(socios, dependentes);
  assert.deepEqual(pessoas.map((pessoa) => pessoa.chave), ["socio:regular", "dependente:dep-ativo"]);
});

test("data de associação permite cobrar a competência de entrada e sintetizar as faltantes", () => {
  const associado = socio();
  const registros = [mensalidade({ situacao: "pago" })];

  const [resultado] = resumoUnico([associado], [], registros);
  assert.equal(resultado.meses, 2);
  assert.equal(resultado.valorDevido, 200);
  assert.deepEqual(resultado.competencias, ["03/2025", "02/2025"]);
});

test("associação depois do dia de vencimento começa a cobrança no mês seguinte", () => {
  const associado = socio({ data_associacao: "2025-01-20" });
  const [resultado] = resumoUnico([associado], [], []);

  assert.equal(resultado.meses, 2);
  assert.equal(resultado.valorDevido, 200);
  assert.deepEqual(resultado.competencias, ["03/2025", "02/2025"]);
});

test("sem data de associação, a primeira competência paga é referência e não é cobrada", () => {
  const associado = socio({ data_associacao: null });
  const registros = [mensalidade({ situacao: "pago", data_pagamento: "2025-01-10" })];
  const [resultado] = resumoUnico([associado], [], registros);

  assert.equal(resultado.meses, 2);
  assert.equal(resultado.valorDevido, 200);
  assert.deepEqual(resultado.competencias, ["03/2025", "02/2025"]);
});

test("sem data ou pagamento de referência, considera somente lançamentos reais vencidos e agrupa pelo maior valor", () => {
  const associado = socio({ data_associacao: null });
  const registros = [
    mensalidade({ id: "jan-1", competencia: "2025-01", valor: 70 }),
    mensalidade({ id: "jan-2", competencia: "2025-01", valor: 90 }),
    mensalidade({ id: "fev-isenta", competencia: "2025-02", valor: 120, situacao: "isenta" }),
  ];
  const [resultado] = resumoUnico([associado], [], registros);

  assert.equal(resultado.meses, 1);
  assert.equal(resultado.valorDevido, 90);
  assert.deepEqual(resultado.competencias, ["01/2025"]);
});

test("histórico antigo de dependente é atribuído ao sócio atual pelo CPF", () => {
  const titular = socio({
    id: "titular", nome: "Titular", matricula: "100A",
    possui_mensalidade: false, data_associacao: null, cpf: "11111111111",
  });
  const socioMigrado = socio({
    id: "migrado", nome: "Dependente Migrado", matricula: "100C",
    responsavel_id: "titular", cpf: "22233344455",
    data_associacao: "2025-01-05", valor_mensalidade: 120,
  });
  const dependenteAntigo = {
    id: "dep-antigo", socio_id: "titular", nome: "Dependente Antigo",
    cpf: "222.333.444-55", ativo: true, possui_mensalidade: true,
    valor_mensalidade: 80, dia_vencimento: 10, tipo_pagamento: "pix",
  };
  const registroAntigo = mensalidade({
    id: "registro-migrado",
    socio_id: "titular",
    dependente_id: "dep-antigo",
    competencia: "2025-02",
    valor: 175,
    data_vencimento: "2025-02-10",
  });

  const resultados = resumoUnico([titular, socioMigrado], [dependenteAntigo], [registroAntigo]);
  const migrado = resultados.find((item) => item.pessoa.chave === "socio:migrado");

  assert.ok(migrado);
  assert.equal(migrado.meses, 3);
  assert.equal(migrado.valorDevido, 415);
  assert.deepEqual(migrado.competencias, ["03/2025", "02/2025", "01/2025"]);
  assert.equal(resultados.some((item) => item.pessoa.chave === "dependente:dep-antigo"), false);
});

test("endpoint é restrito a administradores e pagina o histórico no servidor", () => {
  const api = readFileSync(new URL("../app/api/financeiro/inadimplencia/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/financeiro/page.tsx", import.meta.url), "utf8");

  assert.match(api, /requireRoles\(request, \["administrador"\]\)/);
  assert.match(api, /select\(colunas, \{ count: "exact" \}\)/);
  assert.match(api, /\.range\(offset, Math\.min\(offset \+ TAMANHO_PAGINA - 1, total - 1\)\)/);
  assert.match(api, /Promise\.all\(offsets\.map/);
  assert.match(api, /apurarResumoInadimplencia\(/);
  assert.match(api, /return NextResponse\.json\(\{ politica, pessoas: resumo \}\)/);
  assert.match(page, /apiFinanceiro\("\/api\/financeiro\/inadimplencia"/);
  assert.doesNotMatch(page, /\.from\("mensalidades"\)/);
  assert.doesNotMatch(page, /buscarMensalidadesPaginadas/);
});
