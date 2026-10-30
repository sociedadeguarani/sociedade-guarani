import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const rotaCorreta = new URL('../app/acessos/qr/[id]/page.tsx', import.meta.url);
const rotaComEspaco = new URL('../app/acessos/qr/[id] /page.tsx', import.meta.url);

test('página de validação QR usa segmento dinâmico válido do App Router', () => {
  assert.equal(existsSync(rotaCorreta), true, 'deve existir app/acessos/qr/[id]/page.tsx');
  assert.equal(existsSync(rotaComEspaco), false, 'não deve permanecer a pasta antiga com espaço');
});
