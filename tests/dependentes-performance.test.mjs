import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const api = readFileSync(new URL('app/api/dependentes/listar/route.ts', root), 'utf8');

test('API de Dependentes mantém paginação integral e busca páginas adicionais em paralelo com limite', () => {
  assert.match(api, /const TAMANHO_PAGINA = 1000/);
  assert.match(api, /const CONCORRENCIA_CONSULTAS = 4/);
  assert.match(api, /const primeira = await consulta\(0, TAMANHO_PAGINA - 1\)/);
  assert.match(api, /const paginas = await Promise\.all\(offsets\.map/);
  assert.match(api, /inicioLote \+= tamanhoLote/);
  assert.match(api, /if \(pagina\.length < TAMANHO_PAGINA\)/);
});

test('sócios, dependentes e política são carregados em conjunto', () => {
  assert.match(api, /const \[politica, socios, dependentesDb\] = await Promise\.all\(\[/);
  assert.match(api, /buscarSocios\(\)/);
  assert.match(api, /buscarDependentes\(\)/);
  assert.match(api, /podeVerFinanceiro \? carregarPolitica\(db\)/);
});

test('resumos financeiros mantêm lotes de 200 sócios e limitam RPCs paralelos', () => {
  assert.match(api, /const TAMANHO_LOTE_SOCIOS = 200/);
  assert.match(api, /const lotes: string\[\]\[\] = \[\]/);
  assert.match(api, /lotes\.slice\(inicioLote, inicioLote \+ CONCORRENCIA_CONSULTAS\)/);
  assert.match(api, /await Promise\.all\([\s\S]{0,300}db\.rpc\("dependentes_resumo_inadimplencia_v2"/);
  assert.match(api, /for \(const resultado of resultados\) resumo\.push\(\.\.\.resultado\)/);
});

test('compatibilidade com bancos sem migrado_para_socio_id continua disponível', () => {
  assert.match(api, /migrado_para_socio_id/i);
  assert.match(api, /const colunasCompatibilidade = colunasDependente\.filter/);
  assert.match(api, /return await consultarTodas<DependenteDb>/);
});

test('regras de vínculo familiar, titular A/B, herança financeira e segurança foram preservadas', () => {
  assert.match(api, /requireRoles\([\s\S]{0,220}menu\.carteirinhas/);
  assert.match(api, /function ehDependenteFamiliarSocio/);
  assert.match(api, /function ehTitular/);
  assert.match(api, /const herdaStatus = ehDependenteFamiliarSocio\(s\) \|\| matricula\.endsWith\("B"\)/);
  assert.match(api, /const titularInativo = normalizar\(titular\?\.situacao\) === "inativo"/);
  assert.match(api, /dependentes: \[\.\.\.dependentes, \.\.\.dependentesFamiliares\]/);
});
