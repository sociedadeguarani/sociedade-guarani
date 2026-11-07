import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/relatorios/page.tsx', import.meta.url), 'utf8');

test('relatórios carregam os campos de implantação e a data de criação das movimentações', () => {
  assert.match(page, /saldo_base_conta_corrente,saldo_base_aplicado,data_implantacao_saldo/);
  assert.match(page, /conta_destino_id,created_at,tipo/);
});

test('saldo dos relatórios parte da conta corrente e aplicações e só soma movimentos criados após a implantação', () => {
  assert.match(page, /Number\(conta\.saldo_base_conta_corrente \|\| 0\) \+ Number\(conta\.saldo_base_aplicado \|\| 0\)/);
  assert.match(page, /criadoEm <= instanteImplantacao/);
  assert.match(page, /data >= corte/);
  assert.match(page, /mov\.tipo === "transferencia"/);
});

test('saldo final e saldos por banco usam a data final do intervalo com corte inclusivo', () => {
  assert.match(page, /proximoDiaISO\(dataFimCalculo \|\| dataFinal \|\| hojeISO\)/);
  assert.match(page, /const saldoFinal = useMemo/);
  assert.match(page, /const saldo = saldoNaData\(conta, proximoDiaISO/);
});

test('relatório mantém os fluxos do período e identifica a implantação no cartão da conta', () => {
  assert.match(page, /movimentosPeriodoSaldo\.forEach/);
  assert.match(page, /Saldo-base implantado em/);
  assert.match(page, /entradasBanco \+= valor/);
  assert.match(page, /saidasBanco \+= valor/);
});
