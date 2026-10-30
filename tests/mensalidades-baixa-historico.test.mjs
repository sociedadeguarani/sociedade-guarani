import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/mensalidades/page.tsx', import.meta.url), 'utf8');

test('histórico anual permite selecionar múltiplas competências em aberto para baixa em lote', () => {
  assert.match(page, /mesesHistoricoSelecionadosBaixa/);
  assert.match(page, /Baixar meses do histórico|baixarMesesDoHistorico/);
  assert.match(page, /ids: registros\.map\(\(item\) => item\.id\)/);
  assert.match(page, /Dar baixa em \$\{mesesHistoricoSelecionadosBaixa\.length\} mês\(es\)/);
});

test('histórico não exige geração manual para registrar pagamento da competência vigente', () => {
  assert.doesNotMatch(page, /Gerar mensalidade do mês vigente/);
  assert.doesNotMatch(page, /A mensalidade do mês vigente ainda não foi gerada/);
  assert.match(page, /Preparando cobrança automaticamente/);
});
