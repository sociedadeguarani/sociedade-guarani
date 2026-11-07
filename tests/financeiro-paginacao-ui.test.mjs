import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const page = readFileSync(new URL('app/financeiro/page.tsx', root), 'utf8');
const route = readFileSync(new URL('app/api/financeiro/route.ts', root), 'utf8');
const dependentes = readFileSync(new URL('app/dependentes/page.tsx', root), 'utf8');

test('Financeiro pagina a lista sem reduzir a base usada nos cálculos', () => {
  assert.match(page, /const movimentosPorPagina = 50/);
  assert.match(page, /setTotalMovimentosFiltrados\(Number\(result\.total_count \|\| 0\)\)/);
  assert.match(page, /setTotaisFinanceiroServidor/);
  assert.match(page, /setSaldosFinanceiroServidor/);
  assert.match(page, /page_size: String\(movimentosPorPagina\)/);
  assert.match(page, /const movimentosVisiveis = movimentosFluxo/);
});

test('API Financeiro consulta página e agregados no PostgreSQL sem baixar o histórico completo', () => {
  assert.match(route, /supabase\.rpc\(\"financeiro_listar_paginado\"/);
  assert.match(route, /p_page_size: pageSize/);
  assert.match(route, /total_count: Number\(resumo\?\.total_count/);
  assert.match(route, /financeiro_saldos_por_conta_implantados/);
  assert.match(route, /saldos_por_conta: \(saldosImplantados \|\| resumo\?\.saldos_por_conta/);
  assert.doesNotMatch(route, /const tamanhoLote = 1000/);
});

test('botão de migração manual de cadastros antigos não aparece mais na tela Dependentes', () => {
  assert.doesNotMatch(dependentes, /Corrigir antigos/);
  assert.doesNotMatch(dependentes, /migrarDependentesAntigos/);
});

test('aba Aluguéis inclui recebimentos originados de reservas e lançamentos categorizados como aluguel', () => {
  assert.match(page, /function ehMovimentoDeAluguel/);
  assert.match(page, /origem_tipo\s*\|\|\s*""\)\.toLowerCase\(\) === "reserva"/);
  assert.match(page, /texto\.includes\("alug"\)/);
  assert.match(page, /texto\.includes\("locac"\)/);
  assert.match(page, /setFluxoForma\("todos"\)/);
});

test('Financeiro oferece filtros de situação verde, amarelo e vermelho e mostra pessoas em dia', () => {
  assert.match(page, /filtroInadimplencia/);
  assert.match(page, /\["verde"/);
  assert.match(page, /\["amarelo"/);
  assert.match(page, /\["vermelho"/);
  assert.match(page, /monitoramentoPessoas/);
  assert.match(page, /const meses = apuracao\?\.meses \|\| 0/);
});

test('apuração automática usa data de associação ou primeira mensalidade paga, sem exigir geração da competência', () => {
  assert.match(page, /pessoa\.data_associacao/);
  assert.match(page, /const primeiroPago = registros/);
  assert.match(page, /cursor\.setMonth\(cursor\.getMonth\(\) \+ 1\)/);
  assert.match(page, /competenciasDevidas\.push\(chave\)/);
});

test('histórico legado de dependente é reconciliado pelo CPF e status pago/baixado é reconhecido', () => {
  assert.match(page, /sociosPorCpf\.get\(cpfDependente\)/);
  assert.match(page, /mensalidadeQuitadaOuIsenta/);
  assert.match(page, /"baixado"/);
  assert.match(page, /"paga"/);
});

test('histórico de mensalidades do Financeiro é paginado acima de 1.000 linhas para localizar pagamentos antigos', () => {
  assert.match(page, /async function buscarMensalidadesPaginadas/);
  assert.match(page, /\.range\(offset, offset \+ tamanhoLote - 1\)/);
  assert.match(page, /if \(lote\.length < tamanhoLote\) return todas/);
  assert.match(page, /\.order\("id", \{ ascending: false \}\)/);
});

test('primeira competência de referência usa pagamento efetivo, não isenção ou cancelamento', () => {
  assert.match(page, /function mensalidadePaga/);
  assert.match(page, /\.filter\(mensalidadePaga\)/);
});
