import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const financeiro = readFileSync(new URL("../app/financeiro/page.tsx", import.meta.url), "utf8");
const relatorio = readFileSync(new URL("../app/relatorios/inadimplencia/page.tsx", import.meta.url), "utf8");
const endpoint = readFileSync(new URL("../app/api/financeiro/inadimplencia/route.ts", import.meta.url), "utf8");

test("Financeiro e Relatório de Inadimplência consultam o mesmo endpoint de resumo", () => {
  assert.match(financeiro, /apiFinanceiro\("\/api\/financeiro\/inadimplencia"/);
  assert.match(relatorio, /fetch\("\/api\/financeiro\/inadimplencia"/);
  assert.match(endpoint, /apurarResumoInadimplencia\(pessoas, socios, dependentes, mensalidades, hoje\)/);
  assert.match(endpoint, /return NextResponse\.json\(\{ politica, pessoas: resumo \}\)/);
});

test("Relatório apresenta o valor calculado pelo servidor sem uma segunda soma própria", () => {
  assert.match(relatorio, /valor: Number\(item\.valorDevido \|\| 0\)/);
  assert.match(relatorio, /const totalDevido = inadimplentes\.reduce\(\(s, i\) => s \+ i\.valor, 0\)/);
  assert.doesNotMatch(relatorio, /\.from\("mensalidades"\)/);
});
