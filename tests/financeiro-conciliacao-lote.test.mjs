import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const financeiro = readFileSync(new URL("../app/financeiro/page.tsx", import.meta.url), "utf8");
const apiFinanceiro = readFileSync(new URL("../app/api/financeiro/route.ts", import.meta.url), "utf8");

test("Financeiro permite selecionar lançamentos pendentes individualmente e por página", () => {
  assert.match(financeiro, /Selecionar pendentes desta página/);
  assert.match(financeiro, /checked={idsMovimentosSelecionadosConciliacao\.includes\(m\.id\)}/);
  assert.match(financeiro, /!m\.conciliado\s*\?/);
});

test("conciliação em lote mostra quantidade e total antes de confirmar", () => {
  assert.match(financeiro, /Conciliar selecionados/);
  assert.match(financeiro, /totalSelecionadoConciliacao/);
  assert.match(financeiro, /O sistema não consulta o banco automaticamente/);
  assert.match(financeiro, /acao:\s*"conciliar_movimentos"/);
});

test("API de conciliação em lote valida limite, preserva auditoria e atualiza apenas pendentes", () => {
  assert.match(apiFinanceiro, /acao === "conciliar_movimentos"/);
  assert.match(apiFinanceiro, /ids\.length > 100/);
  assert.match(apiFinanceiro, /CONCILIACAO_BANCARIA/);
  assert.match(apiFinanceiro, /\.eq\("conciliado", false\)/);
  assert.match(apiFinanceiro, /movimentos:\s*movimentosAtualizados/);
});
