import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const financeiro = readFileSync(new URL('../app/financeiro/page.tsx', import.meta.url), 'utf8');
const relatorio = readFileSync(new URL('../app/relatorios/inadimplencia/page.tsx', import.meta.url), 'utf8');

test('financeiro apura competências distintas e complementa competências não geradas', () => {
  assert.match(financeiro, /const historicoPorPessoa = useMemo/);
  assert.match(financeiro, /data_associacao,tipo_socio,categoria,remido,ativo/);
  assert.match(financeiro, /if \(!inicio\) inicio = pagos\[0\] \|\| ""/);
  assert.match(financeiro, /if \(!existentes\.some\(\(m\) => quitados\.has\(normalizarStatus\(m\.situacao\)\)\)\) adiciona/);
  assert.match(financeiro, /historicoPorPessoa\.get\(p\.chave\)\?\.length/);
});

test('inadimplência virtual aceita competência YYYY-MM e normaliza acentos corretamente', () => {
  assert.match(relatorio, /replace\(\/\[\\u0300-\\u036f\]\/g, ""\)/);
  assert.match(relatorio, /!\/\^\\d\{4\}-\\d\{2\}\$\/\.test\(inicio\)/);
  assert.match(relatorio, /if \(!inicio\) inicio = paidKeys\[0\] \|\| ""/);
});
