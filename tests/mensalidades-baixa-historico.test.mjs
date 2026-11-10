import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/mensalidades/page.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../app/api/mensalidades/admin/route.ts', import.meta.url), 'utf8');

test('histórico anual permite selecionar múltiplas competências em aberto para baixa em lote', () => {
  assert.match(page, /mesesHistoricoSelecionadosBaixa/);
  assert.match(page, /Baixar meses do histórico|baixarMesesDoHistorico/);
  assert.match(page, /ids: registros\.map\(\(item\) => item\.id\)/);
  assert.match(page, /Dar baixa em \$\{mesesHistoricoSelecionadosBaixa\.length\} mês\(es\)/);
});

test('mensalidades são preparadas automaticamente e não exigem botão de geração', () => {
  assert.match(page, /mensalidades são criadas automaticamente/);
  assert.doesNotMatch(page, /Gerar mensalidade do mês vigente/);
  assert.doesNotMatch(page, /Gerar selecionadas/);
});

test('competências futuras podem ser preparadas em lote para pagamento antecipado', () => {
  assert.match(page, /acao: \"gerar_lote\", ano, meses: faltantes/);
  assert.match(api, /acao === \"gerar\" \\|\\| acao === \"gerar_mes\" \\|\\| acao === \"gerar_lote\"/);
  assert.match(api, /\.in\(\"competencia\", competencias\)/);
  assert.doesNotMatch(api, /Não é permitido gerar mensalidades de meses futuros/);
});

test('seleção de vários meses carrega em uma chamada e pagina sem truncar acima de 1.000 linhas', () => {
  assert.match(page, /api\/mensalidades\/admin\?ano=\$\{ano\}&meses=/);
  assert.doesNotMatch(page, /Promise\.all\(mesesConsulta\.map/);
  assert.match(api, /url\.searchParams\.get\("meses"\)/);
  assert.match(api, /TAMANHO_PAGINA = 1000/);
  assert.match(api, /\.range\(inicio, inicio \+ TAMANHO_PAGINA - 1\)/);
});
