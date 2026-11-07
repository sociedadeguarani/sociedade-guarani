import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/financeiro/page.tsx', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/financeiro/route.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../docs/sql/09_implantacao_saldos_bancarios.sql', import.meta.url), 'utf8');

test('implantação separa conta corrente e aplicações sem criar movimentação', () => {
  assert.match(page, /Saldo em conta corrente \/ disponível/);
  assert.match(page, /Aplicações \/ investimentos/);
  assert.match(page, /acao: "implantar_saldo_atual"/);
  assert.match(route, /financeiro_implantar_saldo_atual/);
  assert.doesNotMatch(route.slice(route.indexOf('if (acao === "implantar_saldo_atual")'), route.indexOf('if (acao === "salvar_conta")')), /from\("movimentacoes_financeiras"\)\.insert/);
});

test('saldo-base tem histórico auditável e fica protegido por RLS', () => {
  assert.match(migration, /historico_implantacao_saldos_bancarios/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.financeiro_implantar_saldo_atual/);
  assert.match(migration, /saldo_base_conta_corrente/);
  assert.match(migration, /saldo_base_aplicado/);
});

test('saldo atual usa a base implantada e soma movimentações criadas depois', () => {
  assert.match(route, /financeiro_saldos_por_conta_implantados/);
  assert.match(migration, /m\.created_at > c\.data_implantacao_saldo/);
  assert.match(migration, /m\.conta_destino_id = c\.id THEN coalesce\(m\.valor, 0\)/);
  assert.match(migration, /m\.conta_bancaria_id = c\.id THEN -coalesce\(m\.valor, 0\)/);
});

test('contas ainda não implantadas preservam saldo de abertura e regra legada', () => {
  assert.match(migration, /coalesce\(c\.saldo_inicial, 0\)/);
  assert.match(migration, /c\.data_saldo_inicial IS NULL OR m\.data_movimentacao::date > c\.data_saldo_inicial/);
});

