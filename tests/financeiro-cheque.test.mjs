import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/financeiro/page.tsx", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/financeiro/route.ts", import.meta.url), "utf8");
const relatorios = readFileSync(new URL("../app/relatorios/page.tsx", import.meta.url), "utf8");

test("Financeiro oferece cheque como forma de pagamento em entradas e saídas", () => {
  assert.match(page, /\[\"cheque\", \"Cheque\"\]/);
  assert.match(page, /value=\"cheque\">Cheque<\/option>/);
  assert.match(page, /fluxoForma, setFluxoForma[\s\S]{0,220}\| \"cheque\"/);
});

test("API Financeiro aceita cheque em movimentações manuais", () => {
  assert.match(route, /FORMAS_PAGAMENTO = new Set\(\[[\s\S]*?\"cheque\"/);
  assert.match(route, /if \(forma && !FORMAS_PAGAMENTO\.has\(forma\)\)/);
});

test("Relatório identifica recebimentos feitos por cheque", () => {
  assert.match(relatorios, /cheque:\s*\"Cheque\"/);
  assert.match(relatorios, /const forma = formaPagamentoLabel\(m\.forma_pagamento\)/);
});
