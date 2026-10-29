import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/api/carteirinhas/route.ts', import.meta.url), 'utf8');

test('cônjuge familiar herda situação financeira do titular mesmo com flag legada incorreta', () => {
  assert.match(route, /const ehConjugeFamiliar = matricula\.endsWith\("B"\)/);
  assert.match(route, /s\.possui_mensalidade !== true \|\| ehConjugeFamiliar/);
});

test('dependente sem titular localizado não é apresentado falsamente como em dia', () => {
  assert.match(route, /financeiro_status: "restrito", dias_atraso: 0/);
});
