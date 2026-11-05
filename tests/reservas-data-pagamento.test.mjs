import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const reservas = readFileSync(new URL("../app/api/reservas/route.ts", import.meta.url), "utf8");

test("movimentação de reserva usa a data real do recebimento, não a data da reserva", () => {
  assert.match(reservas, /data_movimentacao:\s*dataRecebimento/);
  assert.doesNotMatch(reservas, /data_movimentacao:\s*typeof normalizada\.data/);
});

test("data da reserva permanece identificada na descrição do lançamento", () => {
  assert.match(reservas, /descricao:\s*`Reserva - \$\{String\(normalizada\.nome \|\| "Responsável"\)\}\$\{normalizada\.data \?/);
});

test("recebimento em dinheiro registra a data brasileira do pagamento e aguarda conciliação", () => {
  assert.match(reservas, /const dataRecebimento = dataHojeBrasil\(\);[\s\S]{0,180}registrarFinanceiro\(db, reserva, contaBancariaId, auth\.usuario\.id, "dinheiro", dataRecebimento\)/);
  assert.match(reservas, /const conciliado = formaPagamento === "pix"/);
  assert.match(reservas, /data_conciliacao:\s*conciliado \? new Date\(\)\.toISOString\(\) : null/);
});

test("PIX só é lançado após confirmação administrativa do crédito e usa a data do recebimento", () => {
  assert.match(reservas, /const dataRecebimento = dataHojeBrasil\(\);[\s\S]{0,380}data_pagamento:\s*dataRecebimento/);
  assert.match(reservas, /registrarFinanceiro\(db, atualizada, contaBancariaId, auth\.usuario\.id, "pix", dataRecebimento\)/);
});

test("edição com recebimento em dinheiro registra a data do pagamento sem modificar o histórico anterior", () => {
  assert.match(reservas, /registrarFinanceiro\(db, atualizada, contaBancariaId, auth\.usuario\.id, "dinheiro", dataRecebimento\)/);
  assert.match(reservas, /update\(\{ data_pagamento: dataRecebimento \}\)\.eq\("id", id\)/);
});
