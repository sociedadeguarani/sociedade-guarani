import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const page = readFileSync(new URL('app/financeiro/page.tsx', root), 'utf8');
const route = readFileSync(new URL('app/api/financeiro/route.ts', root), 'utf8');
const dependentes = readFileSync(new URL('app/dependentes/page.tsx', root), 'utf8');

test('Financeiro pagina a lista sem reduzir a base usada nos cálculos', () => {
  assert.match(page, /const movimentosPorPagina = 50/);
  assert.match(page, /movimentosFluxo\.slice\(inicio, inicio \+ movimentosPorPagina\)/);
  assert.match(page, /Os totais e saldos continuam calculados sobre todos os lançamentos/);
  assert.match(page, /movimentosFluxo\s*\.filter\(\(m\) => m\.tipo === "entrada"\)/);
});

test('API Financeiro percorre lotes para não truncar histórico acima de 1.000 registros', () => {
  assert.match(route, /const tamanhoLote = 1000/);
  assert.match(route, /\.range\(inicio, inicio \+ tamanhoLote - 1\)/);
  assert.match(route, /if \(lote\.length < tamanhoLote\) break/);
  assert.match(route, /\.order\("id", \{ ascending: false \}\)/);
});

test('botão de migração manual de cadastros antigos não aparece mais na tela Dependentes', () => {
  assert.doesNotMatch(dependentes, /Corrigir antigos/);
  assert.doesNotMatch(dependentes, /migrarDependentesAntigos/);
});
