import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'app/api/mensalidades/admin/route.ts'), 'utf8');

test('nova baixa ignora somente entradas conciliadas que já foram estornadas', () => {
  assert.match(source, /\.eq\("origem_tipo", "estorno_mensalidade"\)[\s\S]*?\.in\("origem_id", idsParaBaixar\)/);
  assert.match(source, /Estorno da entrada financeira \(\[a-zA-Z0-9-\]\+\)/);
  assert.match(source, /movimentosAtivos\.map\(\(m: MovimentoMensalidadeRow\) => String\(m\.origem_id\)\)/);
  assert.match(source, /A baixa foi interrompida para evitar duplicidade/);
});

test('novo estorno processa apenas entradas ainda não neutralizadas e preserva estornos anteriores', () => {
  assert.match(source, /const movimentosAtivos = \(movimentos \|\| \[\]\)\.filter/);
  assert.match(source, /const pendentes = movimentosAtivos\.filter/);
  assert.match(source, /const conciliados = movimentosAtivos\.filter/);
  assert.doesNotMatch(source, /Esta mensalidade já possui um estorno financeiro registrado/);
});
