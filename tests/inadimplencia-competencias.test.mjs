import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const financeiro = readFileSync(new URL('app/financeiro/page.tsx', root), 'utf8');
const relatorio = readFileSync(new URL('app/relatorios/inadimplencia/page.tsx', root), 'utf8');

test('Financeiro calcula competências virtuais desde a associação ou primeiro pagamento', () => {
  assert.match(financeiro, /const apuracaoPorPessoa = useMemo/);
  assert.match(financeiro, /const inicioCadastral = chaveCompetencia\(pessoa\.data_associacao\)/);
  assert.match(financeiro, /const primeiroPago = registros[\s\S]{0,180}\.filter\(mensalidadePaga\)/);
  assert.match(financeiro, /const inicio = inicioCadastral \|\| primeiroPago/);
  assert.match(financeiro, /if \(!temDataAssociacao\) cursor\.setMonth\(cursor\.getMonth\(\) \+ 1\)/);
  assert.match(financeiro, /itens\.some\(mensalidadeQuitadaOuIsenta\)/);
  assert.match(financeiro, /competenciasDevidas\.push\(chave\)/);
});

test('relatório de inadimplência usa primeira competência paga quando não há data de associação', () => {
  assert.match(relatorio, /const paidKeys = rowsSocio[\s\S]{0,180}\.filter\(\(m\) => statusPago\(m\)\)/);
  assert.match(relatorio, /let inicio = chaveCompetencia\(socio\.data_associacao\)/);
  assert.match(relatorio, /if \(!inicio\) inicio = paidKeys\[0\] \|\| ""/);
  assert.match(relatorio, /if \(!inicio \|\| !\/\^\\d\{4\}-\\d\{2\}\$\/\.test\(inicio\)\) continue/);
  assert.match(relatorio, /statusQuitadoOuIsento\(m\)/);
});
