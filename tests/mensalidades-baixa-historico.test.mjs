import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/mensalidades/page.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../app/api/mensalidades/admin/route.ts', import.meta.url), 'utf8');

test('histórico anual permite selecionar múltiplas competências em aberto para baixa em lote', () => {
  assert.match(page, /mesesHistoricoSelecionadosBaixa/);
  assert.match(page, /Baixar meses do histórico|baixarMesesDoHistorico/);
  assert.match(page, /ids: registros\.map\(\(item\) => item\.id\)/);
  assert.match(page, /Dar baixa em \$\{mesesHistoricoSelecionadosBaixa\.length\} mês\(es\)/);
});

test('mensalidades são preparadas automaticamente e não exigem botão de geração', () => {
  assert.match(page, /mensalidades são criadas automaticamente/);
  assert.doesNotMatch(page, /Gerar mensalidade do mês vigente/);
  assert.doesNotMatch(page, /Gerar selecionadas/);
});

test('competências futuras podem ser preparadas para pagamento antecipado', () => {
  assert.match(page, /body: JSON\.stringify\(\{ acao: \"gerar\", ano, mes: mesItem \}\)/);
  assert.doesNotMatch(api, /Não é permitido gerar mensalidades de meses futuros/);
});
