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

test('histórico permite gerar apenas a mensalidade vigente ausente para o associado selecionado', () => {
  assert.match(page, /Gerar mensalidade do mês vigente/);
  assert.match(page, /socio_ids: \[String\(socioSelecionado\.socio_id\)\]/);
  assert.match(page, /historicoPorMes\.has\(mesAtual\)/);
});
