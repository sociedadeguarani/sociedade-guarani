import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const painel = readFileSync(new URL('../app/painel/page.tsx', import.meta.url), 'utf8');
const reservas = readFileSync(new URL('../app/api/reservas/route.ts', import.meta.url), 'utf8');
const resumoDependentes = readFileSync(new URL('../app/api/dependentes/resumo/route.ts', import.meta.url), 'utf8');
const paginaDependentes = readFileSync(new URL('../app/dependentes/page.tsx', import.meta.url), 'utf8');

test('painel usa endpoint leve de resumo de dependentes em vez de carregar carteirinhas e histórico financeiro', () => {
  assert.match(painel, /fetch\("\/api\/dependentes\/resumo"/);
  assert.doesNotMatch(painel, /fetch\("\/api\/carteirinhas\?modo=dependentes"/);
});

test('painel conta PIX pendente no banco sem baixar todas as reservas', () => {
  assert.match(painel, /resumo=pix-pendentes/);
  assert.match(reservas, /get\("resumo"\) === "pix-pendentes"/);
  assert.match(reservas, /\.select\("id", \{ count: "exact", head: true \}\)[\s\S]{0,180}\.ilike\("tipo_pagamento", "pix"\)/);
});

test('painel reduz a frequência de atualização e evita ciclos sobrepostos', () => {
  assert.match(painel, /window\.setInterval\(atualizarResumo, 60000\)/);
  assert.match(painel, /if \(tarefasEmAndamento\) return/);
  assert.match(painel, /tarefasEmAndamento = false/);
});

test('totais de dependentes reutilizam mapa de titulares, sem busca linear para cada dependente', () => {
  assert.match(paginaDependentes, /const titular = socioPorId\[String\(dependente\.socio_id\)\]/);
  assert.doesNotMatch(paginaDependentes, /socios\.find\(\(socio\) => String\(socio\.id\) === String\(dependente\.socio_id\)\)/);
});

test('resumo de dependentes exclui registros promovidos e mantém compatibilidade de schema', () => {
  assert.match(resumoDependentes, /migrado_para_socio_id/);
  assert.match(resumoDependentes, /dependentesResult\.error/);
  assert.match(resumoDependentes, /!dependente\.migrado_para_socio_id/);
});


test('tela de dependentes usa API específica e não carrega temporadas/carteirinhas', () => {
  assert.match(paginaDependentes, /fetch\("\/api\/dependentes\/listar"/);
  assert.doesNotMatch(paginaDependentes, /fetch\("\/api\/carteirinhas\?modo=dependentes"/);
});

test('API de dependentes usa resumo agregado no banco para evitar carregar histórico de mensalidades', () => {
  const listarDependentes = readFileSync(new URL('../app/api/dependentes/listar/route.ts', import.meta.url), 'utf8');
  assert.match(listarDependentes, /TAMANHO_PAGINA = 1000/);
  assert.match(listarDependentes, /socios\.filter\(\(s\) => s\.possui_mensalidade === true\)/);
  assert.match(listarDependentes, /db\.rpc\(\"dependentes_resumo_inadimplencia\"/);
  assert.doesNotMatch(listarDependentes, /from\(\"mensalidades\"\)[\s\S]{0,300}\.range\(offset/);
  const sqlResumo = readFileSync(new URL('../docs/sql/07_dependentes_resumo_inadimplencia.sql', import.meta.url), 'utf8');
  assert.match(sqlResumo, /count\(distinct l\.competencia_ref\)/);
  assert.match(sqlResumo, /grant execute on function public\.dependentes_resumo_inadimplencia/);
  assert.match(listarDependentes, /Cache-Control.*private, no-store/);
  assert.doesNotMatch(listarDependentes, /temporadas_participantes/);
});
