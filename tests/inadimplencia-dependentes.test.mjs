import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sociosApi = readFileSync(new URL('../app/api/socios/route.ts', import.meta.url), 'utf8');
const carteirinhasApi = readFileSync(new URL('../app/api/carteirinhas/route.ts', import.meta.url), 'utf8');
const dependentesPage = readFileSync(new URL('../app/dependentes/page.tsx', import.meta.url), 'utf8');
const sociosPage = readFileSync(new URL('../app/socios/page.tsx', import.meta.url), 'utf8');

test('titular A é contado em Sócios e cônjuge B fica em Dependentes', () => {
  assert.match(sociosApi, /if \(matricula\.endsWith\("A"\)\) return true/);
  assert.match(sociosApi, /if \(matricula\.endsWith\("B"\)\) return false/);
  assert.match(sociosPage, /if \(\/A\$\/\.test\(matricula\)\) return true/);
  assert.match(sociosPage, /if \(\/B\$\/\.test\(matricula\)\) return false/);
});

test('resumo do painel usa a mesma regra de visibilidade da lista Sócios', () => {
  assert.match(sociosApi, /registrosResumo\.filter\(deveExibirNaListaSocios\)/);
  assert.doesNotMatch(sociosApi, /possui_mensalidade\.eq\.true,and\(remido\.eq\.true/);
});

test('histórico financeiro é paginado para não truncar acima de 1.000 lançamentos', () => {
  assert.match(sociosApi, /\.range\(offset, offset \+ 999\)/);
  assert.match(carteirinhasApi, /\.range\(offset, offset \+ 999\)/);
});

test('cônjuge familiar herda situação financeira do titular pela matrícula A/B', () => {
  assert.match(carteirinhasApi, /const ehConjugeFamiliar = matricula\.endsWith\("B"\)/);
  assert.match(carteirinhasApi, /const titularPorMatricula(?:: any)? = ehConjugeFamiliar \? socioPorMatricula\.get\(matriculaTitular\) : null/);
  assert.match(sociosApi, /const ehConjugeFamiliar = matricula\.endsWith\("B"\)/);
  assert.match(sociosApi, /const titularPorMatricula(?:: any)? = ehConjugeFamiliar \? socioPorMatricula\.get\(matriculaTitular\) : null/);
});

test('dependentes de titular inativo são considerados inativos e excluídos da contagem de ativos', () => {
  assert.match(carteirinhasApi, /ativo: d\.ativo !== false && String\(titular\?\.situacao \|\| ""\)\.trim\(\)\.toLowerCase\(\) !== "inativo"/);
  assert.match(dependentesPage, /dependente\.ativo === true && !titularInativo/);
  assert.match(dependentesPage, /\[dependentes, socioPorId\]/);
});

test('o indicador financeiro não assume em dia se o histórico contém competências vencidas', () => {
  assert.match(sociosApi, /atrasos\.get\(alvo\)\?\.size \|\| 0/);
  assert.match(carteirinhasApi, /statusPorMensalidades\(mensalidades, hoje\)/);
  assert.match(carteirinhasApi, /competenciaInformada < hoje\.slice\(0, 7\)/);
});

test('cadastro sem nenhuma mensalidade não é apresentado como em dia', () => {
  assert.match(sociosApi, /sociosComHistorico\.has\(alvo\)[\s\S]{0,150}: "sem_lancamentos"/);
  assert.match(carteirinhasApi, /temHistorico[\s\S]{0,120}: "sem_lancamentos"/);
  assert.match(sociosPage, /Sem mensalidades lançadas/);
  assert.match(dependentesPage, /Sem mensalidades lançadas/);
});

test('lotes de mensalidades são consultados em paralelo para reduzir a lentidão', () => {
  assert.match(sociosApi, /Promise\.all\(lotes\.map\(async \(lote\)/);
  assert.match(carteirinhasApi, /Promise\.all\(lotes\.map\(async \(lote\)/);
});
