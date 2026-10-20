import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'app/inventario/page.tsx'), 'utf8');
const route = fs.readFileSync(path.join(root, 'app/api/inventario/route.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'docs/sql/05_inventario_dependentes.sql'), 'utf8');

test('a busca de empréstimo inclui pessoas da tabela de dependentes', () => {
  assert.match(route, /from\("dependentes"\)\.select\("id,socio_id,nome,matricula,ativo"\)/);
  assert.match(route, /tipo_pessoa: "dependente"/);
  assert.match(route, /dependentes \|\| \[\]/);
  assert.match(page, /Dependente de \{s\.titular_nome/);
});

test('empréstimos de dependentes mantêm o titular e guardam o dependente separadamente', () => {
  assert.match(page, /dependente_id:s\.dependente_id \|\| ""/);
  assert.match(route, /String\(dependente\.socio_id\) !== String\(body\.socio_id\)/);
  assert.match(route, /registrar_emprestimo_inventario_com_dependente/);
  assert.match(route, /dependente_id,quantidade,data_emprestimo/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS dependente_id uuid/);
  assert.match(migration, /FOREIGN KEY \(dependente_id\)/);
});

test('o histórico mostra o dependente que retirou o item, sem quebrar empréstimos antigos', () => {
  assert.match(route, /emprestimo\.dependente_id/);
  assert.match(page, /e\.dependente\?\.nome \|\| e\.socio\?\.nome/);
  assert.match(migration, /ON DELETE SET NULL/);
});
