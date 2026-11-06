import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dependentesPage = readFileSync(new URL('../app/dependentes/page.tsx', import.meta.url), 'utf8');
const carteirinhasApi = readFileSync(new URL('../app/api/carteirinhas/route.ts', import.meta.url), 'utf8');

test('edição de cadastro sintético socio:<uuid> atualiza socios usando UUID de origem', () => {
  assert.match(dependentesPage, /editando\?\.source_socio_id\s*\|\|\s*\(/);
  assert.match(dependentesPage, /String\(editando\.id\)\.slice\("socio:"\.length\)/);
  assert.match(dependentesPage, /\.from\("socios"\)[\s\S]*?\.eq\("id", idSocioOrigem\)/);
  assert.match(dependentesPage, /const dependenteId = editandoSocio\s*\?\s*idSocioOrigem/);
});

test('API de carteirinhas descarta duplicata com matrícula ou CPF já listado em Sócios', () => {
  assert.match(carteirinhasApi, /const matriculasSocios = new Set/);
  assert.match(carteirinhasApi, /const cpfsSocios = new Set/);
  assert.match(carteirinhasApi, /if \(matricula && matriculasSocios\.has\(matricula\)\) return false/);
  assert.match(carteirinhasApi, /if \(cpf\.length === 11 && cpfsSocios\.has\(cpf\)\) return false/);
  assert.match(carteirinhasApi, /const dependentes = dependentesSemDuplicidade\.map/);
});
