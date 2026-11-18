import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const financeiro = readFileSync(new URL('lib/financeiroInadimplencia.ts', root), 'utf8');
const relatorio = readFileSync(new URL('app/relatorios/inadimplencia/page.tsx', root), 'utf8');

test('Financeiro calcula competências virtuais desde a associação ou primeiro pagamento', () => {
  assert.match(financeiro, /export function apurarResumoInadimplencia/);
  assert.match(financeiro, /const inicioCadastral = chaveCompetencia\(pessoa\.data_associacao\)/);
  assert.match(financeiro, /const primeiroPago = registros[\s\S]{0,180}\.filter\(mensalidadePaga\)/);
  assert.match(financeiro, /const inicio = inicioCadastral \|\| primeiroPago/);
  assert.match(financeiro, /if \(!temDataAssociacao\) cursor\.setMonth\(cursor\.getMonth\(\) \+ 1\)/);
  assert.match(financeiro, /itens\.some\(mensalidadeQuitadaOuIsenta\)/);
  assert.match(financeiro, /competenciasDevidas\.push\(chave\)/);
});

test('relatório utiliza o resultado único da apuração que preserva a primeira competência paga', () => {
  assert.match(financeiro, /const primeiroPago = registros[\s\S]{0,180}\.filter\(mensalidadePaga\)/);
  assert.match(financeiro, /const inicio = inicioCadastral \|\| primeiroPago/);
  assert.match(relatorio, /fetch\("\/api\/financeiro\/inadimplencia"/);
  assert.match(relatorio, /valor: Number\(item\.valorDevido \|\| 0\)/);
});
