import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api = readFileSync(new URL('../app/api/socios/route.ts', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../docs/sql/14_socios_resumo_inadimplencia.sql', import.meta.url), 'utf8');

test('API de Sócios usa resumo agregado no banco e mantém fallback legado', () => {
  assert.match(api, /db\.rpc\("socios_resumo_inadimplencia_v1"/);
  assert.match(api, /p_socio_ids:\s*lote/);
  assert.match(api, /p_hoje:\s*hoje/);
  assert.match(api, /if \(error \|\| pagina\.length !== lote\.length\)/);
  assert.match(api, /resumoRpcDisponivel/);
  assert.match(api, /agruparAtrasos\(/);
  assert.match(api, /\.range\(offset, offset \+ 999\)/);
});

test('resumo SQL preserva a regra da primeira mensalidade efetivamente paga', () => {
  assert.match(sql, /primeira_competencia_paga AS/);
  assert.match(sql, /s\.data_associacao IS NULL/);
  assert.match(sql, /'pago', 'paga', 'paid', 'quitado'/);
  assert.match(sql, /data_associacao_efetiva/);
  assert.match(sql, /competencia_associacao/);
  assert.match(sql, /competencia_associacao IS NULL/);
  assert.match(sql, /dia_vencimento/);
});

test('resumo SQL preserva vencimento legado sem data e protege a função por service_role', () => {
  assert.match(sql, /COALESCE\([\s\S]{0,100}m\.data_vencimento::date[\s\S]{0,250}TO_DATE/);
  assert.match(sql, /COUNT\(DISTINCT l\.competencia_ref\)/);
  assert.match(sql, /possui_lancamentos/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.socios_resumo_inadimplencia_v1/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.socios_resumo_inadimplencia_v1[\s\S]{0,120}TO service_role/);
});
