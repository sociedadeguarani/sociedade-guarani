import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function handlerBlocks(source) {
  return source.split(/export\s+async\s+function\s+/).slice(1).map((block) => block.split(/\n}\s*(?:\n|$)/, 1)[0]);
}

test('nenhum componente client-side contém uso explícito da chave service role', () => {
  const appRoot = path.join(root, 'app');
  const files = [];
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (/\.(?:tsx|ts|jsx|js)$/.test(item.name)) files.push(full);
    }
  };
  walk(appRoot);

  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const hasClientDirective = /^\s*["']use client["']\s*;/m.test(source);
    if (hasClientDirective && /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/i.test(source)) {
      offenders.push(path.relative(root, file));
    }
  }
  assert.deepEqual(offenders, [], `Chave privilegiada referenciada em componentes client: ${offenders.join(', ')}`);
});

test('todas as ações de gerenciamento de usuários exigem Administrador Master', () => {
  const source = read('app/api/usuarios/route.ts');
  const blocks = handlerBlocks(source);
  assert.equal(blocks.length, 4, 'O teste deve cobrir GET, POST, PATCH e DELETE');
  for (const block of blocks) {
    assert.match(block, /somenteMaster\(request\)/, 'Handler de usuários sem validação de Administrador Master');
  }
});

test('operações administrativas críticas mantêm validação de sessão e perfil', () => {
  const checks = [
    ['app/api/temporadas/route.ts', /const auth = await autenticar\(request\)/],
    ['app/api/mensalidades/admin/route.ts', /exigirAdministrador\(request\)/],
    ['app/api/financeiro/route.ts', /requireRoles\(request/],
    ['app/api/configuracao-pix/route.ts', /exigirAdministrador\(request\)/],
    ['app/api/carteirinhas/route.ts', /requireRoles\(request/],
    ['app/api/relatorios/reservas/route.ts', /requireRoles\(request/],
  ];
  for (const [file, guard] of checks) assert.match(read(file), guard, `${file} não parece exigir autorização`);
});

test('rota QR delega à rota principal de acessos em vez de liberar entrada sozinha', () => {
  const source = read('app/api/acessos/qr/route.ts');
  assert.match(source, /POST as registrarAcesso.*from ["']\.\.\/route["']/);
  assert.match(source, /registrarAcesso\(new Request/);
});

test('a chave service role é lida somente do ambiente de servidor', () => {
  const source = read('lib/guaraniAuth.ts');
  assert.match(source, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
});


test('lançamentos financeiros têm proteção de concorrência no código', () => {
  const mensalidades = read('app/api/mensalidades/admin/route.ts');
  assert.match(mensalidades, /\.in\("situacao",\s*\["em_aberto",\s*"em_atraso"\]\)/,
    'A baixa mensal precisa atualizar apenas cobranças ainda abertas');

  const reservas = read('app/api/reservas/route.ts');
  assert.match(reservas, /String\(\(error as \{ code\?: string \}\)\.code \|\| ""\) === "23505"/,
    'A reserva deve reconhecer disputa de inserção por índice único');

  const temporadas = read('app/api/temporadas/route.ts');
  assert.match(temporadas, /String\(\(error as \{ code\?: string \}\)\.code \|\| ""\) === "23505"/,
    'A parcela de temporada deve tratar conflito de inserção duplicada');

  const eventos = read('app/api/eventos/vendas/route.ts');
  assert.match(eventos, /String\(\(movimentoError as \{ code\?: string \}\)\.code \|\| ""\) !== "23505"/,
    'A venda do evento deve confirmar a movimentação concorrente');
});

test('rotas de API recebem cabeçalho privado sem cache', () => {
  const source = read('next.config.ts');
  assert.match(source, /source:\s*["']\/api\/:path\*["']/);
  assert.match(source, /Cache-Control.*private, no-store, max-age=0/);
  assert.match(source, /X-Content-Type-Options.*nosniff/);
});


test('migração de idempotência protege origens críticas sem apagar dados', () => {
  const migration = read('docs/sql/02_protecao_duplicidade_financeira.sql');
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS ux_movimentacoes_origem_idempotente/);
  assert.match(migration, /RAISE EXCEPTION/);
  assert.doesNotMatch(migration, /DELETE\s+FROM/i, 'Migração de proteção não deve apagar lançamentos');
  assert.doesNotMatch(migration, /tarifa_mensalidade/, 'Tarifas requerem regra própria antes de impor unicidade');
});

test('trilha de auditoria financeira tem RLS e snapshots antes/depois', () => {
  const audit = read('docs/sql/03_auditoria_movimentacoes_financeiras.sql');
  assert.match(audit, /ENABLE ROW LEVEL SECURITY/);
  assert.match(audit, /REVOKE ALL ON TABLE[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(audit, /AFTER INSERT OR UPDATE OR DELETE ON public\.movimentacoes_financeiras/);
  assert.match(audit, /dados_antes/);
  assert.match(audit, /dados_depois/);
});

